/** Contrato mínimo de HTTP que usan los conectores. Tres implementaciones:
 *  FetchHttpClient (vivo), FixtureHttpClient (offline), RecordingHttpClient (vivo + graba). */

export interface HttpRequestOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Si true, un 404 devuelve la respuesta en vez de lanzar HttpError. */
  allowNotFound?: boolean;
}

export interface HttpResponse {
  status: number;
  /** URL final tras redirecciones. */
  url: string;
  body: string;
  headers: Record<string, string>;
}

export interface HttpClientStats {
  requests: number;
  retries: number;
  failures: number;
}

export interface HttpClient {
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  readonly stats: HttpClientStats;
}

export class HttpError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} en ${url}`);
    this.name = 'HttpError';
  }
}

export class RobotsDisallowedError extends Error {
  constructor(public readonly url: string) {
    super(`robots.txt no permite ${url}`);
    this.name = 'RobotsDisallowedError';
  }
}

export class FixtureMissingError extends Error {
  constructor(public readonly url: string) {
    super(`No hay fixture para ${url}`);
    this.name = 'FixtureMissingError';
  }
}

export function newStats(): HttpClientStats {
  return { requests: 0, retries: 0, failures: 0 };
}

/** Normaliza una URL para usarla como clave de fixtures/caché. */
export function canonicalUrl(url: string): string {
  const u = new URL(url);
  u.hash = '';
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.toString();
}
