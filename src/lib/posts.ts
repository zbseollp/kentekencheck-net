import { getCollection, type CollectionEntry } from "astro:content";
import { resolveFeaturedImage, resolveFeaturedImageAlt } from "./blogImages";
import { isSpamBlogPost } from "./spam-blog";
import { getPayloadPosts, type PayloadPost } from "./payload";

type Entry = CollectionEntry<"blog">;

/** Shape shared by markdown and Payload-API posts, so listings stay uniform. */
export interface ListedPost {
  title: string;
  slug: string;
  description: string;
  pubDate: Date;
  categories: string[];
  image: string | null;
  imageAlt: string;
  source: "md" | "payload";
}

/**
 * Most synced posts arrive with `description: ""`, which leaves both the card
 * and the meta description blank. Derive one from the opening prose instead —
 * never write it back to the file, so a real description always wins later.
 */
export function excerptFromBody(body: string | undefined, limit = 160): string {
  if (!body) return "";
  const plain = body
    .replace(/^---[\s\S]*?---/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+.*$/gm, " ")
    .replace(/[*_`>|#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= limit) return plain;
  const cut = plain.slice(0, limit);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (lastStop > limit * 0.5) return cut.slice(0, lastStop + 1).trim();
  return `${cut.slice(0, cut.lastIndexOf(" ")).trim()}…`;
}

function toTime(value: unknown): number {
  if (value instanceof Date) {
    const t = value.valueOf();
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof value === "string" || typeof value === "number") {
    const t = new Date(value).valueOf();
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

/** Best publication timestamp for ordering (newest first). */
function timestamp(entry: Entry): number {
  // Prefer pubDate, then legacy date, then updatedDate. Never use "now" — that
  // would push undated posts to the top of the listing.
  return (
    toTime(entry.data.pubDate) ||
    toTime(entry.data.date) ||
    toTime(entry.data.updatedDate) ||
    0
  );
}

function listedTimestamp(post: ListedPost): number {
  return toTime(post.pubDate);
}

/** Newest first; stable tie-break by slug so pagination does not shuffle. */
function sortNewestFirst<T>(items: T[], timeOf: (item: T) => number, slugOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const delta = timeOf(b) - timeOf(a);
    if (delta !== 0) return delta;
    return slugOf(a).localeCompare(slugOf(b));
  });
}

/** Single source of truth for "is this post live?". */
export function isPublished(entry: Entry): boolean {
  if (entry.data.draft) return false;
  if (entry.data._status && entry.data._status !== "published") return false;
  if (isSpamBlogPost(entry.id, entry.body ?? "", entry.data.title ?? "")) return false;
  return true;
}

/** Newest-first published markdown posts. */
export async function getMarkdownPosts(): Promise<Entry[]> {
  const posts = await getCollection("blog", ({ data }) => !data.draft);
  return sortNewestFirst(
    posts.filter(isPublished),
    timestamp,
    (entry) => entry.id,
  );
}

/**
 * Resolve card/hero image for a markdown entry. Prefer frontmatter; when the
 * editor set the image only in Payload (common — MD files ship without
 * featuredImage), fall back to the Payload media for the same slug.
 */
export function toListedPost(
  entry: Entry,
  payloadBySlug?: Map<string, PayloadPost>,
): ListedPost {
  // Prefer real media; only use the site placeholder after Payload has been tried.
  const fromMd = resolveFeaturedImage(entry.data, entry.body, { fallback: null });
  const payload = payloadBySlug?.get(entry.id) ?? payloadBySlug?.get(entry.data.slug ?? "");
  const fromPayload = payload
    ? resolveFeaturedImage(
        {
          featuredImage: payload.featuredImage,
          heroImage: payload.heroImage,
          title: payload.title,
        },
        undefined,
        { fallback: null },
      )
    : null;
  const image =
    fromMd ??
    fromPayload ??
    resolveFeaturedImage(entry.data, entry.body); // applies DEFAULT_BLOG_IMAGE
  const imageAlt =
    resolveFeaturedImageAlt(entry.data, entry.data.title) ||
    resolveFeaturedImageAlt(
      {
        featuredImage: payload?.featuredImage,
        heroImage: payload?.heroImage,
        title: payload?.title ?? entry.data.title,
      },
      entry.data.title,
    );

  return {
    title: entry.data.title,
    slug: entry.id,
    description: entry.data.description || excerptFromBody(entry.body),
    // Always a real Date so listing sort never gets string-NaN under SSR.
    pubDate: new Date(
      toTime(entry.data.pubDate) ||
        toTime(entry.data.date) ||
        toTime(entry.data.updatedDate) ||
        0,
    ),
    categories: entry.data.categories ?? [],
    image,
    imageAlt,
    source: "md",
  };
}

function payloadToListedPost(post: PayloadPost): ListedPost {
  return {
    title: post.title,
    slug: post.slug,
    description: post.description ?? "",
    pubDate: new Date(toTime(post.pubDate) || toTime(post.updatedDate) || 0),
    categories: post.categories ?? [],
    image: resolveFeaturedImage({
      featuredImage: post.featuredImage,
      heroImage: post.heroImage,
      title: post.title,
    }),
    imageAlt: resolveFeaturedImageAlt(
      {
        featuredImage: post.featuredImage,
        heroImage: post.heroImage,
        title: post.title,
      },
      post.title,
    ),
    source: "payload",
  };
}

/**
 * Markdown + Payload-API posts merged newest-first.
 * Markdown keeps text/body ownership on slug conflict, but Payload supplies
 * featured/hero images when the markdown file has none — otherwise CMS image
 * uploads never appear on the live site.
 */
export async function getAllPosts(payloadLimit = 200): Promise<ListedPost[]> {
  const [mdPosts, payloadPosts] = await Promise.all([
    getMarkdownPosts(),
    getPayloadPosts(payloadLimit),
  ]);

  const payloadBySlug = new Map<string, PayloadPost>();
  for (const post of payloadPosts) {
    if (post.slug) payloadBySlug.set(post.slug, post);
  }

  const listed = mdPosts.map((entry) => toListedPost(entry, payloadBySlug));
  const mdSlugs = new Set(listed.map((post) => post.slug));

  const fromPayload = payloadPosts
    .filter((post) => !mdSlugs.has(post.slug))
    .filter((post) => post.publishStatus === "published")
    .filter((post) => !isSpamBlogPost(post.slug, "", post.title ?? ""))
    .map(payloadToListedPost);

  return sortNewestFirst(
    [...listed, ...fromPayload],
    listedTimestamp,
    (post) => post.slug,
  );
}
