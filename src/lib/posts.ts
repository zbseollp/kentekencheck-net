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

function timestamp(entry: Entry): number {
  const candidates = [entry.data.pubDate, entry.data.date, entry.data.updatedDate];
  for (const value of candidates) {
    if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.valueOf();
  }
  return 0;
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
  return posts.filter(isPublished).sort((a, b) => timestamp(b) - timestamp(a));
}

export function toListedPost(entry: Entry): ListedPost {
  return {
    title: entry.data.title,
    slug: entry.id,
    description: entry.data.description || excerptFromBody(entry.body),
    pubDate: entry.data.pubDate,
    categories: entry.data.categories ?? [],
    image: resolveFeaturedImage(entry.data, entry.body),
    imageAlt: resolveFeaturedImageAlt(entry.data, entry.data.title),
    source: "md",
  };
}

function payloadToListedPost(post: PayloadPost): ListedPost {
  return {
    title: post.title,
    slug: post.slug,
    description: post.description ?? "",
    pubDate: new Date(post.pubDate),
    categories: post.categories ?? [],
    image: resolveFeaturedImage(post as never),
    imageAlt: post.heroImage?.alt ?? post.title,
    source: "payload",
  };
}

/**
 * Markdown + Payload-API posts merged newest-first. Markdown wins on a slug
 * conflict, and the publish filters apply to both sources.
 */
export async function getAllPosts(payloadLimit = 200): Promise<ListedPost[]> {
  const [mdPosts, payloadPosts] = await Promise.all([
    getMarkdownPosts(),
    getPayloadPosts(payloadLimit),
  ]);

  const listed = mdPosts.map(toListedPost);
  const mdSlugs = new Set(listed.map((post) => post.slug));

  const fromPayload = payloadPosts
    .filter((post) => !mdSlugs.has(post.slug))
    .filter((post) => post.publishStatus !== "draft")
    .filter((post) => !isSpamBlogPost(post.slug, "", post.title ?? ""))
    .map(payloadToListedPost);

  return [...listed, ...fromPayload].sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());
}
