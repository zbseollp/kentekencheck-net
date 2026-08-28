#!/usr/bin/env node
// Importeert de markdown-blogposts uit src/content/blog eenmalig in Payload CMS.
//
// De reguliere sync loopt van Payload NAAR de repo; dit script gaat de andere kant
// op en is dus bedoeld als eenmalige vulling van een lege tenant.
//
// Gebruik:
//   node scripts/import-naar-payload.mjs                  # proefdraai, schrijft niets
//   node scripts/import-naar-payload.mjs --limit 1 --doit # eerst 1 post echt aanmaken
//   node scripts/import-naar-payload.mjs --doit           # alles
//
// Inloggegevens komen uit omgevingsvariabelen, nooit uit dit bestand:
//   PAYLOAD_API_KEY="..."                       (voorkeur)
//   of PAYLOAD_EMAIL="..." PAYLOAD_PASSWORD="..."
//
// Zet ze bij voorkeur in .env (staat in .gitignore) en laad ze met Node zelf:
//   node --env-file=.env scripts/import-naar-payload.mjs --limit 1 --doit
// Zo staat de sleutel niet in je shell-historie en niet in de repo.
//
// Het script is herhaalbaar: bestaande slugs in de tenant worden overgeslagen.

import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BLOG_DIR = join(root, "src/content/blog");
const API = process.env.PAYLOAD_API ?? "https://payload.10beste.com/api";
const TENANT_SLUG = process.env.PAYLOAD_TENANT ?? "kentekencheck-net";
const COLLECTION = process.env.PAYLOAD_COLLECTION ?? "blog-posts";

const args = process.argv.slice(2);
const DOIT = args.includes("--doit");
const LIMIT = Number(args[args.indexOf("--limit") + 1]) || Infinity;

// ------------------------------------------------------------- frontmatter ---
// Bewust een kleine YAML-subset: alleen de velden die in deze bestanden staan.

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2].trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      data[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return { data, body: m[2] };
}

// ----------------------------------------------------------------- lexical ---
// Alleen de nodetypes die src/lib/payload.ts kan renderen: paragraph, heading,
// list, listitem, link, text, quote, horizontalrule.

const FMT = { bold: 1, italic: 2, code: 16 };

const textNode = (text, format = 0) => ({
  type: "text",
  text,
  format,
  detail: 0,
  mode: "normal",
  style: "",
  version: 1,
});

const wrap = (type, children, extra = {}) => ({
  type,
  children,
  direction: "ltr",
  format: "",
  indent: 0,
  version: 1,
  ...extra,
});

