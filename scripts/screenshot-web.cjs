#!/usr/bin/env node
/**
 * Smoke test visual de la app (export web) con Playwright: recorre onboarding,
 * feed, ficha, acciones sociales y búsqueda, y guarda capturas a tamaño teléfono.
 *
 *   pnpm dev:api                                  (terminal 1, contra la base local)
 *   pnpm --filter @culturaba/mobile export:web    (con EXPO_PUBLIC_API_MODE=dev)
 *   node scripts/serve-dist.mjs apps/mobile/dist 3000
 *   node scripts/screenshot-web.cjs [baseUrl=http://localhost:3000] [outDir=docs/screenshots]
 *
 * Requiere el paquete `playwright` resoluble (NODE_PATH=... si es global).
 */
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');

const base = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3] ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });

const shot = async (page, name) => {
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: false });
  console.log(`✓ ${name}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: 'es-AR',
  });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('console.error:', m.text());
  });

  // 1. Onboarding
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.getByText('Descubrí qué ver esta semana').waitFor({ timeout: 15000 });
  await shot(page, '01-welcome');
  await page.getByText('Empezar').click();
  await page.getByText('¿Qué te interesa?').waitFor();
  await page.getByText('Ópera y música clásica').click();
  await page.getByText('Museos y exposiciones').click();
  await shot(page, '02-interests');
  await page.getByText('Ver mi agenda').click();

  // 2. Para vos
  await page.getByText('La Traviata').first().waitFor({ timeout: 15000 });
  await page.getByText('Goya: grabados').first().waitFor();
  await shot(page, '03-for-you');

  // 3. Ficha + acciones sociales
  await page.getByText('La Traviata').first().click();
  await page.getByText('Fechas', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('Sobre el evento').waitFor();
  await shot(page, '04-event');
  await page.getByRole('button', { name: /^Guardar/ }).click();
  await page.getByRole('button', { name: /^Asistiré/ }).click();
  await page.waitForTimeout(300);
  await shot(page, '05-event-actions');

  // 4. Guardados (deep link directo a la pestaña)
  await page.goto(`${base}/guardados`, { waitUntil: 'networkidle' });
  await page.getByText('La Traviata').first().waitFor({ timeout: 15000 });
  await shot(page, '06-saved');

  // 5. Explorar con búsqueda
  await page.goto(`${base}/explorar`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('Título, institución, artista…').fill('goya');
  await page.getByText('Goya: grabados').first().waitFor({ timeout: 15000 });
  // La búsqueda filtra de verdad: los demás resultados desaparecen tras el debounce.
  await page.getByText('La Traviata').first().waitFor({ state: 'hidden', timeout: 15000 });
  await shot(page, '07-explore-search');

  // 6. Calendario
  await page.goto(`${base}/calendario`, { waitUntil: 'networkidle' });
  await page.getByText('Próximos 30 días').waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  await shot(page, '08-calendar');

  // 7. Deep link en frío a una ficha por slug
  const slug = await page.evaluate(async () => {
    const r = await fetch('http://localhost:8787/events?limit=1');
    const rows = await r.json();
    return rows[0]?.slug;
  });
  await page.goto(`${base}/event/${slug}`, { waitUntil: 'networkidle' });
  await page.getByText('Fechas', { exact: true }).waitFor({ timeout: 15000 });
  await shot(page, '09-deeplink');

  await browser.close();
  console.log('OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
