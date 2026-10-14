import {
  canonicalUrl,
  detectStatusEs,
  htmlToText,
  isPageKey,
  type NormalizedEventInput,
  NormalizedEventSchema,
  type ParsedOccurrenceStatus,
  type Price,
  stripDiacriticsLower,
} from '@culturaba/shared';
import { z } from 'zod';
import {
  fail,
  ok,
  type ParseContext,
  type ParseResult,
  type RawRecord,
} from '../../core/connector';
import { isSharedTicketKey } from '../../core/matcher';
import { buildOccurrences, isExhibition, parseInstants } from './dates';
import { cleanEtiqueta, etiquetaKey, mapDisciplines, PERFORMING_ETIQUETAS } from './disciplines';
import { hostOf, SEED_INSTITUTION_HOSTS } from './institutions';
import { clean, resolvePlace } from './venues';

export const SOURCE_SLUG = 'agenda-ba';
export const LINDA_BASE_URL = 'https://linda.buenosaires.gob.ar/';
export const ATTRIBUTION = 'Texto: Linda, agenda oficial de la Ciudad de Buenos Aires';

/**
 * Texto con el que la página pública del evento muestra `acceso: "sin_costo"`
 * ("Entrada" → "Libre y gratuita"; verificado en el detalle de jorge-lavelli, fixture 025).
 */
export const FREE_ACCESS_TEXT = 'Libre y gratuita';

/** Aviso legal de la plataforma que Linda agrega como último componente de eventos de privados. */
const PLATFORM_DISCLAIMER_RE = /^Este es un espacio de difusi[oó]n abierto y gratuito\b/;

const RAW_FRAGMENT_MAX = 200_000;

/** Evento tal como lo devuelve /api/frontend/events/filter (solo los campos que se usan). */
export const LindaEventSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  drupalNid: z.number().nullish(),
  title: z.string(),
  description: z.string().nullish(),
  componentes: z.array(z.string()).nullish(),
  imageUrl: z.string().nullish(),
  fechasDelEvento: z.array(z.string()).nullish(),
  horarios: z.array(z.object({ dia: z.string(), hora: z.string() })).nullish(),
  acceso: z.string().nullish(),
  etiquetas: z.array(z.string()).nullish(),
  tipoEvento: z.string().nullish(),
  lugar: z.string().nullish(),
  ubicacion: z
    .object({
      titulo: z.string().nullish(),
      direccion: z.string().nullish(),
      latitud: z.number().nullish(),
      longitud: z.number().nullish(),
    })
    .nullish(),
  direccion: z.string().nullish(),
  barrio: z.string().nullish(),
  botonesSidebar: z.array(z.object({ uri: z.string(), title: z.string().nullish() })).nullish(),
});
export type LindaEvent = z.infer<typeof LindaEventSchema>;

/** Página pública del evento: https://linda.buenosaires.gob.ar/eventos/<slug> (fixtures 025–030). */
export function eventPageUrl(slug: string): string {
  return `${LINDA_BASE_URL}eventos/${encodeURIComponent(slug)}`;
}

const TRACKING_PARAM_RE =
  /^(?:utm_|gad_|gclid$|gbraid$|wbraid$|fbclid$|dclid$|mc_cid$|mc_eid$|_gl$|_ga$)/i;

/**
 * URL sin parámetros de campaña (gclid, gad_*, utm_*, fbclid…) ni fragmento. El resto de
 * la query se conserva textual (sin re-codificar). Null si no es http(s).
 */
export function cleanTrackingUrl(href: string | null | undefined): string | null {
  const s = (href ?? '').trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const kept = u.search
    .replace(/^\?/, '')
    .split('&')
    .filter((part) => part && !TRACKING_PARAM_RE.test(decodeURIComponentSafe(part.split('=')[0])));
  u.search = kept.length ? `?${kept.join('&')}` : '';
  u.hash = '';
  return u.toString();
}

function decodeURIComponentSafe(s: string | undefined): string {
  try {
    return decodeURIComponent(s ?? '');
  } catch {
    return s ?? '';
  }
}

