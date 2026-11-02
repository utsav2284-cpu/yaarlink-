import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicCreatorDetail } from "@/backend/public-listings";
import { canonicalMetadata } from "@/config/metadata";
import CreatorDetail from "@/frontend/components/CreatorDetail";
import { translateForRequest } from "@/frontend/i18n/server";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

function metadataDescription(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > 180 ? `${clean.slice(0, 177).trimEnd()}…` : clean;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const creator = await getPublicCreatorDetail(id);
  if (!creator) {
    const base = await canonicalMetadata("/creators");
    return {
      ...base,
      title: { absolute: `${await translateForRequest("nf.title")} · YaarLink` },
      robots: { index: false, follow: false },
    };
  }

  const path = `/creators/${creator.id}`;
  const base = await canonicalMetadata(path);
  const title = `${creator.name} · YaarLink`;
  const description = metadataDescription(creator.bio || (await translateForRequest("detail.creatorMeta")));
  return {
    ...base,
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      ...(base.openGraph ?? {}),
      title,
      description,
      url: path,
      type: "profile",
    },
  };
}

export default async function CreatorDetailPage({ params }: PageProps) {
  const { id } = await params;
  const creator = await getPublicCreatorDetail(id);
  if (!creator) notFound();
  return <CreatorDetail creator={creator} />;
}