// Inline: **vet**, *cursief*, `code`, [tekst](url). Bewust conservatief; wat niet
// herkend wordt blijft platte tekst in plaats van te verminken.
function inlineNodes(text) {
  const out = [];
  const re = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(textNode(text.slice(last, m.index)));
    if (m[2] !== undefined) out.push(textNode(m[2], FMT.bold));
    else if (m[4] !== undefined) out.push(textNode(m[4], FMT.italic));
    else if (m[6] !== undefined) out.push(textNode(m[6], FMT.code));
    else if (m[8] !== undefined) {
      // linktekst kan zelf opmaak bevatten, zoals [**tekst**](url)
      out.push(
        wrap("link", inlineNodes(m[8]), {
          fields: { linkType: "custom", newTab: false, url: m[9] },
        }),
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(textNode(text.slice(last)));
  return out.length ? out : [textNode(text)];
}

// Deze bestanden zetten elke alinea op één regel en gebruiken witregels
// onregelmatig, dus we werken regel voor regel. Alleen lijstitems en citaten
// worden over opeenvolgende regels samengevoegd.
function markdownToLexical(markdown) {
  const children = [];
  let lijst = null; // { genummerd, items: [] }
  let citaat = null; // [regels]

  const sluitAf = () => {
    if (lijst) {
      children.push(
        wrap(
          "list",
          lijst.items.map((tekst, i) => wrap("listitem", inlineNodes(tekst), { value: i + 1 })),
          {
            listType: lijst.genummerd ? "number" : "bullet",
            start: 1,
            tag: lijst.genummerd ? "ol" : "ul",
          },
        ),
      );
      lijst = null;
    }
    if (citaat) {
      children.push(wrap("quote", inlineNodes(citaat.join(" "))));
      citaat = null;
    }
  };

  for (const ruw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const regel = ruw.trim();
    if (!regel) {
      sluitAf();
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(regel)) {
      sluitAf();
      children.push({ type: "horizontalrule", version: 1 });
      continue;
    }

    const kop = regel.match(/^(#{1,6})\s+(.*)$/);
    if (kop) {
      sluitAf();
      const niveau = Math.min(kop[1].length, 6);
      // "## **Kop**" -> vette markering weghalen, de h-tag draagt het gewicht al
      const label = kop[2].trim().replace(/^\*\*(.*)\*\*$/, "$1").trim();
      children.push(wrap("heading", inlineNodes(label), { tag: `h${niveau}` }));
      continue;
    }

    const item = regel.match(/^([-*+]|\d+[.)])\s+(.*)$/);
    if (item) {
      const genummerd = /^\d/.test(item[1]);
      if (citaat) sluitAf();
      if (lijst && lijst.genummerd !== genummerd) sluitAf();
      if (!lijst) lijst = { genummerd, items: [] };
      lijst.items.push(item[2]);
      continue;
    }

    if (regel.startsWith(">")) {
      if (lijst) sluitAf();
      if (!citaat) citaat = [];
      citaat.push(regel.replace(/^>\s?/, ""));
      continue;
    }

    sluitAf();
    children.push(wrap("paragraph", inlineNodes(regel)));
  }

  sluitAf();
  return { root: wrap("root", children) };
}

// -------------------------------------------------------------------- api ---

let authHeader = null;

async function authenticate() {
  if (process.env.PAYLOAD_API_KEY) {
    authHeader = `users API-Key ${process.env.PAYLOAD_API_KEY}`;
    return "API-key";
  }
  const email = process.env.PAYLOAD_EMAIL;
  const password = process.env.PAYLOAD_PASSWORD;
  if (!email || !password) {
    throw new Error("Geen inloggegevens. Zet PAYLOAD_API_KEY, of PAYLOAD_EMAIL en PAYLOAD_PASSWORD.");
  }
  const res = await fetch(`${API}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Inloggen mislukt: ${res.status} ${await res.text()}`);
  const { token } = await res.json();
  if (!token) throw new Error("Inloggen gaf geen token terug.");
  authHeader = `JWT ${token}`;
  return "e-mail/wachtwoord";
}

const api = (path, init = {}) =>
  fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...init.headers,
    },
  });

async function tenantId() {
  const res = await api(`/tenants?where[slug][equals]=${encodeURIComponent(TENANT_SLUG)}&limit=1`);
  if (!res.ok) throw new Error(`Tenant opvragen mislukt: ${res.status} ${await res.text()}`);
  const { docs } = await res.json();
  if (!docs || !docs.length) throw new Error(`Geen tenant met slug "${TENANT_SLUG}".`);
  return docs[0].id;
}

async function bestaandeSlugs(tenant) {
  const gevonden = new Set();
  for (let page = 1; ; page++) {
    const res = await api(`/${COLLECTION}?where[tenant][equals]=${tenant}&limit=100&page=${page}&depth=0`);
    if (!res.ok) throw new Error(`Bestaande posts opvragen mislukt: ${res.status}`);
    const data = await res.json();
    for (const d of data.docs ?? []) gevonden.add(d.slug);
    if (!data.hasNextPage) return gevonden;
  }
}

// ------------------------------------------------------------------- main ---

const files = (await readdir(BLOG_DIR)).filter((f) => /\.mdx?$/.test(f)).sort();
console.log(`${files.length} bestanden in ${BLOG_DIR}`);

