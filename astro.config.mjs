import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";
import compress from "astro-compress";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

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
  vite: { plugins: [tailwindcss()] },
});
