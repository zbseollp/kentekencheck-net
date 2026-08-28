import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const xmlPath = String.raw`C:\Users\Jeroen\Downloads\kentekencheck.WordPress.2026-07-15.xml`;
const outDir = join(__dirname, "..", "src", "content", "blog");

// Topics to exclude (casino, social media spam, etc.)
const EXCLUDE_PATTERNS = [
  /casino/i, /gokk/i, /gokken/i, /jackpot/i, /roulette/i, /gokkast/i,
  /bitcoin/i, /crypto(?!r)/i, /aandelen/i, /handelsvaardigh/i,
  /tiktok/i, /youtube/i, /pinterest/i, /instagram.like/i, /twitter.*volger/i,
  /volgers/i, /likes.bestell/i, /likemachine/i,
  /foodtruck/i, /carnaval/i, /voetbal/i,
  /ns-abonnement/i, /heftruck/i,
  /forza\.nl/i, /antony.morato/i,
  /vakantie.naar/i, /droomvakantie/i, /andalusie/i,
  /breng.je.publiek/i, /live.ervaring/i,
  /sponsoring.door.gokbedrij/i, /raceteam.*meedoen/i,
  /luckymax/i, /weddenschappen/i,
  /blockchain/i, /autoracespelletjes/i, /racespelletjes/i,
  /spelletjes/i, /free.spins/i, /dobbel/i,
  /gelukstrekking/i, /inzetten.op.de.juiste.rit/i,
  /vol.gas.op.feiten/i, /slim.rijden.slim.spelen/i,
  /slimmer.spelen/i, /slim.auto.eigenaarschap.*bonus/i,
  /autokopers.*pauze.*online.speel/i, /vrijetijdsbesteding.*lessen/i,
  /veilige.reizen.*hotspot/i, /spanning.van.het.onbekende/i,
  /weg.naar.populariteit/i, /dubieuze.weg/i,
  /talrijke.tiktok/i, /youtube.views/i,
  /wedden.op.autorace/i, /racen.*topspellen/i,
  /spellen.zijn.populair.om.online/i,
];

function shouldExclude(title, slug) {
  const text = (title + " " + slug).toLowerCase();
  return EXCLUDE_PATTERNS.some(p => p.test(text));
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[àáâãäå]/g, "a").replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i").replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u").replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stripDiviShortcodes(html) {
  // Remove all [et_pb_*] and [/et_pb_*] shortcodes (keep inner HTML)
  let result = html;
  // Remove self-closing shortcodes
  result = result.replace(/\[et_pb_[^\]]*\/\]/g, "");
  // Remove opening/closing shortcodes but keep content between
  result = result.replace(/\[\/et_pb_[^\]]*\]/g, "");
  result = result.replace(/\[et_pb_[^\]]*\]/g, "");
  // Remove [toc] and [lmt-*] shortcodes
  result = result.replace(/\[[^\]]+\]/g, "");
  return result;
}

