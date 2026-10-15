import pino, { type Logger } from 'pino';

export type { Logger };

/**
 * Los logs van SIEMPRE a stderr: stdout queda para los resultados del CLI (p. ej. el
 * resumen de `run --json`, que el workflow de ingestión guarda y parsea).
 */
export function createLogger(options: { level?: string; pretty?: boolean } = {}): Logger {
  const pretty = options.pretty ?? (process.stderr.isTTY && process.env.CI === undefined);
  const base = { level: options.level ?? process.env.LOG_LEVEL ?? 'info', base: undefined };
  if (pretty) {
    return pino({
      ...base,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname',
          destination: 2,
        },
      },
    });
  }
  return pino(base, pino.destination(2));
}

export const silentLogger: Logger = pino({ level: 'silent' });
