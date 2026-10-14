import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  INGEST_USER_AGENT: z
    .string()
    .min(1)
    .default('CulturaBA-Ingest/0.1 (+https://culturaba.xn--lembodiseo-19a.com/bot)'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'silent']).default('info'),
  AI_SUMMARY_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  HTTP_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  GITHUB_SHA: z.string().optional(),
});

export type IngestConfig = z.infer<typeof EnvSchema>;

let cached: IngestConfig | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): IngestConfig {
  if (cached && env === process.env) return cached;
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida: ${issues}`);
  }
  if (env === process.env) cached = parsed.data;
  return parsed.data;
}

export function requireDatabaseUrl(config: IngestConfig): string {
  if (!config.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL (ver .env.example). Local: `pnpm db:url`.');
  }
  return config.DATABASE_URL;
}
