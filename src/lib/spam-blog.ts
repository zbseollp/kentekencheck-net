/**
 * Shared spam detector for synced blog content.
 *
 * Two tiers, deliberately separated:
 *
 * - isSpamBlogPost()      hard signals only — payloads that hijack the page:
 *                         document.write, eval of base64-decoded data, and location
 *                         assignments. Safe to filter automatically.
 * - isOffTopicBlogPost()  soft signal — celebrity/gossip filler pushed onto a
 *                         niche site. Reported by scripts/remove-spam-blog.mjs
 *                         for review; never auto-deleted, because "is this on
 *                         topic" is an editorial call, not a mechanical one.
 *
 * Deliberately NOT spam signals:
 *  - <iframe> and <script src=...> embeds. YouTube players, Twitter widgets and
 *    the like are ordinary article content; treating them as injection deletes
 *    real posts. Inline injection payloads are stripped by sanitize-blog.mjs.
 *  - Images hosted on a third-party CDN. That is an image-resolution concern,
 *    handled by the media resolver, not a reason to drop the article.
 */

/** Payloads that hijack the page and must never reach the built HTML. */
const INJECTION_PATTERNS: RegExp[] = [
  /document\s*\.\s*write\s*\(/i,
  /\beval\s*\(\s*atob\s*\(/i,
  /\bunescape\s*\(\s*["']%(?:3C|64)/i,
  /window\s*\.\s*location\s*(?:\.\s*(?:href|replace)\s*[=(]|\s*=)/i,
  /<meta[^>]+http-equiv=["']?refresh["']?[^>]*url=/i,
];

/** Gossip-filler title shapes (Dutch), used for reporting only. */
const OFF_TOPIC_TITLE_PATTERNS: RegExp[] = [
  /\bvriendin\b/i,
  /\bvriend van\b/i,
  /\bgetrouwd\b/i,
  /\brelatiestatus\b/i,
  /\bex-partner\b/i,
  /\bzwanger\b/i,
  /\b(?:vermogen|lengte|leeftijd) van\b/i,
];

export function hasInjectedPayload(body: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(body));
}

/**
 * Hard spam — filtered out of every listing and route.
 * Checks slug, title and body so title-only spam is caught too.
 */
export function isSpamBlogPost(id: string, body = '', title = ''): boolean {
  return hasInjectedPayload(`${id}\n${title}\n${body}`);
}

/** Soft signal — off-topic gossip filler. Reported, never auto-removed. */
export function isOffTopicBlogPost(id: string, title = ''): boolean {
  const haystack = `${id.replace(/-/g, ' ')} ${title}`;
  return OFF_TOPIC_TITLE_PATTERNS.some((pattern) => pattern.test(haystack));
}

export const SPAM_INJECTION_PATTERNS = INJECTION_PATTERNS;
