#!/usr/bin/env node
/**
 * Smoke test visual de la app (export web) con Playwright: recorre onboarding,
 * feed, ficha, acciones sociales, búsqueda, calendario y deep link, y guarda
 * capturas a tamaño teléfono. Los títulos esperados salen del mismo catálogo que
 * usa la app, así que sirve con datos reales o sintéticos.
 *
 * Contra Supabase (la export se construye con apps/mobile/.env apuntando al proyecto):
 *   SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… node scripts/screenshot-web.cjs
 * Contra la API de desarrollo (export con EXPO_PUBLIC_API_MODE=dev):
 *   pnpm dev:api   # terminal aparte
 *   node scripts/screenshot-web.cjs
 *
 *   pnpm --filter @culturaba/mobile export:web
 *   node scripts/serve-dist.mjs apps/mobile/dist 3000
 *   node scripts/screenshot-web.cjs [baseUrl=http://localhost:3000] [outDir=docs/screenshots]
 *
 * Requiere el paquete `playwright` resoluble (NODE_PATH=... si es global). Detrás de un
 * proxy HTTP, Chromium usa HTTPS_PROXY; Node necesita NODE_USE_ENV_PROXY=1.
 */
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');

const base = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3] ?? 'docs/screenshots';
const devApi = process.env.DEV_API_URL ?? 'http://localhost:8787';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
mkdirSync(out, { recursive: true });

const INTERESTS = [
  { label: 'Ópera y música clásica', slug: 'opera_clasica' },
  { label: 'Teatro y artes escénicas', slug: 'teatro_escenicas' },
];

/** Próximos eventos publicados, en el mismo orden que el feed de la app. */
async function upcoming({ disciplines = [], limit = 30 } = {}) {
  if (supabaseUrl && supabaseKey) {
    const p = new URLSearchParams({
      select: 'slug,title',
      next_starts_at: 'not.is.null',
      order: 'next_starts_at.asc,id.asc',
      limit: String(limit),
    });
    if (disciplines.length) p.set('disciplines', `ov.{${disciplines.join(',')}}`);
    const r = await fetch(`${supabaseUrl}/rest/v1/v_events_public?${p}`, {
      headers: { apikey: supabaseKey, authorization: `Bearer ${supabaseKey}` },
    });
    if (!r.ok) throw new Error(`catálogo Supabase: HTTP ${r.status}`);
    return r.json();
  }
  const p = new URLSearchParams({ limit: String(limit) });
  if (disciplines.length) p.set('disciplines', disciplines.join(','));
  const r = await fetch(`${devApi}/events?${p}`);
  if (!r.ok) throw new Error(`devapi: HTTP ${r.status}`);
  return r.json();
}

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Un evento cuyo título tiene una palabra que no aparece en el título de `other`. */
function searchTarget(events, other) {
  for (const e of events) {
    if (e.slug === other.slug) continue;
    const words = fold(e.title)
      .split(/[^a-z0-9ñ]+/)
      .filter((w) => w.length >= 6)
      .sort((a, b) => b.length - a.length);
    const word = words.find((w) => !fold(other.title).includes(w));
    if (word) return { event: e, word };
  }
  throw new Error('no hay un título con una palabra distintiva para buscar');
}

const shot = async (page, name) => {
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: false });
  console.log(`✓ ${name}`);
};

(async () => {
  const feed = await upcoming({ disciplines: INTERESTS.map((i) => i.slug), limit: 5 });
  const all = await upcoming({ limit: 30 });
  if (feed.length === 0 || all.length < 2)
    throw new Error('el catálogo no tiene eventos suficientes');
  const first = feed[0];
  const search = searchTarget(all, all[0]);
  console.log(`feed: «${first.title}» · búsqueda: «${search.word}» → «${search.event.title}»`);

  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  // Solo HTTPS por el proxy: el servidor local (http://localhost) va directo.
  const browser = await chromium.launch(
    proxy ? { args: [`--proxy-server=https=${proxy.replace(/^https?:\/\//, '')}`] } : {},
  );
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: 'es-AR',
  });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('console.error:', m.text());
  });

  // 1. Onboarding
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.getByText('Descubrí qué ver esta semana').waitFor({ timeout: 15000 });
  await shot(page, '01-welcome');
  await page.getByText('Empezar').click();
  await page.getByText('¿Qué te interesa?').waitFor();
  for (const i of INTERESTS) await page.getByText(i.label).click();
  await shot(page, '02-interests');
  await page.getByText('Ver mi agenda').click();

  // 2. Para vos
  await page.getByText(first.title).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800); // imágenes
  await shot(page, '03-for-you');

  // 3. Ficha + acciones sociales
  await page.getByText(first.title).first().click();
  await page.getByText('Fechas', { exact: true }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  await shot(page, '04-event');
  await page.getByRole('button', { name: /^Guardar/ }).click();
  await page.getByRole('button', { name: /^Asistiré/ }).click();
  await page.waitForTimeout(600);
  await shot(page, '05-event-actions');

  // 4. Guardados (deep link directo a la pestaña)
  await page.goto(`${base}/guardados`, { waitUntil: 'networkidle' });
  await page.getByText(first.title).first().waitFor({ timeout: 15000 });
  await shot(page, '06-saved');

  // 5. Explorar con búsqueda: el primer resultado sin filtro desaparece al buscar.
  await page.goto(`${base}/explorar`, { waitUntil: 'networkidle' });
  await page.getByText(all[0].title).first().waitFor({ timeout: 15000 });
  await page.getByPlaceholder('Título, institución, artista…').fill(search.word);
  // Tras el debounce, la búsqueda refetchea: esperar a que termine antes de afirmar.
  await page.getByText(all[0].title).first().waitFor({ state: 'hidden', timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await page.getByText(search.event.title).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  await shot(page, '07-explore-search');

  // 6. Calendario
  await page.goto(`${base}/calendario`, { waitUntil: 'networkidle' });
  await page.getByText('Próximos 30 días').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  await shot(page, '08-calendar');

  // 7. Deep link en frío a una ficha por slug
  await page.goto(`${base}/event/${search.event.slug}`, { waitUntil: 'networkidle' });
  await page.getByText('Fechas', { exact: true }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  await shot(page, '09-deeplink');

  await browser.close();
  console.log('OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
