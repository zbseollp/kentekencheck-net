const PAYLOAD_API = (
  (typeof import.meta !== "undefined" &&
    (import.meta.env?.PUBLIC_PAYLOAD_API || import.meta.env?.PAYLOAD_URL)) ||
  (typeof process !== "undefined" && (process.env?.PUBLIC_PAYLOAD_API || process.env?.PAYLOAD_URL)) ||
  "https://payload.10beste.com/api"
).replace(/\/+$/, "");

const TENANT_SLUG = "kentekencheck-net";

/** Media at depth ≥ 1 — or a bare id when the API was called without depth. */
export type PayloadMedia =
  | number
  | string
  | {
      id?: number | string;
      url?: string | null;
      filename?: string | null;
      prefix?: string | null;
      alt?: string | null;
    }
  | null;

export interface PayloadPost {
  id: number;
  title: string;
  slug: string;
  description: string;
  publishStatus: "published" | "draft" | "scheduled";
  pubDate: string;
  updatedDate?: string;
  heroImage?: PayloadMedia;
  featuredImage?: PayloadMedia;
  categories?: string[];
  tags?: string[];
  content?: LexicalContent;
}

interface LexicalContent {
  root: LexicalNode;
}

interface LexicalNode {
  type: string;
  text?: string;
  format?: number;
  tag?: string;
  listType?: string;
  url?: string;
  children?: LexicalNode[];
}

function authHeaders(): HeadersInit {
  const key =
    (typeof import.meta !== "undefined" &&
      (import.meta.env?.PAYLOAD_API_KEY || import.meta.env?.PUBLIC_PAYLOAD_API_KEY)) ||
    (typeof process !== "undefined" &&
      (process.env?.PAYLOAD_API_KEY || process.env?.PUBLIC_PAYLOAD_API_KEY)) ||
    "";
  if (!key) return {};
  return { Authorization: `users API-Key ${key}` };
}

async function fetchBlogPosts(query: string): Promise<PayloadPost[]> {
  try {
    const res = await fetch(`${PAYLOAD_API}/blog-posts?${query}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { docs?: PayloadPost[] };
    return data.docs ?? [];
  } catch {
    return [];
  }
}

/**
 * Published posts for this tenant. `depth=1` populates hero/featured media so
 * resolveFeaturedImage can read `.url` / `.filename` instead of a bare id.
 */
export async function getPayloadPosts(limit = 100): Promise<PayloadPost[]> {
  const params = new URLSearchParams({
    "where[tenant.slug][equals]": TENANT_SLUG,
    "where[publishStatus][equals]": "published",
    sort: "-pubDate",
    limit: String(limit),
    depth: "1",
  });
  return fetchBlogPosts(params.toString());
}

export async function getPayloadPost(slug: string): Promise<PayloadPost | null> {
  const params = new URLSearchParams({
    "where[tenant.slug][equals]": TENANT_SLUG,
    "where[slug][equals]": slug,
    limit: "1",
    depth: "1",
  });
  const docs = await fetchBlogPosts(params.toString());
  return docs[0] ?? null;
}

// Convert Lexical rich text JSON to HTML
export function lexicalToHtml(content: LexicalContent | undefined): string {
  if (!content?.root) return "";
  return renderNode(content.root);
}

function renderNode(node: LexicalNode): string {
  if (node.type === "root" || node.type === "paragraph" || node.type === "listitem") {
    const inner = (node.children ?? []).map(renderNode).join("");
    if (node.type === "paragraph") return inner ? `<p>${inner}</p>` : "";
    if (node.type === "listitem") return `<li>${inner}</li>`;
    return inner;
  }

  if (node.type === "heading") {
    const tag = node.tag ?? "h2";
    const inner = (node.children ?? []).map(renderNode).join("");
    return `<${tag}>${inner}</${tag}>`;
  }

  if (node.type === "list") {
    const tag = node.listType === "number" ? "ol" : "ul";
    const inner = (node.children ?? []).map(renderNode).join("");
    return `<${tag}>${inner}</${tag}>`;
  }

  if (node.type === "link") {
    const inner = (node.children ?? []).map(renderNode).join("");
    return `<a href="${node.url ?? "#"}">${inner}</a>`;
  }

  if (node.type === "text") {
    let text = node.text ?? "";
    // Escape HTML
    text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Handle newlines as paragraphs when text contains markdown-style content
    if (text.includes("\n\n")) {
      return text
        .split("\n\n")
        .map((block) => {
          const trimmed = block.trim();
          if (!trimmed) return "";
          // Convert ## headings
          const headingMatch = trimmed.match(/^(#{1,4})\s+\*?\*?(.*?)\*?\*?$/m);
          if (headingMatch) {
            const level = headingMatch[1].length;
            const tag = `h${Math.min(level + 1, 4)}`;
            return `<${tag}>${headingMatch[2].trim()}</${tag}>`;
          }
          return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
        })
        .join("");
    }
    // format bitmask: 1=bold, 2=italic, 4=strikethrough, 8=underline, 16=code
    const fmt = node.format ?? 0;
    if (fmt & 1) text = `<strong>${text}</strong>`;
    if (fmt & 2) text = `<em>${text}</em>`;
    if (fmt & 16) text = `<code>${text}</code>`;
    return text;
  }

  if (node.type === "quote") {
    const inner = (node.children ?? []).map(renderNode).join("");
    return `<blockquote>${inner}</blockquote>`;
  }

  if (node.type === "horizontalrule") return "<hr>";

  // Fallback: recurse children
  return (node.children ?? []).map(renderNode).join("");
}