const posts = [];
const problemen = [];

for (const file of files) {
  const slug = file.replace(/\.mdx?$/, "");
  const { data, body } = parseFrontmatter(await readFile(join(BLOG_DIR, file), "utf8"));
  if (!data.title) {
    problemen.push(`${file}: geen title`);
    continue;
  }
  if (!body.trim()) {
    problemen.push(`${file}: lege body`);
    continue;
  }
  const datum = new Date(data.pubDate ?? data.date ?? Date.now());
  if (Number.isNaN(datum.valueOf())) {
    problemen.push(`${file}: onleesbare pubDate "${data.pubDate ?? data.date}"`);
    continue;
  }
  posts.push({
    slug,
    title: data.title,
    description: data.description || data.excerpt || "",
    pubDate: datum.toISOString(),
    ...(data.updatedDate ? { updatedDate: new Date(data.updatedDate).toISOString() } : {}),
    ...(data.categories && data.categories.length ? { categories: data.categories } : {}),
    ...(data.tags && data.tags.length ? { tags: data.tags } : {}),
    publishStatus: "published",
    content: markdownToLexical(body),
  });
}

function telNodes(node) {
  return 1 + (node.children ?? []).reduce((som, kind) => som + telNodes(kind), 0);
}

console.log(`${posts.length} posts gelezen en omgezet naar Lexical`);
if (posts.length) {
  const totaal = posts.reduce((som, p) => som + telNodes(p.content.root), 0);
  console.log(`gemiddeld ${Math.round(totaal / posts.length)} nodes per post`);
}
if (problemen.length) {
  console.log(`overgeslagen (${problemen.length}):`);
  for (const p of problemen) console.log(`  ${p}`);
}

const dumpIndex = args.indexOf("--dump");
if (dumpIndex !== -1 && args[dumpIndex + 1]) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(args[dumpIndex + 1], JSON.stringify(posts, null, 2), "utf8");
  console.log(`alle ${posts.length} omgezette posts weggeschreven naar ${args[dumpIndex + 1]}`);
}

if (!DOIT) {
  const v = posts[0];
  console.log("\n--- PROEFDRAAI, er wordt niets weggeschreven ---");
  if (v) {
    const kort = { ...v, content: { root: { ...v.content.root, children: v.content.root.children.slice(0, 3) } } };
    console.log("Eerste post als voorbeeld (inhoud afgekapt):");
    console.log(JSON.stringify(kort, null, 2).slice(0, 2000));
  }
  console.log("\nDraai opnieuw met --doit om te schrijven. Begin met: --limit 1 --doit");
  process.exit(0);
}

const methode = await authenticate();
console.log(`ingelogd via ${methode}`);
const tenant = await tenantId();
console.log(`tenant "${TENANT_SLUG}" = ${tenant}`);
const bestaand = await bestaandeSlugs(tenant);
console.log(`${bestaand.size} posts al aanwezig in de tenant`);

let aangemaakt = 0;
let overgeslagen = 0;
let mislukt = 0;

for (const post of posts) {
  if (aangemaakt >= LIMIT) break;
  if (bestaand.has(post.slug)) {
    overgeslagen++;
    continue;
  }
  const res = await api(`/${COLLECTION}`, {
    method: "POST",
    body: JSON.stringify({ ...post, tenant }),
  });
  if (res.ok) {
    aangemaakt++;
    console.log(`  + ${post.slug}`);
  } else {
    mislukt++;
    console.log(`  ! ${post.slug} -> ${res.status} ${(await res.text()).slice(0, 300)}`);
    if (mislukt >= 3) {
      console.log("\nDrie keer op rij mis, gestopt. Los de oorzaak op en draai opnieuw.");
      break;
    }
  }
}

console.log(`\nklaar: ${aangemaakt} aangemaakt, ${overgeslagen} overgeslagen, ${mislukt} mislukt`);
