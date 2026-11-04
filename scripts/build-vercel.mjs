#!/usr/bin/env node
/**
 * Produces a Vercel Build Output API v3 bundle in .vercel/output:
 *   static/              the built React app (client/dist), served from Vercel's CDN
 *   functions/api.func/  the whole Express API bundled into one ESM file
 *   config.json          routing (/api -> function, SPA fallback) and security headers
 *
 * Run after `npm run build -w client`; `npm run build:vercel` does both. Vercel uses this output
 * as-is, so what you test locally is exactly what is deployed.
 */
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.vercel', 'output');
const nodeMajor = process.versions.node.split('.')[0];
// On Vercel the build runs on the project's Node version, so the function matches it. For a
// prebuilt deploy from a machine on another version, set e.g. VERCEL_FUNCTION_RUNTIME=nodejs22.x.
const runtime = process.env.VERCEL_FUNCTION_RUNTIME || `nodejs${nodeMajor}.x`;

/**
 * Bundles server/src/vercel.ts. On Vercel the hosted database is reached over HTTPS, so the
 * web-standard libSQL client is used: pure JS, no native module to ship. `webClient: false`
 * keeps the Node client (local SQLite files), which is only for local smoke tests.
 */
export async function bundleApi({ outfile, webClient = true }) {
  await build({
    entryPoints: [join(root, 'server', 'src', 'vercel.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: `node${nodeMajor}`,
    alias: webClient ? { '@libsql/client': '@libsql/client/web' } : {},
    external: webClient ? [] : ['@libsql/client', 'libsql'],
    // Express and friends are CommonJS and call require() at runtime.
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    logLevel: 'warning',
    legalComments: 'none',
  });
}

/** Same CSP and headers Helmet sets on API responses, applied to the static app on the CDN. */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' https: data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "object-src 'none'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self'",
  'upgrade-insecure-requests',
  "connect-src 'self'",
].join(';');

const securityHeaders = {
  'Content-Security-Policy': CSP,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Origin-Agent-Cluster': '?1',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-DNS-Prefetch-Control': 'off',
  'X-Download-Options': 'noopen',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'X-XSS-Protection': '0',
};

// Demo with fictional data under real brand names: keep it out of search engines unless opted in.
if (process.env.ALLOW_INDEXING !== '1') securityHeaders['X-Robots-Tag'] = 'noindex, nofollow';

const API = '^/api(?:/.*)?$';
const NOT_API = '^/(?!api(?:/|$)).*$';

const config = {
  version: 3,
  routes: [
    { src: NOT_API, headers: securityHeaders, continue: true },
    { src: '^/assets/(.*)$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
    // Every API path goes to the one function; Express routes on the original URL.
    { src: API, dest: '/api' },
    { handle: 'filesystem' },
    // Client-side routes (/admin, /enquire/:siteKey, ...) fall back to the SPA shell.
    { src: NOT_API, dest: '/index.html' },
  ],
};

async function main() {
  const dist = join(root, 'client', 'dist');
  if (!existsSync(join(dist, 'index.html'))) {
    console.error('[build-vercel] client/dist is missing. Run `npm run build -w client` first.');
    process.exit(1);
  }

  rmSync(out, { recursive: true, force: true });
  cpSync(dist, join(out, 'static'), { recursive: true });

  const fn = join(out, 'functions', 'api.func');
  mkdirSync(fn, { recursive: true });
  await bundleApi({ outfile: join(fn, 'index.mjs') });
  writeFileSync(
    join(fn, '.vc-config.json'),
    JSON.stringify({ runtime, handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false }, null, 2),
  );

  writeFileSync(join(out, 'config.json'), JSON.stringify(config, null, 2));
  console.log(`[build-vercel] wrote .vercel/output (function runtime ${runtime})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
