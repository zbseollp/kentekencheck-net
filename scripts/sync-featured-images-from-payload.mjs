#!/usr/bin/env node
/**
 * Permanent featured-image sync (site-side).
 *
 * Payload CMS is the source of truth for hero/featured images. Markdown files
 * often ship without those fields, and when markdown "wins" on slug conflict the
 * live site never shows a CMS upload.
 *
 * This script runs in prepare:blog (before Astro builds) and writes resolved
 * image URLs into frontmatter so:
 *   - cards / heroes / OG tags work at build time
 *   - images survive even if the runtime Payload API is unreachable
 *
 * Requires PAYLOAD_API_KEY (or PUBLIC_PAYLOAD_API_KEY). Without credentials the
 * script exits 0 so local builds still work; CI/deploy must set the key.
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolveMediaUrl } from '../src/lib/media-url.mjs';
import { BLOG_DIR, exists, listBlogFiles, readField, readPost, slugOf } from './lib/blog-files.mjs';

const TENANT_SLUG = 'kentekencheck-net';
const API = (
  process.env.PUBLIC_PAYLOAD_API ||
  process.env.PAYLOAD_URL ||
  'https://payload.10beste.com/api'
).replace(/\/+$/, '');

const IMAGE_KEYS = ['featuredImage', 'heroImage', 'image'];

function apiKey() {
  return process.env.PAYLOAD_API_KEY || process.env.PUBLIC_PAYLOAD_API_KEY || '';
}

function needsQuoting(value) {
  return /^[-?:,[\]{}#&*!|>'"%@`]/.test(value) || /:\s/.test(value) || /\s#/.test(value);
}

function yamlScalar(value) {
  return needsQuoting(value) ? JSON.stringify(value) : value;
}

/** Pull a usable URL from a Payload media value (object, path, or bare R2). */
function mediaToUrl(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return null; // depth=0 id — unusable
  const resolved = resolveMediaUrl(value, { fallback: null });
  return resolved || null;
}

function bestPayloadImage(doc) {
  return (
    mediaToUrl(doc.featuredImage) ||
    mediaToUrl(doc.heroImage) ||
    mediaToUrl(doc.image) ||
    null
  );
}

function bestPayloadAlt(doc) {
  for (const key of ['featuredImage', 'heroImage', 'image']) {
    const v = doc[key];
    if (v && typeof v === 'object' && typeof v.alt === 'string' && v.alt.trim()) {
      return v.alt.trim();
    }
  }
  return null;
}

/** True when frontmatter already has a usable image (not empty / not a page URL). */
function frontmatterHasImage(frontmatter) {
  for (const key of IMAGE_KEYS) {
    const raw = readField(frontmatter, key);
    if (!raw) continue;
    if (resolveMediaUrl(raw, { fallback: null })) return true;
  }
  return false;
}

function upsertField(frontmatter, key, value) {
  const line = `${key}: ${yamlScalar(value)}`;
  const re = new RegExp(`^${key}:[^\\n]*$`, 'm');
  if (re.test(frontmatter)) return frontmatter.replace(re, line);
  // Insert after title when present so editors see it near the top.
  if (/^title:/m.test(frontmatter)) {
    return frontmatter.replace(/^(title:[^\n]*\n)/m, `$1${line}\n`);
  }
  return `${line}\n${frontmatter}`;
}

/**
 * Payload wins for images: write featuredImage (+ alt) whenever CMS has a
 * resolved URL and the file is missing one, or still has an empty placeholder.
 * Never deletes a good local /uploads/ path unless Payload also has a URL —
 * then CMS is authoritative.
 */
function applyImageToFrontmatter(frontmatter, url, alt) {
  let next = frontmatter;
  const existing =
    readField(frontmatter, 'featuredImage') ||
    readField(frontmatter, 'heroImage') ||
    readField(frontmatter, 'image');
  const existingResolved = existing ? resolveMediaUrl(existing, { fallback: null }) : null;

  // Skip rewrite when the file already points at the same resolved asset.
  if (existingResolved === url) {
    if (alt && !readField(frontmatter, 'featuredImageAlt')) {
      next = upsertField(next, 'featuredImageAlt', alt);
    }
    return { frontmatter: next, changed: next !== frontmatter };
  }

  // Prefer writing featuredImage (schema + blogImageFields mapping).
  next = upsertField(next, 'featuredImage', url);
  // Keep heroImage in sync for templates that only read hero.
  next = upsertField(next, 'heroImage', url);
  if (alt) next = upsertField(next, 'featuredImageAlt', alt);
  return { frontmatter: next, changed: next !== frontmatter };
}

async function fetchAllPublished() {
  const key = apiKey();
  const headers = key ? { Authorization: `users API-Key ${key}` } : {};
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
    if (!res.ok) {
      throw new Error(`Payload HTTP ${res.status} for ${API}/blog-posts`);
    }
    const data = await res.json();
    docs.push(...(data.docs ?? []));
    totalPages = data.totalPages || 1;
    page += 1;
    if (page > 50) break; // hard safety
  }
  return docs;
}

if (!exists(BLOG_DIR)) {
  console.log(`[sync-featured-images] no ${BLOG_DIR}/ — nothing to do`);
  process.exit(0);
}

if (!apiKey()) {
  console.log(
    '[sync-featured-images] skip — set PAYLOAD_API_KEY so CMS featured/hero images are written into markdown at build time',
  );
  process.exit(0);
}

let changed = 0;
let matched = 0;
let withImage = 0;

try {
  const docs = await fetchAllPublished();
  const bySlug = new Map();
  for (const doc of docs) {
    if (doc?.slug) bySlug.set(String(doc.slug), doc);
  }

  for (const path of listBlogFiles()) {
    const post = readPost(path);
    if (!post.hasFrontmatter) continue;
    const slug = post.slug || slugOf(path);
    const doc = bySlug.get(slug);
    if (!doc) continue;
    matched += 1;

    const url = bestPayloadImage(doc);
    if (!url) continue;
    withImage += 1;

    // Always prefer Payload when it has a real media URL (permanent CMS control).
    const { frontmatter, changed: didChange } = applyImageToFrontmatter(
      post.frontmatter,
      url,
      bestPayloadAlt(doc),
    );
    if (!didChange && frontmatterHasImage(post.frontmatter)) continue;

    if (didChange) {
      const next = `---\n${frontmatter}\n---\n${post.body}`;
      writeFileSync(path, next);
      changed += 1;
    }
  }

  console.log(
    `[sync-featured-images] payload=${docs.length} matched=${matched} withImage=${withImage} updated=${changed}`,
  );
} catch (err) {
  // Don't fail the whole build on a transient Payload outage — runtime merge
  // and default covers still protect the site. Log loudly so CI notices.
  console.warn(
    `[sync-featured-images] WARN: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(0);
}
