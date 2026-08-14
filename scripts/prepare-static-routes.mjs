import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = resolve('dist');
const entryFile = resolve(outputDirectory, 'index.html');
const staticRoutes = ['terms', 'privacy', 'refund-policy'];

await Promise.all(staticRoutes.map(async (route) => {
  const routeDirectory = resolve(outputDirectory, route);
  await mkdir(routeDirectory, { recursive: true });
  await copyFile(entryFile, resolve(routeDirectory, 'index.html'));
}));

console.log(`Prepared static entry points for: ${staticRoutes.map((route) => `/${route}`).join(', ')}`);
