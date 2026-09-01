import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { draftField, imageField, statusField, stringListField } from "./lib/blog-schema";

const blog = defineCollection({
  loader: glob({
    base: "./src/content/blog",
    pattern: "**/*.{md,mdx}",
  }),
  // Payload writes a moving target: images as path/URL/media object, draft as a
  // boolean or "true", categories occasionally as numbers. Anything Zod rejects
  // silently drops the post from the site, so accept every shape and normalise.
  schema: z
    .object({
      title: z.string(),
      description: z.string().optional(),
      // Legacy WordPress/Sanity compat
      excerpt: z.string().optional(),
      metaDescription: z.string().optional(),
      pubDate: z.coerce.date().optional(),
      date: z.coerce.date().optional(),
      updatedDate: z.coerce.date().optional(),
      author: z.string().optional(),
      categories: stringListField,
      tags: stringListField,
      featuredImage: imageField,
      heroImage: imageField,
      image: imageField,
      ogImage: imageField,
      featuredImageAlt: z.string().optional(),
      imageAlt: z.string().optional(),
      slug: z.string().optional(),
      draft: draftField,
      _status: statusField,
    })
    .passthrough()
    .transform((data) => ({
      ...data,
      description: data.description ?? data.excerpt ?? data.metaDescription ?? "",
      pubDate: data.pubDate ?? data.date ?? new Date(),
    })),
});

export const collections = { blog };
