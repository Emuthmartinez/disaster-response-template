import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

interface PageMetadataInput {
  title: string;
  description: string;
  path?: string;
  index?: boolean;
}

export function pageMetadata({
  title,
  description,
  path,
  index = true,
}: PageMetadataInput): Metadata {
  const fullTitle = `${title} · ${SITE_NAME}`;
  const meta: Metadata = {
    title: { absolute: fullTitle },
    description,
    openGraph: {
      title: fullTitle,
      description,
      type: "website",
      // Sin `images`: hereda la imagen generada por app/opengraph-image.tsx
      // (convención de archivo de Next.js) en vez de un binario estático.
      ...(path ? { url: path } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      // Sin `images`: hereda app/twitter-image.tsx.
    },
  };
  if (path) meta.alternates = { canonical: path };
  if (!index) meta.robots = { index: false, follow: false };
  return meta;
}
