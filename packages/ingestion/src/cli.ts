import { BA_TZ } from '@culturaba/shared';
import { Command } from 'commander';
import { DateTime } from 'luxon';
import { loadConfig, requireDatabaseUrl } from './config';
import { CONNECTORS, getConnector, productionConnectors } from './connectors/index';
import type { SourceConnector } from './core/connector';
import { type RunSummary, runSource } from './core/pipeline';
import { archivePastEvents, listRecentRuns, listSources } from './db/repo';
import { createSql } from './db/sql';
import type { HttpClient } from './http/client';
import { FetchHttpClient } from './http/fetchClient';
import { FixtureHttpClient } from './http/fixtureClient';
import { fixtureSetDir, listFixtureSets, resolveFixtureSet } from './http/fixtures';
import { RecordingHttpClient } from './http/recordingClient';
import { createLogger } from './logger';

const program = new Command();
program.name('culturaba-ingest').description('Worker de ingestión de CulturaBA');

function liveClient(
  connector: SourceConnector,
  logger: ReturnType<typeof createLogger>,
): HttpClient {
  const config = loadConfig();
  return new FetchHttpClient({
    userAgent: config.INGEST_USER_AGENT,
    timeoutMs: Math.max(config.HTTP_TIMEOUT_MS, connector.meta.politeness.timeoutMs),
    maxRetries: config.HTTP_MAX_RETRIES,
    concurrencyPerHost: connector.meta.politeness.concurrency,
    minDelayMsPerHost: connector.meta.politeness.minDelayMs,
    logger,
  });
}

program
  .command('list-sources')
  .description('Conectores registrados y estado en la base de datos')
  .action(async () => {
    const config = loadConfig();
    const rows = CONNECTORS.map((c) => ({
      slug: c.slug,
      name: c.meta.name,
      kind: c.meta.kind,
      ready: c.meta.ready ? 'sí' : c.meta.blockedReason ? 'bloqueado' : 'pendiente',
      fixtures: listFixtureSets(c.slug).join(', ') || '—',
    }));
    console.table(rows);
    if (!config.DATABASE_URL) return;
    const sql = createSql(config.DATABASE_URL);
    try {
      const sources = await listSources(sql);
      console.table(
        sources.map((s) => ({
          slug: s.slug,
          enabled: s.enabled,
          priority: s.priority,
          base_url: s.base_url,
        })),
      );
      const runs = await listRecentRuns(sql, 10);
      console.table(
        runs.map((r) => ({
          source: r.source_slug,
          status: r.status,
          trigger: r.trigger,
          started: r.started_at,
          discovered: (r.stats as { discovered?: number }).discovered ?? '',
          created: (r.stats as { events_created?: number }).events_created ?? '',
          major: (r.stats as { changes_major?: number }).changes_major ?? '',
        })),
      );
    } finally {
      await sql.end();
    }
  });

program
  .command('run')
  .description('Ejecutar uno o todos los conectores')
  .option('-s, --source <slug>', 'conector a ejecutar')
  .option('-a, --all', 'todos los conectores de producción')
  .option('--dry-run', 'ejecutar todo pero no persistir nada')
  .option(
    '--from-fixture <set>',
    'usar fixtures grabados en lugar de la red (nombre del set o "latest")',
  )
  .option('--limit <n>', 'procesar como máximo N ítems', (v) => Number.parseInt(v, 10))
  .option('--trigger <trigger>', 'manual | cron', 'manual')
  .option('--force', 'correr aunque la fuente esté deshabilitada')
  .option('--json', 'imprimir el resumen en JSON')
  .action(
    async (opts: {
      source?: string;
      all?: boolean;
      dryRun?: boolean;
      fromFixture?: string;
      limit?: number;
      trigger: string;
      force?: boolean;
      json?: boolean;
    }) => {
      const config = loadConfig();
      const logger = createLogger({ pretty: !opts.json });
      const sql = createSql(requireDatabaseUrl(config));
      const connectors = opts.all
        ? productionConnectors()
        : opts.source
          ? [getConnector(opts.source)]
          : [];
      if (connectors.length === 0) {
        if (opts.all) {
          console.log('[]');
          console.error(
            'No hay conectores de producción registrados todavía (ver docs/source-inventory.md).',
          );
          process.exit(0);
        }
        console.error('Indicar --source <slug> o --all');
        process.exit(2);
      }
      const summaries: RunSummary[] = [];
      let failed = false;
      try {
        for (const connector of connectors) {
          const http = opts.fromFixture
            ? new FixtureHttpClient(resolveFixtureSet(connector.slug, opts.fromFixture))
            : liveClient(connector, logger);
          try {
            const summary = await runSource(
              connector,
              { sql, http, logger },
              {
                trigger: opts.fromFixture ? 'fixture' : opts.trigger === 'cron' ? 'cron' : 'manual',
                fixtureSet: opts.fromFixture ?? null,
                dryRun: Boolean(opts.dryRun),
                ...(opts.limit ? { limit: opts.limit } : {}),
                gitSha: config.GITHUB_SHA ?? null,
                force: Boolean(opts.force),
                now: () => DateTime.now().setZone(BA_TZ),
              },
            );
            summaries.push(summary);
            if (summary.status === 'failed') failed = true;
            if (!opts.json) printSummary(summary);
          } catch (err) {
            failed = true;
            logger.error({ source: connector.slug, err }, 'la corrida abortó');
          }
        }
      } finally {
        await sql.end();
      }
      if (opts.json) console.log(JSON.stringify(summaries, null, 2));
      process.exit(failed ? 1 : 0);
    },
  );

