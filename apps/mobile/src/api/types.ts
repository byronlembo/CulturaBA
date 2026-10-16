import type { Database } from '@culturaba/shared';

/** Filas tal como las devuelven las vistas públicas (PostgREST o la API de desarrollo). */
export type EventPublicRow = Database['public']['Views']['v_events_public']['Row'];
export type OccurrencePublicRow = Database['public']['Views']['v_occurrences_public']['Row'];
export type EventSourcePublicRow = Database['public']['Views']['v_event_sources_public']['Row'];

export type OccurrenceKind = 'timed' | 'all_day' | 'range';
export type OccurrenceStatus = Database['public']['Enums']['occurrence_status'];

export interface EventSummary {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  primaryDiscipline: string | null;
  disciplines: string[];
  imageUrl: string | null;
  imageSource: 'source' | 'fallback';
  institutionName: string;
  venueName: string | null;
  /** Coordenadas de la sala publicadas por la fuente (mapa y cercanía). */
  venueLat: number | null;
  venueLng: number | null;
  nextStartsAt: string | null;
  /** Tipo de la ocurrencia que aporta nextStartsAt: un rango se muestra "Del … al …". */
  nextKind: OccurrenceKind | null;
  nextEndsAt: string | null;
  lastEndsAt: string | null;
  upcomingCount: number;
  isOngoing: boolean;
  attendingCount: number;
  recommendCount: number;
  saveCount: number;
  isFree: boolean | null;
  priceText: string | null;
  priceVerified: boolean;
}

export interface EventDetail extends EventSummary {
  description: string | null;
  descriptionAttribution: string | null;
  aiSummary: string | null;
  imageCredit: string | null;
  officialUrl: string | null;
  ticketsUrl: string | null;
  venueAddress: string | null;
  venueNeighborhood: string | null;
  lastVerifiedAt: string | null;
  language: string | null;
  durationMinutes: number | null;
  ageRating: string | null;
  tags: string[];
}

export interface Occurrence {
  id: string;
  eventId: string;
  kind: OccurrenceKind;
  startsAt: string;
  endsAt: string | null;
  startDate: string;
  endDate: string;
  isAllDay: boolean;
  scheduleText: string | null;
  status: OccurrenceStatus;
  previousStartsAt: string | null;
  statusReason: string | null;
  ticketsUrl: string | null;
  priceText: string | null;
  priceVerified: boolean;
  isFree: boolean | null;
  room: string | null;
  venueName: string | null;
  venueAddress: string | null;
  /** Coordenadas publicadas por la fuente; sin ellas no hay check-in. */
  venueLat: number | null;
  venueLng: number | null;
}

export interface CalendarOccurrence extends Occurrence {
  eventSlug: string;
  eventTitle: string;
  primaryDiscipline: string | null;
  disciplines: string[];
  imageUrl: string | null;
  imageSource: 'source' | 'fallback';
  institutionName: string;
}

export interface EventSource {
  sourceSlug: string;
  sourceName: string;
  sourceUrl: string;
  lastSeenAt: string;
}

export interface SourceInfo {
  slug: string;
  name: string;
  baseUrl: string;
}

export interface CatalogFilters {
  q?: string;
  disciplines?: string[];
  from?: string;
  to?: string;
  freeOnly?: boolean;
}

export interface Page<T> {
  items: T[];
  nextOffset: number | null;
}

export interface EventStats {
  attending: number;
  recommend: number;
  save: number;
}

export interface CatalogApi {
  listEvents(
    filters: CatalogFilters,
    page: { offset: number; limit: number },
  ): Promise<Page<EventSummary>>;
  listEventsByIds(ids: string[]): Promise<EventSummary[]>;
  getEvent(slugOrId: string): Promise<EventDetail | null>;
  listOccurrences(eventId: string): Promise<Occurrence[]>;
  listEventSources(eventId: string): Promise<EventSource[]>;
  listCalendar(
    range: { from: string; to: string },
    disciplines?: string[],
  ): Promise<CalendarOccurrence[]>;
  getStats(eventId: string): Promise<EventStats>;
  listSources(): Promise<SourceInfo[]>;
}

export type UserAction = 'attending' | 'recommend' | 'save';

export interface UserActionRecord {
  eventId: string;
  action: UserAction;
  createdAt: string;
}

/** Una función a la que el usuario fue (diario privado). */
export interface DiaryEntry {
  id: string;
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  discipline: string | null;
  venueName: string | null;
  /** Fecha local de Buenos Aires (YYYY-MM-DD). */
  attendedOn: string;
  rating: number | null;
  review: string | null;
}

export interface DiaryInput {
  attendedOn: string;
  occurrenceId: string | null;
  rating: number | null;
  review: string | null;
}

export interface PointsMove {
  delta: number;
  reason: 'check_in' | 'redeem' | 'adjust';
  note: string | null;
  createdAt: string;
}

export interface Reward {
  id: string;
  title: string;
  description: string | null;
  terms: string | null;
  cost: number;
  stock: number | null;
  validUntil: string | null;
}

