import pino, { type Logger } from 'pino';

export type { Logger };

export function createLogger(options: { level?: string; pretty?: boolean } = {}): Logger {
  const pretty = options.pretty ?? (process.stdout.isTTY && process.env.CI === undefined);
  return pino({
    level: options.level ?? process.env.LOG_LEVEL ?? 'info',
    base: undefined,
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
          },
        }
      : {}),
  });
}

export const silentLogger: Logger = pino({ level: 'silent' });
