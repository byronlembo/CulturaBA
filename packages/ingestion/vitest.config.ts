import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Load the repo-level .env (if any) so TEST_DATABASE_URL is available locally.
// CI sets it explicitly. Values already in the environment win.
const envFile = resolve(import.meta.dirname, '../../.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || m[1] === undefined) continue;
    const key = m[1];
    const value = (m[2] ?? '').replace(/^"(.*)"$/, '$1');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    // Integration tests share one database: run files sequentially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
