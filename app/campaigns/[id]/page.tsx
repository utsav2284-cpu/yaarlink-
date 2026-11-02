import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicCampaignDetail } from "@/backend/public-listings";
import { canonicalMetadata } from "@/config/metadata";
import CampaignDetail from "@/frontend/components/CampaignDetail";
import { translateForRequest } from "@/frontend/i18n/server";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

function metadataDescription(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > 180 ? `${clean.slice(0, 177).trimEnd()}…` : clean;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const campaign = await getPublicCampaignDetail(id);
  if (!campaign) {
    const base = await canonicalMetadata("/campaigns");
    return {
      ...base,
      title: { absolute: `${await translateForRequest("nf.title")} · YaarLink` },
      robots: { index: false, follow: false },
    };
  }

  const path = `/campaigns/${campaign.id}`;
  const base = await canonicalMetadata(path);
  const title = `${campaign.title} · YaarLink`;
  const description = metadataDescription(campaign.description || (await translateForRequest("detail.campaignMeta")));
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
      type: "article",
    },
  };
}

export default async function CampaignDetailPage({ params }: PageProps) {
  const { id } = await params;
  const campaign = await getPublicCampaignDetail(id);
  if (!campaign) notFound();
  return <CampaignDetail campaign={campaign} />;
}
