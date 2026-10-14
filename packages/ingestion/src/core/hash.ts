import { createHash } from 'node:crypto';

/** JSON determinista (claves ordenadas) para hashear objetos normalizados. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Hash del contenido relevante de un evento normalizado (sin capturedAt ni rawFragment). */
export function contentHash(normalized: Record<string, unknown>): string {
  const { capturedAt: _c, rawFragment: _r, ...rest } = normalized;
  return sha256Hex(stableStringify(rest));
}
