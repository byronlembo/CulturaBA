#!/usr/bin/env node
// Thin launcher so `culturaba-ingest` works without a build step.
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../src/cli.ts');
const child = spawn(process.execPath, ['--import', 'tsx', cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 1));