export interface Redemption {
  id: string;
  rewardTitle: string;
  code: string;
  cost: number;
  createdAt: string;
  usedAt: string | null;
}

export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
}

export interface UserApi {
  readonly kind: 'supabase' | 'local';
  /** Id del usuario de Supabase, o 'local'. Separa el caché entre cuentas. */
  readonly id: string;
  getInterests(): Promise<string[]>;
  setInterests(slugs: string[]): Promise<void>;
  listActions(): Promise<UserActionRecord[]>;
  addAction(eventId: string, action: UserAction): Promise<void>;
  removeAction(eventId: string, action: UserAction): Promise<void>;
  listDiary(): Promise<DiaryEntry[]>;
  addDiaryEntry(eventId: string, input: DiaryInput): Promise<void>;
  updateDiaryEntry(id: string, input: Pick<DiaryInput, 'rating' | 'review'>): Promise<void>;
  deleteDiaryEntry(id: string): Promise<void>;
  checkIn(occurrenceId: string, at: Position): Promise<{ points: number; balance: number }>;
  getPoints(): Promise<{ balance: number; moves: PointsMove[] }>;
  listRewards(): Promise<Reward[]>;
  redeemReward(rewardId: string): Promise<{ code: string; balance: number }>;
  listRedemptions(): Promise<Redemption[]>;
}

// ── Mapeo de filas ──────────────────────────────────────────────────────────

export function mapEventSummary(r: EventPublicRow): EventSummary {
  return {
    id: r.id ?? '',
    slug: r.slug ?? '',
    title: r.title ?? '',
    subtitle: r.subtitle,
    primaryDiscipline: r.primary_discipline,
    disciplines: r.disciplines ?? [],
    imageUrl: r.image_url,
    imageSource: (r.image_source ?? 'fallback') as 'source' | 'fallback',
    institutionName: r.institution_name ?? '',
    venueName: r.venue_name,
    venueLat: r.venue_lat,
    venueLng: r.venue_lng,
    nextStartsAt: r.next_starts_at,
    nextKind: (r.next_kind ?? null) as OccurrenceKind | null,
    nextEndsAt: r.next_ends_at,
    lastEndsAt: r.last_ends_at,
    upcomingCount: r.upcoming_count ?? 0,
    isOngoing: r.is_ongoing ?? false,
    attendingCount: r.attending_count ?? 0,
    recommendCount: r.recommend_count ?? 0,
    saveCount: r.save_count ?? 0,
    isFree: r.is_free,
    priceText: r.price_text,
    priceVerified: r.price_verified ?? false,
  };
}

export function mapEventDetail(r: EventPublicRow): EventDetail {
  return {
    ...mapEventSummary(r),
    description: r.description,
    descriptionAttribution: r.description_attribution,
    aiSummary: r.ai_summary,
    imageCredit: r.image_credit,
    officialUrl: r.official_url,
    ticketsUrl: r.tickets_url,
    venueAddress: r.venue_address,
    venueNeighborhood: r.venue_neighborhood,
    lastVerifiedAt: r.last_verified_at,
    language: r.language,
    durationMinutes: r.duration_minutes,
    ageRating: r.age_rating,
    tags: r.tags ?? [],
  };
}

export function mapOccurrence(r: OccurrencePublicRow): CalendarOccurrence {
  return {
    id: r.id ?? '',
    eventId: r.event_id ?? '',
    kind: (r.kind ?? 'timed') as OccurrenceKind,
    startsAt: r.starts_at ?? '',
    endsAt: r.ends_at,
    // PostgREST entrega 'YYYY-MM-DD'; otros orígenes pueden mandar un timestamp.
    startDate: (r.start_date ?? '').slice(0, 10),
    endDate: (r.end_date ?? '').slice(0, 10),
    isAllDay: r.is_all_day ?? false,
    scheduleText: r.schedule_text,
    status: (r.status ?? 'scheduled') as OccurrenceStatus,
    previousStartsAt: r.previous_starts_at,
    statusReason: r.status_reason,
    ticketsUrl: r.tickets_url,
    priceText: r.price_text,
    priceVerified: r.price_verified ?? false,
    isFree: r.is_free,
    room: r.room,
    venueName: r.venue_name,
    venueAddress: r.venue_address,
    venueLat: r.venue_lat,
    venueLng: r.venue_lng,
    eventSlug: r.event_slug ?? '',
    eventTitle: r.event_title ?? '',
    primaryDiscipline: r.primary_discipline,
    disciplines: r.disciplines ?? [],
    imageUrl: r.image_url,
    imageSource: (r.image_source ?? 'fallback') as 'source' | 'fallback',
    institutionName: r.institution_name ?? '',
  };
}

export function mapEventSource(r: EventSourcePublicRow): EventSource {
  return {
    sourceSlug: r.source_slug ?? '',
    sourceName: r.source_name ?? '',
    sourceUrl: r.source_url ?? '',
    lastSeenAt: r.last_seen_at ?? '',
  };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
