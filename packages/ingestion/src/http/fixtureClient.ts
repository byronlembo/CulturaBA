import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalUrl,
  FixtureMissingError,
  type HttpClient,
  type HttpClientStats,
  HttpError,
  type HttpRequestOptions,
  type HttpResponse,
  newStats,
} from './client';
import { type FixtureManifest, readManifest } from './fixtures';

/** Sirve respuestas grabadas. Una URL desconocida falla fuerte: los tests no deben "pasar por casualidad". */
export class FixtureHttpClient implements HttpClient {
  readonly stats: HttpClientStats = newStats();
  private readonly byUrl = new Map<
    string,
    { file: string; status: number; contentType: string; finalUrl?: string }
  >();

  constructor(
    private readonly dir: string,
    manifest: FixtureManifest = readManifest(dir),
  ) {
    for (const e of manifest.entries) {
      const entry: { file: string; status: number; contentType: string; finalUrl?: string } = {
        file: e.file,
        status: e.status,
        contentType: e.contentType,
      };
      if (e.finalUrl !== undefined) entry.finalUrl = e.finalUrl;
      this.byUrl.set(canonicalUrl(e.url), entry);
    }
  }

  async get(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    this.stats.requests += 1;
    const entry = this.byUrl.get(canonicalUrl(url));
    if (!entry) {
      this.stats.failures += 1;
      throw new FixtureMissingError(url);
    }
    const body = readFileSync(join(this.dir, entry.file), 'utf8');
    if (entry.status >= 400 && !(entry.status === 404 && options.allowNotFound)) {
      this.stats.failures += 1;
      throw new HttpError(url, entry.status);
    }
    return {
      status: entry.status,
      url: entry.finalUrl ?? url,
      body,
      headers: { 'content-type': entry.contentType },
    };
  }
}
