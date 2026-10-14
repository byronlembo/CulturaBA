import PQueue from 'p-queue';
import pRetry, { AbortError } from 'p-retry';
import type { Logger } from '../logger';
import { silentLogger } from '../logger';
import {
  type HttpClient,
  type HttpClientStats,
  HttpError,
  type HttpRequestOptions,
  type HttpResponse,
  newStats,
  RobotsDisallowedError,
} from './client';

export interface FetchHttpClientOptions {
  userAgent: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Peticiones simultáneas por host. */
  concurrencyPerHost?: number;
  /** Espera mínima entre peticiones a un mismo host. */
  minDelayMsPerHost?: number;
  /** Consultar y respetar robots.txt (una vez por host). */
  respectRobots?: boolean;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

interface RobotsRules {
  disallow: string[];
  allow: string[];
}

/**
 * Cliente HTTP "cortés": una cola por host con concurrencia e intervalo mínimo,
 * reintentos con backoff solo ante errores de red / 408 / 429 / 5xx (respetando
 * Retry-After), timeout por petición, User-Agent identificable y robots.txt.
 */
export class FetchHttpClient implements HttpClient {
  readonly stats: HttpClientStats = newStats();
  private readonly queues = new Map<string, PQueue>();
  private readonly robots = new Map<string, Promise<RobotsRules | null>>();
  private readonly options: Required<Omit<FetchHttpClientOptions, 'logger' | 'fetchImpl'>>;
  private readonly logger: Logger;
  private readonly fetchImpl: typeof fetch;

  constructor(options: FetchHttpClientOptions) {
    this.options = {
      userAgent: options.userAgent,
      timeoutMs: options.timeoutMs ?? 20_000,
      maxRetries: options.maxRetries ?? 3,
      concurrencyPerHost: options.concurrencyPerHost ?? 2,
      minDelayMsPerHost: options.minDelayMsPerHost ?? 700,
      respectRobots: options.respectRobots ?? true,
    };
    this.logger = options.logger ?? silentLogger;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async get(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const host = new URL(url).host;
    if (this.options.respectRobots) {
      const rules = await this.robotsFor(host, url);
      if (rules && !isAllowed(rules, new URL(url).pathname)) {
        this.logger.warn({ url }, 'robots.txt disallow — se omite la URL');
        throw new RobotsDisallowedError(url);
      }
    }
    return this.queueFor(host).add(() => this.getWithRetry(url, options)) as Promise<HttpResponse>;
  }

  private queueFor(host: string): PQueue {
    let q = this.queues.get(host);
    if (!q) {
      q = new PQueue({
        concurrency: this.options.concurrencyPerHost,
        interval: this.options.minDelayMsPerHost,
        intervalCap: 1,
      });
      this.queues.set(host, q);
    }
    return q;
  }

  private async getWithRetry(url: string, options: HttpRequestOptions): Promise<HttpResponse> {
    let attempt = 0;
    return pRetry(
      async () => {
        attempt += 1;
        if (attempt > 1) this.stats.retries += 1;
        return this.getOnce(url, options);
      },
      {
        retries: this.options.maxRetries,
        factor: 2,
        minTimeout: 800,
        maxTimeout: 15_000,
        randomize: true,
        onFailedAttempt: (ctx) => {
          this.logger.debug(
            {
              url,
              attempt: ctx.attemptNumber,
              retriesLeft: ctx.retriesLeft,
              err: ctx.error.message,
            },
            'reintento HTTP',
          );
        },
      },
    ).catch((err: unknown) => {
      this.stats.failures += 1;
      throw err;
    });
  }

  private async getOnce(url: string, options: HttpRequestOptions): Promise<HttpResponse> {
    this.stats.requests += 1;
    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'user-agent': this.options.userAgent,
          accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'accept-language': 'es-AR,es;q=0.9',
          ...options.headers,
        },
      });
    } catch (err) {
      // Errores de red y timeouts: reintentables.
      throw err instanceof Error ? err : new Error(String(err));
    }

    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });

    if (res.ok || (res.status === 404 && options.allowNotFound)) {
      return { status: res.status, url: res.url || url, body: await res.text(), headers };
    }

    const error = new HttpError(url, res.status);
    if (RETRYABLE_STATUS.has(res.status)) {
      const retryAfter = Number(res.headers.get('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 60) {
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
      }
      throw error;
    }
    throw new AbortError(error);
  }

  private robotsFor(host: string, sampleUrl: string): Promise<RobotsRules | null> {
    let p = this.robots.get(host);
    if (!p) {
      const robotsUrl = new URL('/robots.txt', sampleUrl).toString();
      p = this.queueFor(host)
        .add(async () => {
          this.stats.requests += 1;
          try {
            const res = await this.fetchImpl(robotsUrl, {
              signal: AbortSignal.timeout(this.options.timeoutMs),
              headers: { 'user-agent': this.options.userAgent },
            });
            if (!res.ok) return null;
            return parseRobots(await res.text(), this.options.userAgent);
          } catch (err) {
            this.logger.debug(
              { robotsUrl, err: (err as Error).message },
              'robots.txt no disponible',
            );
            return null;
          }
        })
        .then((r) => r ?? null);
      this.robots.set(host, p);
    }
    return p;
  }
}

/** Parser mínimo de robots.txt: toma el grupo de nuestro UA o, si no hay, el de '*'. */
export function parseRobots(text: string, userAgent: string): RobotsRules | null {
  const product = userAgent.split('/')[0]?.toLowerCase() ?? '';
  const groups: { agents: string[]; rules: RobotsRules }[] = [];
  let current: { agents: string[]; rules: RobotsRules } | null = null;
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: { disallow: [], allow: [] } };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'disallow' && value) current.rules.disallow.push(value);
    if (key === 'allow' && value) current.rules.allow.push(value);
  }

  const mine = groups.find((g) => g.agents.some((a) => a !== '*' && product.startsWith(a)));
  const star = groups.find((g) => g.agents.includes('*'));
  return (mine ?? star)?.rules ?? null;
}

export function isAllowed(rules: RobotsRules, pathname: string): boolean {
  const matches = (pattern: string) => {
    const p = pattern.replace(/\$$/, '');
    if (pattern.includes('*')) {
      const re = new RegExp(`^${p.split('*').map(escapeRe).join('.*')}`);
      return re.test(pathname);
    }
    return pathname.startsWith(p);
  };
  const longest = (list: string[]) =>
    list.filter(matches).reduce((max, p) => Math.max(max, p.length), -1);
  const allow = longest(rules.allow);
  const disallow = longest(rules.disallow);
  return disallow < 0 || allow >= disallow;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
