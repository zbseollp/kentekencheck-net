/**
 * Shared spam detector for synced blog content.
 *
 * Two tiers, deliberately separated:
 *
 * - isSpamBlogPost()      hard signals only — injected scripts and redirect
 *                         payloads. Safe to filter automatically; a false
 *                         positive here is very unlikely.
 * - isOffTopicBlogPost()  soft signal — celebrity/gossip filler pushed onto a
 *                         niche site. Reported by scripts/remove-spam-blog.mjs
 *                         for review; never auto-deleted, because "is this on
 *                         topic" is an editorial call, not a mechanical one.
 *
 * Note on third-party image hosts: a post whose images live on someone else's
 * CDN is NOT spam — that is an image-resolution problem, handled by
 * scripts/sanitize-blog.mjs, which drops only values that aren't images at all.
 */

/** Injection payloads that must never reach the built HTML. */
const INJECTION_PATTERNS: RegExp[] = [
  /document\s*\.\s*write\s*\(/i,
  /<script\b[^>]*>/i,
  /\beval\s*\(\s*atob\s*\(/i,
  /window\s*\.\s*location\s*\.\s*(?:href|replace)\s*[=(]/i,
  /<iframe\b[^>]*\bsrc=["']?https?:\/\//i,
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
