import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const FIXTURES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures');

export const FixtureEntrySchema = z.object({
  url: z.string(),
  file: z.string(),
  status: z.number().int().default(200),
  contentType: z.string().default('text/html; charset=utf-8'),
  finalUrl: z.string().optional(),
  capturedAt: z.string().optional(),
});
export type FixtureEntry = z.infer<typeof FixtureEntrySchema>;

export const FixtureManifestSchema = z.object({
  source: z.string(),
  capturedAt: z.string().optional(),
  note: z.string().optional(),
  entries: z.array(FixtureEntrySchema),
});
export type FixtureManifest = z.infer<typeof FixtureManifestSchema>;

export function fixtureSetDir(source: string, set: string): string {
  return join(FIXTURES_ROOT, source, set);
}

export function listFixtureSets(source: string): string[] {
  const dir = join(FIXTURES_ROOT, source);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'manifest.json')))
    .map((d) => d.name)
    .sort();
}

/** `latest` → el set de nombre mayor (los sets se nombran por fecha YYYY-MM-DD). */
export function resolveFixtureSet(source: string, set: string): string {
  if (set !== 'latest') {
    const dir = fixtureSetDir(source, set);
    if (!existsSync(join(dir, 'manifest.json'))) {
      throw new Error(`No existe el fixture set ${source}/${set}`);
    }
    return dir;
  }
  const sets = listFixtureSets(source);
  const last = sets.at(-1);
  if (!last) throw new Error(`No hay fixture sets para ${source}`);
  return fixtureSetDir(source, last);
}

export function readManifest(dir: string): FixtureManifest {
  const raw = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  return FixtureManifestSchema.parse(raw);
}

export function writeManifest(dir: string, manifest: FixtureManifest): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