/** Botones que llevan a conseguir lugar: "Entradas", "Inscribite acá", "Inscripción(es)". */
const TICKET_BUTTON_RE = /^(?:entradas?|inscrib|inscripci)/;

export function pickTicketsUrl(buttons: LindaEvent['botonesSidebar']): string | null {
  for (const b of buttons ?? []) {
    const label = etiquetaKey(b.title ?? '');
    if (!TICKET_BUTTON_RE.test(label)) continue;
    const url = cleanTrackingUrl(b.uri);
    if (url) return url;
  }
  return null;
}

/**
 * Enlaces del evento que identifican la misma producción en otra fuente: la ficha en el
 * sitio de una institución con conector propio (Linda los rotula "Entradas") y la página
 * de la ticketera oficial de la Ciudad con id de evento o visita. Sirven para deduplicar.
 */
export function sameAsLinks(buttons: LindaEvent['botonesSidebar']): string[] {
  const out = new Set<string>();
  for (const b of buttons ?? []) {
    const url = cleanTrackingUrl(b.uri);
    if (!url) continue;
    const host = hostOf(url);
    const key = canonicalUrl(url);
    const institutional = host !== null && host in SEED_INSTITUTION_HOSTS && isPageKey(key);
    if (institutional || isSharedTicketKey(key)) out.add(url);
  }
  return [...out].slice(0, 20);
}

function absoluteHttpUrl(value: string | null | undefined): string | null {
  const s = (value ?? '').trim();
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    return new URL(s).toString();
  } catch {
    return null;
  }
}

function plain(html: string | null | undefined): string {
  // htmlToText corta líneas en </p>, </li>, </h*> y <br>; Linda además usa
  // <details><summary>Reparto</summary>… y <hr>, que sin esto quedarían pegados ("RepartoAlumnos").
  const prepared = (html ?? '')
    .replace(/<\/(?:summary|details)\s*>/gi, '$&<br>')
    .replace(/<hr\s*\/?>/gi, '<br>');
  return htmlToText(prepared)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !PLATFORM_DISCLAIMER_RE.test(line))
    .join('\n');
}

/** Descripción corta + componentes (cuerpo), en texto plano y sin el aviso legal de la plataforma. */
export function descriptionText(item: Pick<LindaEvent, 'description' | 'componentes'>): string {
  return [plain(item.description), ...(item.componentes ?? []).map(plain)]
    .filter((p) => p.length > 0)
    .join('\n\n');
}

// Línea de precio en prosa: "🎟️ Entrada: $58.000", "Valor de las localidades: Platea $ 26.000",
// "Bono contribución: $10.000", "Actividad arancelada $10.000". Debe empezar con la etiqueta.
const PRICE_LABEL_RE =
  /^(?:entradas?|valor(?:es)?(?: de (?:las )?(?:localidades|entradas))?|precios?|tarifas?|bono contribucion|actividad arancelada)\b/;
const PRICE_AMOUNT_RE = /\$\s?\d/;
const PRICE_LINE_MAX = 300;

/**
 * Primera línea del texto que publica un precio con monto, tal cual (sin el emoji inicial).
 * Solo se usa para eventos con `acceso: "con_entrada_paga"`. Null si no hay.
 */
export function extractPriceText(bodyText: string): string | null {
  for (const rawLine of bodyText.split('\n')) {
    const line = rawLine.replace(/^[^\p{L}\p{N}$]+/u, '').trim();
    if (!line || line.length > PRICE_LINE_MAX) continue;
    const norm = stripDiacriticsLower(line);
    if (PRICE_LABEL_RE.test(norm) && PRICE_AMOUNT_RE.test(line)) return line;
  }
  return null;
}

/**
 * Estado afirmable: SOLO desde el título. Las descripciones traen "agotado"/"sold out"
 * biográficos o desactualizados (babasonicos habla de funciones de junio; aitana, paulo-londra…
 * de giras pasadas) y "será reprogramada" condicional: no se usan.
 */
export function statusFromTitle(title: string): ParsedOccurrenceStatus {
  const s = detectStatusEs(title);
  return s === 'cancelled' || s === 'postponed' || s === 'sold_out' ? s : 'scheduled';
}