program
  .command('record')
  .description('Correr un conector en vivo grabando las respuestas HTTP como fixtures')
  .requiredOption('-s, --source <slug>', 'conector')
  .option('--set <name>', 'nombre del set (default: fecha de hoy)')
  .option('--limit <n>', 'procesar como máximo N ítems', (v) => Number.parseInt(v, 10))
  .action(async (opts: { source: string; set?: string; limit?: number }) => {
    const config = loadConfig();
    const logger = createLogger();
    const connector = getConnector(opts.source);
    const set = opts.set ?? DateTime.now().setZone(BA_TZ).toISODate() ?? 'latest';
    const dir = fixtureSetDir(connector.slug, set);
    const http = new RecordingHttpClient(liveClient(connector, logger), dir, connector.slug);
    const ctx = {
      http,
      logger,
      now: () => DateTime.now().setZone(BA_TZ),
      ...(opts.limit ? { limit: opts.limit } : {}),
    };
    const raws = await connector.discover(ctx);
    const slice = opts.limit ? raws.slice(0, opts.limit) : raws;
    let okCount = 0;
    for (const raw0 of slice) {
      const raw = connector.enrich ? await connector.enrich(raw0, ctx) : raw0;
      const parsed = connector.parse(raw, ctx);
      if (parsed.ok) okCount += 1;
      else logger.warn({ externalId: raw.externalId, errors: parsed.errors }, 'parse falló');
    }
    logger.info(
      { dir, discovered: raws.length, recorded: slice.length, parsedOk: okCount, http: http.stats },
      'fixtures grabados',
    );
    void config;
  });

program
  .command('mark-archived')
  .description('Archivar eventos cuya última función terminó hace más de N días')
  .option('--grace-days <n>', 'días de gracia', (v) => Number.parseInt(v, 10), 7)
  .action(async (opts: { graceDays: number }) => {
    const config = loadConfig();
    const sql = createSql(requireDatabaseUrl(config));
    try {
      const n = await archivePastEvents(sql, opts.graceDays);
      console.log(`Eventos archivados: ${n}`);
    } finally {
      await sql.end();
    }
  });

function printSummary(s: RunSummary): void {
  const st = s.stats;
  console.log(
    `\n[${s.source}] ${s.status}${s.dryRun ? ' (dry-run, nada persistido)' : ''} · run ${s.runId}\n` +
      `  descubiertos ${st.discovered} · ok ${st.parsed_ok} · incompletos ${st.parsed_incomplete} · inválidos ${st.parsed_invalid}\n` +
      `  eventos: +${st.events_created} creados, ${st.events_updated} actualizados, ${st.events_unchanged} sin cambios, ${st.events_published} publicados\n` +
      `  funciones: +${st.occurrences_created} · cambios mayores ${st.changes_major} · menores ${st.changes_minor} · ausencias ${st.missing_marked}\n` +
      `  http: ${st.http_requests} peticiones (${st.http_retries} reintentos) · ${st.duration_ms} ms`,
  );
  for (const w of s.warnings) console.log(`  ⚠ ${w}`);
  if (s.errorMessage) console.log(`  ✖ ${s.errorMessage}`);
  const candidates = s.records.filter((r) => r.parseStatus === 'incomplete');
  if (candidates.length) {
    console.log('  candidatos pendientes de revisión:');
    for (const c of candidates) console.log(`    · ${c.externalId}: ${c.reasons?.join(', ')}`);
  }
  const invalid = s.records.filter(
    (r) =>
      r.parseStatus === 'invalid' || r.parseStatus === 'error' || r.parseStatus === 'fetch_failed',
  );
  if (invalid.length) {
    console.log('  errores:');
    for (const c of invalid)
      console.log(`    · ${c.externalId} (${c.parseStatus}): ${c.errors?.join('; ')}`);
  }
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
