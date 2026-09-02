import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";
import compress from "astro-compress";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";
import rehypeRepairMediaUrls from "./src/lib/rehype-repair-media-urls.mjs";
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export default defineConfig({
  site: "https://kentekencheck.net",
  output: "static",
  adapter: cloudflare({ imageService: "passthrough" }),
  trailingSlash: "always",
  build: { format: "directory" },
  prefetch: { prefetchAll: true, defaultStrategy: "viewport" },
  integrations: [
    mdx(),
    sitemap({
      filter: (page) =>
        !page.includes("/contact/bedankt/") && !page.includes("/404") && !page.includes("/kenteken/"),
    }),
    compress({ CSS: true, HTML: true, Image: false, JavaScript: true, SVG: true }),
  ],
  // Rewrites /media/... and bare-R2 <img> sources in post bodies to the
  // tenant's public R2 URL.
  markdown: { rehypePlugins: [rehypeRepairMediaUrls] },
  vite: {
    plugins: [tailwindcss()],
    envPrefix: ["PUBLIC_", "R2_", "TENANT", "PAYLOAD_"],
  },
});