export function buildEvent(raw: RawRecord, _ctx: ParseContext): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw.body);
  } catch (err) {
    return fail([`JSON inválido: ${(err as Error).message}`]);
  }
  const parsed = LindaEventSchema.safeParse(json);
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const item = parsed.data;
  const warnings: string[] = [];

  const title = clean(item.title);
  const officialUrl = eventPageUrl(item.slug);
  if (!title) return fail(['sin título'], { url: officialUrl });

  const links = (item.botonesSidebar ?? []).map((b) => b.uri);
  const place = resolvePlace({
    title: item.ubicacion?.titulo,
    address: item.ubicacion?.direccion ?? item.direccion,
    barrio: item.barrio,
    links,
    officialUrl,
  });
  warnings.push(...place.warnings);

  const summary = plain(item.description);
  const body = descriptionText(item);
  const etiquetas = (item.etiquetas ?? []).map(cleanEtiqueta).filter((e) => e.length > 0);
  const etiquetaKeys = etiquetas.map(etiquetaKey);

  const { instants, warnings: instantWarnings } = parseInstants(item.fechasDelEvento ?? []);
  warnings.push(...instantWarnings);
  const exhibition = isExhibition({
    title,
    summary,
    etiquetaKeys,
    lugar: item.lugar,
    distinctDays: new Set(instants.map((i) => i.localDate)).size,
    performingEtiquetas: PERFORMING_ETIQUETAS,
  });

  const { disciplines, warnings: disciplineWarnings } = mapDisciplines({
    etiquetas,
    tipoEvento: item.tipoEvento,
    lugar: item.lugar,
    title,
    institutionSlug: place.institution.slug,
    isExhibition: exhibition,
  });
  warnings.push(...disciplineWarnings);

  // Gratuidad: única señal estructurada es `acceso` (`precio` viene siempre null). Monto
  // solo si el texto publica una línea de precio literal, y solo para eventos pagos.
  const free = item.acceso === 'sin_costo';
  const paid = item.acceso === 'con_entrada_paga';
  if (!free && !paid) warnings.push(`acceso desconocido: ${JSON.stringify(item.acceso ?? null)}`);
  const paidPriceText = paid ? extractPriceText(body) : null;
  const price: Price | null = free
    ? { text: FREE_ACCESS_TEXT, isFree: true, verified: true }
    : paidPriceText
      ? { text: paidPriceText, verified: true }
      : null;

  const ticketsUrl = pickTicketsUrl(item.botonesSidebar);
  const status = statusFromTitle(title);
  const { occurrences, warnings: occurrenceWarnings } = buildOccurrences(instants, {
    eventId: item.id,
    exhibition,
    venue: place.venue,
    ticketsUrl,
    price,
    status,
    ...(status !== 'scheduled' ? { statusReason: title } : {}),
    bodyText: body,
  });
  warnings.push(...occurrenceWarnings);

  const imageUrl = absoluteHttpUrl(item.imageUrl);
  const institution = place.institution;

  const event: NormalizedEventInput = {
    source: SOURCE_SLUG,
    externalId: item.id,
    url: officialUrl,
    capturedAt: raw.fetchedAt,
    title,
    ...(body ? { description: body } : {}),
    attribution: ATTRIBUTION,
    disciplines,
    institutionSlug: institution.slug,
    ...(institution.name ? { institutionName: institution.name } : {}),
    ...(institution.url ? { institutionUrl: institution.url } : {}),
    officialUrl,
    sameAsUrls: sameAsLinks(item.botonesSidebar),
    ...(ticketsUrl ? { ticketsUrl } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(free ? { priceText: FREE_ACCESS_TEXT, isFree: true, priceVerified: true } : {}),
    ...(paid ? { isFree: false } : {}),
    ...(paidPriceText ? { priceText: paidPriceText, priceVerified: true } : {}),
    tags: [...new Set(etiquetas)],
    occurrences,
    rawFragment: raw.body.slice(0, RAW_FRAGMENT_MAX),
  };

  const validated = NormalizedEventSchema.safeParse(event);
  if (!validated.success) {
    return fail(
      validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      event as never,
    );
  }
  return ok(validated.data, warnings);
}
