import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalUrl,
  type HttpClient,
  type HttpClientStats,
  HttpError,
  type HttpRequestOptions,
  type HttpResponse,
} from './client';
import { type FixtureEntry, type FixtureManifest, readManifest, writeManifest } from './fixtures';

/** Envuelve un cliente vivo y guarda cada respuesta como fixture (manifest + archivo). */
export class RecordingHttpClient implements HttpClient {
  private readonly manifest: FixtureManifest;
  private counter: number;

  constructor(
    private readonly inner: HttpClient,
    private readonly dir: string,
    source: string,
  ) {
    mkdirSync(dir, { recursive: true });
    this.manifest = existsSync(join(dir, 'manifest.json'))
      ? readManifest(dir)
      : { source, capturedAt: new Date().toISOString(), entries: [] };
    this.counter = this.manifest.entries.length;
  }

  get stats(): HttpClientStats {
    return this.inner.stats;
  }

  async get(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const key = canonicalUrl(url);
    const existing = this.manifest.entries.find((e) => canonicalUrl(e.url) === key);
    if (existing) {
      // Ya grabada en esta sesión/set: no volver a pedirla.
      const { readFileSync } = await import('node:fs');
      return {
        status: existing.status,
        url: existing.finalUrl ?? url,
        body: readFileSync(join(this.dir, existing.file), 'utf8'),
        headers: { 'content-type': existing.contentType },
      };
    }

    let response: HttpResponse;
    try {
      response = await this.inner.get(url, options);
    } catch (err) {
      if (err instanceof HttpError) {
        this.record(url, { status: err.status, url, body: '', headers: {} });
      }
      throw err;
    }
    this.record(url, response);
    return response;
  }

  private record(url: string, response: HttpResponse): void {
    this.counter += 1;
    const contentType = response.headers['content-type'] ?? 'text/html; charset=utf-8';
    const ext = contentType.includes('json')
      ? 'json'
      : contentType.includes('xml')
        ? 'xml'
        : 'html';
    const slug =
      new URL(url).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'root';
    const file = `${String(this.counter).padStart(3, '0')}-${slug.slice(0, 80)}.${ext}`;
    writeFileSync(join(this.dir, file), response.body);
    const entry: FixtureEntry = {
      url,
      file,
      status: response.status,
      contentType,
      capturedAt: new Date().toISOString(),
    };
    if (response.url && canonicalUrl(response.url) !== canonicalUrl(url))
      entry.finalUrl = response.url;
    this.manifest.entries.push(entry);
    writeManifest(this.dir, this.manifest);
  }
}
