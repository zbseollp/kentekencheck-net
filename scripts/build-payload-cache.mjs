#!/usr/bin/env node
/**
 * Bake published Payload posts (incl. featured images) into a JSON cache.
 * Listing + article pages read this when the runtime API is unreachable (local
 * dev without PAYLOAD_API_KEY, or transient Payload outages).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveMediaUrl } from '../src/lib/media-url.mjs';
import { loadEnvFile } from './load-env.mjs';

loadEnvFile();

const TENANT_SLUG = 'kentekencheck-net';
const API = (
  process.env.PUBLIC_PAYLOAD_API ||
  process.env.PAYLOAD_URL ||
  'https://payload.10beste.com/api'
).replace(/\/+$/, '');

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/data/payload-posts-cache.json');

function apiKey() {
  return process.env.PAYLOAD_API_KEY || process.env.PUBLIC_PAYLOAD_API_KEY || '';
}

function mediaSnapshot(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const url = resolveMediaUrl(value, { fallback: null });
    return url ? { url } : null;
  }
  if (typeof value === 'number') return null;
  if (typeof value === 'object') {
    const url = resolveMediaUrl(value, { fallback: null });
    if (!url) return null;
    const alt = typeof value.alt === 'string' ? value.alt.trim() : '';
    return { url, ...(alt ? { alt } : {}) };
  }
  return null;
}

function serializePost(doc) {
  return {
    id: doc.id,
    title: doc.title ?? '',
    slug: doc.slug ?? '',
    description: doc.description ?? '',
    publishStatus: doc.publishStatus ?? 'published',
    pubDate: doc.pubDate ?? '',
    updatedDate: doc.updatedDate ?? '',
    categories: Array.isArray(doc.categories) ? doc.categories : [],
    featuredImage: mediaSnapshot(doc.featuredImage),
    heroImage: mediaSnapshot(doc.heroImage),
  };
}

async function fetchAllPublished() {
  const key = apiKey();
  if (!key) return null;

  const headers = { Authorization: `users API-Key ${key}` };
  const docs = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const params = new URLSearchParams({
      'where[tenant.slug][equals]': TENANT_SLUG,
      'where[publishStatus][equals]': 'published',
      sort: '-pubDate',
      limit: '100',
      page: String(page),
      depth: '1',
    });
    const res = await fetch(`${API}/blog-posts?${params}`, { headers });
    if (!res.ok) throw new Error(`Payload HTTP ${res.status}`);
    const data = await res.json();
    docs.push(...(data.docs ?? []));
    totalPages = data.totalPages || 1;
    page += 1;
    if (page > 50) break;
  }
  return docs;
}

try {
  const docs = await fetchAllPublished();
  if (docs === null) {
    console.log(
      '[build-payload-cache] skip — set PAYLOAD_API_KEY to refresh src/data/payload-posts-cache.json',
    );
    process.exit(0);
  }

  const posts = docs.map(serializePost).filter((p) => p.slug);
  posts.sort((a, b) => String(b.pubDate).localeCompare(String(a.pubDate)));

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    `${JSON.stringify({ updatedAt: new Date().toISOString(), posts }, null, 2)}\n`,
    'utf8',
  );
  console.log(`[build-payload-cache] wrote ${posts.length} posts → ${OUT}`);
} catch (err) {
  console.warn(
    `[build-payload-cache] WARN: ${err instanceof Error ? err.message : String(err)} (keeping existing cache)`,
  );
  process.exit(0);
}
