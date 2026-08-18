import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = resolve('dist');
const entryFile = resolve(outputDirectory, 'index.html');
const staticRoutes = ['terms', 'privacy', 'refund-policy'];
const oldLogoPath = '/ez-way-logo.png';
const newLogoPath = '/ez-way-logo-correct.svg';

const entryHtml = await readFile(entryFile, 'utf8');
await writeFile(entryFile, entryHtml.replaceAll(oldLogoPath, newLogoPath));

await Promise.all(staticRoutes.map(async (route) => {
  const routeDirectory = resolve(outputDirectory, route);
  await mkdir(routeDirectory, { recursive: true });
  await copyFile(entryFile, resolve(routeDirectory, 'index.html'));
}));

console.log(`Prepared static entry points for: ${staticRoutes.map((route) => `/${route}`).join(', ')}`);
