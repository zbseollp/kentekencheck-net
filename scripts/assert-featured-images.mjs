#!/usr/bin/env node
/**
 * Guardrails so featured-image regressions fail the build instead of shipping
 * silently (the original kentekencheck.net failure mode).
 */
import { existsSync } from 'node:fs';
import { resolveMediaUrl, getTenantSlug, DEFAULT_TENANT_SLUG } from '../src/lib/media-url.mjs';

const errors = [];

if (getTenantSlug() !== 'kentekencheck-net' && DEFAULT_TENANT_SLUG !== 'kentekencheck-net') {
  errors.push(`tenant slug must be kentekencheck-net (got ${getTenantSlug()})`);
}

const media = resolveMediaUrl('/media/feature-check.jpg', { fallback: null });
if (!media || !media.includes('/tenants/kentekencheck-net/')) {
  errors.push(`resolveMediaUrl(/media/...) must include tenants/kentekencheck-net (got ${media})`);
}

const bare = resolveMediaUrl('https://pub-d4024ad3e57841448e0ee58a19abe46b.r2.dev/feature-check.jpg', {
  fallback: null,
});
if (!bare || !bare.includes('/tenants/kentekencheck-net/')) {
  errors.push(`bare R2 URL must be repaired to tenants/kentekencheck-net (got ${bare})`);
}

const local = resolveMediaUrl('/images/blog-default.svg', { fallback: null });
if (local !== '/images/blog-default.svg') {
  errors.push(`local /images/ path must stay site-relative (got ${local})`);
}

if (!existsSync('public/images/blog-default.svg')) {
  errors.push('missing public/images/blog-default.svg default cover');
}

if (!existsSync('src/lib/blogImages.ts') || !existsSync('src/lib/media-url.mjs')) {
  errors.push('missing blogImages.ts or media-url.mjs');
}

if (errors.length) {
  for (const e of errors) console.error(`[assert-featured-images] ERROR ${e}`);
  process.exit(1);
}

console.log('[assert-featured-images] OK — media resolver + default cover healthy');
