import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpError, RobotsDisallowedError } from './client';
import { FetchHttpClient, isAllowed, parseRobots } from './fetchClient';

let server: Server;
let base: string;
let flakyHits = 0;
const seenAgents: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    seenAgents.push(req.headers['user-agent'] ?? '');
    switch (req.url) {
      case '/robots.txt':
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('User-agent: *\nDisallow: /private/\nAllow: /private/open\n');
        return;
      case '/ok':
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html>ok</html>');
        return;
      case '/flaky':
        flakyHits += 1;
        if (flakyHits < 3) {
          res.writeHead(503, { 'retry-after': '0' });
          res.end('busy');
          return;
        }
        res.writeHead(200);
        res.end('finally');
        return;
      case '/missing':
        res.writeHead(404);
        res.end('nope');
        return;
      case '/slow':
        setTimeout(() => {
          res.writeHead(200);
          res.end('late');
        }, 1500);
        return;
      default:
        res.writeHead(200);
        res.end(req.url ?? '');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function client(overrides: Partial<ConstructorParameters<typeof FetchHttpClient>[0]> = {}) {
  return new FetchHttpClient({
    userAgent: 'CulturaBA-Test/0.1 (+https://example.test)',
    minDelayMsPerHost: 20,
    timeoutMs: 5_000,
    ...overrides,
  });
}

describe('FetchHttpClient', () => {
  it('fetches and sends the identifying user-agent', async () => {
    const c = client();
    const res = await c.get(`${base}/ok`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('ok');
    expect(seenAgents.at(-1)).toContain('CulturaBA-Test');
    expect(c.stats.requests).toBeGreaterThanOrEqual(2); // robots + page
  });

  it('retries 5xx with backoff and succeeds', async () => {
    flakyHits = 0;
    const c = client({ maxRetries: 3 });
    const res = await c.get(`${base}/flaky`);
    expect(res.body).toBe('finally');
    expect(c.stats.retries).toBe(2);
  }, 20_000);

  it('does not retry a 404 and throws HttpError', async () => {
    const c = client({ maxRetries: 3 });
    await expect(c.get(`${base}/missing`)).rejects.toBeInstanceOf(HttpError);
    expect(c.stats.retries).toBe(0);
    expect(c.stats.failures).toBe(1);
  });

  it('returns a 404 when allowNotFound is set', async () => {
    const res = await client().get(`${base}/missing`, { allowNotFound: true });
    expect(res.status).toBe(404);
  });

  it('times out slow responses', async () => {
    const c = client({ maxRetries: 0, timeoutMs: 200 });
    await expect(c.get(`${base}/slow`)).rejects.toThrow();
  });

  it('respects robots.txt disallow (with allow exceptions)', async () => {
    const c = client();
    await expect(c.get(`${base}/private/secret`)).rejects.toBeInstanceOf(RobotsDisallowedError);
    const open = await c.get(`${base}/private/open`);
    expect(open.body).toBe('/private/open');
  });

  it('spaces requests to the same host', async () => {
    const c = client({ minDelayMsPerHost: 120, respectRobots: false });
    const t0 = Date.now();
    await Promise.all([c.get(`${base}/a`), c.get(`${base}/b`), c.get(`${base}/c`)]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(220);
  });
});

describe('parseRobots / isAllowed', () => {
  const txt = `
    User-agent: Googlebot
    Disallow: /g/

    User-agent: *
    Disallow: /admin/
    Disallow: /api/*.json
    Allow: /admin/public
  `;

  it('picks the * group when our agent has no group', () => {
    const rules = parseRobots(txt, 'CulturaBA-Ingest/0.1');
    expect(rules).toEqual({
      disallow: ['/admin/', '/api/*.json'],
      allow: ['/admin/public'],
    });
    expect(isAllowed(rules as NonNullable<typeof rules>, '/admin/x')).toBe(false);
    expect(isAllowed(rules as NonNullable<typeof rules>, '/admin/public/x')).toBe(true);
    expect(isAllowed(rules as NonNullable<typeof rules>, '/api/events.json')).toBe(false);
    expect(isAllowed(rules as NonNullable<typeof rules>, '/agenda/')).toBe(true);
  });

  it('prefers a group addressed to our product', () => {
    const rules = parseRobots(
      'User-agent: culturaba-ingest\nDisallow: /\n\nUser-agent: *\nDisallow:\n',
      'CulturaBA-Ingest/0.1',
    );
    expect(rules?.disallow).toEqual(['/']);
  });

  it('returns null without any applicable group', () => {
    expect(parseRobots('User-agent: Googlebot\nDisallow: /\n', 'CulturaBA-Ingest/0.1')).toBeNull();
  });
});
