#!/usr/bin/env node
/**
 * Non-destructive cleanup pass over synced blog content:
 *  - strip injected <script> blocks and document.write payloads from bodies
 *  - blank image fields whose value is not an image at all (a bare page URL),
 *    which would otherwise render as a broken <img>
 *  - normalise WordPress `path "Title"` image scalars down to the path
 *  - blank out empty-string image fields so they read as "no image"
 */
import { writeFileSync } from 'node:fs';
import { BLOG_DIR, exists, listBlogFiles, readPost } from './lib/blog-files.mjs';

const IMAGE_FIELDS = ['featuredImage', 'heroImage', 'image', 'ogImage'];

/**
 * A featured image must point at an actual file. Payload/WordPress sometimes
 * stores a site URL ("https://example.com/nl/") in the image field; rendering
 * that as an <img> yields a broken image on every card.
 */
function looksLikeImage(value) {
  if (!value) return false;
  if (value.startsWith('data:image/')) return true;
  const withoutQuery = value.split(/[?#]/)[0];
  return /\.(?:jpe?g|png|gif|webp|avif|svg|bmp|tiff?)$/i.test(withoutQuery);
}

/** Quote only values YAML would otherwise misread; plain URLs stay unquoted. */
function needsQuoting(value) {
  return /^[-?:,[\]{}#&*!|>'"%@`]/.test(value) || /:\s/.test(value) || /\s#/.test(value);
}

if (!exists(BLOG_DIR)) {
  console.log(`[sanitize-blog] no ${BLOG_DIR}/ — nothing to do`);
  process.exit(0);
}

let changed = 0;

for (const path of listBlogFiles()) {
  const post = readPost(path);
  if (!post.hasFrontmatter) continue;

  let frontmatter = post.frontmatter;
  let body = post.body;

  for (const field of IMAGE_FIELDS) {
    frontmatter = frontmatter.replace(
      // Capture the rest of the line plus whatever follows, so a nested media
      // object (value on the following indented lines) can be left untouched.
      new RegExp(`^(${field}:[ \\t]*)([^\\n]*)(\\n|$)([ \\t]+\\S)?`, 'gm'),
      (match, head, rawValue, newline, nextIndented) => {
        const value = rawValue.trim();

        // `featuredImage:` followed by an indented line is a Payload media
        // object — a legitimate shape the schema handles. Never flatten it.
        if (!value && nextIndented) return match;
        if (!value) return `${head}""${newline}${nextIndented ?? ''}`;

        const unquoted = value.replace(/^["']|["']$/g, '');
        // `path "Title"` → path (the quotes may arrive backslash-escaped),
        // before deciding whether the value is an image at all
        const stripped = unquoted.replace(/\\s+\\\\?["'].*$/, '').trim();
        const next = !stripped || !looksLikeImage(stripped)
          ? `${head}""`
          : needsQuoting(stripped)
            ? `${head}"${stripped}"`
            : `${head}${stripped}`;
        return `${next}${newline}${nextIndented ?? ''}`;
      },
    );
  }

  body = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/^.*document\s*\.\s*write\s*\([\s\S]*?\).*$/gim, '');

  const next = `---\n${frontmatter}\n---\n${body}`;
  if (next !== post.raw) {
    writeFileSync(path, next);
    changed += 1;
  }
}

console.log(`[sanitize-blog] sanitized ${changed} file(s)`);
