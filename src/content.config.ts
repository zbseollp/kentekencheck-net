import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({
    base: "./src/content/blog",
    pattern: "**/*.{md,mdx}",
  }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    // Legacy WordPress/Sanity compat
    excerpt: z.string().optional(),
    pubDate: z.coerce.date().optional(),
    date: z.coerce.date().optional(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().optional(),
    categories: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }).transform((data) => ({
    ...data,
    // Map legacy fields
    description: data.description ?? data.excerpt ?? "",
    pubDate: data.pubDate ?? data.date ?? new Date(),
  })),
});

export const collections = { blog };