function htmlToMarkdown(html) {
  let md = html;

  // Strip Divi builder
  md = stripDiviShortcodes(md);

  // Remove images (no local images available)
  md = md.replace(/<img[^>]*>/gi, "");

  // Headings
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1");
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1");

  // Bold/italic
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");

  // Links - rewrite internal WP links, strip external spam links
  md = md.replace(/<a[^>]*href="https?:\/\/kentekencheck\.net([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  // Remove other external links but keep text
  md = md.replace(/<a[^>]*>(.*?)<\/a>/gi, "$1");

  // Lists
  md = md.replace(/<ul[^>]*>/gi, "").replace(/<\/ul>/gi, "");
  md = md.replace(/<ol[^>]*>/gi, "").replace(/<\/ol>/gi, "");
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1");

  // Paragraphs and line breaks
  md = md.replace(/<p[^>]*>/gi, "\n\n").replace(/<\/p>/gi, "");
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<div[^>]*>/gi, "\n").replace(/<\/div>/gi, "");

  // Remove remaining HTML tags
  md = md.replace(/<[^>]+>/g, "");

  // HTML entities
  md = md.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
         .replace(/&quot;/g, '"').replace(/&#8217;/g, "'").replace(/&#8216;/g, "'")
         .replace(/&#8220;/g, '"').replace(/&#8221;/g, '"').replace(/&nbsp;/g, " ")
         .replace(/&#039;/g, "'").replace(/&rsquo;/g, "'").replace(/&lsquo;/g, "'")
         .replace(/&rdquo;/g, '"').replace(/&ldquo;/g, '"').replace(/&hellip;/g, "...")
         .replace(/&ndash;/g, "-").replace(/&mdash;/g, "-");

  // Strip injected JS (function(){...})() patterns
  md = md.replace(/\(function\s*\(\s*\)[^]*?\)\s*\(\s*\);?/g, "");

  // Convert arrow text patterns to unicode arrows before escaping
  md = md.replace(/->/g, "→").replace(/<-/g, "←");

  // Escape MDX special chars: curly braces must be escaped
  md = md.replace(/\{/g, "\\{").replace(/\}/g, "\\}");

  // Escape bare < that aren't followed by a valid tag name (MDX would try to parse as JSX)
  md = md.replace(/<(?![a-zA-Z/!])/g, "&lt;");

  // Clean up excess whitespace
  md = md.replace(/\n{3,}/g, "\n\n").trim();

  return md;
}

function extractMeta(item, key) {
  const re = new RegExp(`<wp:meta_key><!\\[CDATA\\[${key}\\]\\]><\\/wp:meta_key>[\\s\\S]*?<wp:meta_value><!\\[CDATA\\[(.*?)\\]\\]><\\/wp:meta_value>`, "i");
  const m = re.exec(item);
  return m ? m[1].trim() : "";
}

function getCDATA(item, tag) {
  const escaped = tag.replace(":", "\\:").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
  const re = new RegExp(`<${escaped}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${escaped}>`, "i");
  const m = re.exec(item);
  return m ? m[1].trim() : "";
}

// Read XML
console.log("Reading XML...");
const xml = readFileSync(xmlPath, "utf-8");

// Extract items
const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
console.log(`Found ${itemMatches.length} items`);

const posts = [];
for (const m of itemMatches) {
  const item = m[1];

  // Only published posts
  const ptype = getCDATA(item, "wp:post_type");
  const status = getCDATA(item, "wp:status");
  if (ptype !== "post" || status !== "publish") continue;

  const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]?.trim() || "";
  const slug = getCDATA(item, "wp:post_name");
  const content = getCDATA(item, "content:encoded");
  const rawDate = getCDATA(item, "wp:post_date");

  // Skip empty
  if (!title || !slug || !content || content.length < 500) continue;

  // Skip spam/off-topic
  if (shouldExclude(title, slug)) continue;

  const yoastTitle = extractMeta(item, "_yoast_wpseo_title");
  const yoastDesc = extractMeta(item, "_yoast_wpseo_metadesc");
  const author = item.match(/<dc:creator><!\[CDATA\[(.*?)\]\]><\/dc:creator>/)?.[1] || "Redactie";

  const metaTitle = yoastTitle || title;
  const description = yoastDesc || "";
  const date = rawDate.split(" ")[0]; // YYYY-MM-DD

  // Convert HTML to markdown
  const mdContent = htmlToMarkdown(content);

  // Skip if after conversion there's almost nothing left (was pure Divi/product page)
  if (mdContent.length < 300) {
    console.log(`  SKIP (too short after conversion): ${title}`);
    continue;
  }

  posts.push({ title, slug, metaTitle, description, date, author, mdContent });
}

console.log(`\nKept ${posts.length} relevant posts`);

// Write MDX files
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

for (const post of posts) {
  // Escape quotes in frontmatter strings
  const esc = (s) => s.replace(/"/g, "'");

  const frontmatter = `---
title: "${esc(post.title)}"
description: "${esc(post.description)}"
pubDate: ${post.date}
author: "${esc(post.author)}"
categories: ["Blog"]
---

`;

  const fileContent = frontmatter + post.mdContent;
  const filePath = join(outDir, `${post.slug}.mdx`);
  writeFileSync(filePath, fileContent, "utf-8");
}

console.log(`\nDone! Written ${posts.length} MDX files to src/content/blog/`);
console.log("\nPost list:");
posts.forEach(p => console.log(`  ${p.slug} (${p.date})`));
