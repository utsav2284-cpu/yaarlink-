"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import type { PublicCampaignDetail } from "@/backend/public-listings";
import { useLang } from "@/frontend/i18n";
import ReportButton from "@/frontend/components/ReportButton";

export default function CampaignDetail({ campaign }: { campaign: PublicCampaignDetail }) {
  const { t, opt, promo, status: statusLabel, formatDate, formatDateTime, formatRelativeTime } = useLang();
  const effectiveDeadline = campaign.deadlineAt ?? campaign.expiresAt;
  const campaignIsOpen = campaign.status === "open" && campaign.verificationStatus === "verified";

  useEffect(() => {
    document.title = `${campaign.title} · YaarLink`;
  }, [campaign.title]);

  const facts: Array<{ label: string; value: ReactNode }> = [
    { label: t("brand.promoting"), value: promo(campaign.promotionType) },
    { label: t("listing.sortStatus"), value: statusLabel(campaign.status) },
    { label: t("brand.language"), value: opt(campaign.language) },
    { label: t("brand.format"), value: opt(campaign.format) },
    ...(campaign.category ? [{ label: t("brand.category"), value: opt(campaign.category) }] : []),
    ...(campaign.location ? [{ label: t("brand.location"), value: campaign.location }] : []),
    ...(campaign.targetAudience ? [{ label: t("brand.audience"), value: campaign.targetAudience }] : []),
    {
      label: t("listing.postedLabel"),
      value: (
        <time dateTime={campaign.createdAt} title={formatDateTime(campaign.createdAt)}>
          {formatRelativeTime(campaign.createdAt)}
        </time>
      ),
    },
    {
      label: t("dash.deadline"),
      value: (
        <time dateTime={effectiveDeadline} title={formatDateTime(effectiveDeadline)}>
          {formatDate(effectiveDeadline)}
        </time>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/campaigns" className="text-[14px] font-bold text-[#c7431f] hover:underline">
        ← {t("detail.backToCampaigns")}
      </Link>

      <article className="mt-5 overflow-hidden rounded-[28px] border border-[#e9ddc3] bg-white card-shadow">
        <div className="bg-[#fff4de] p-6 sm:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#e9ddc3] bg-white px-3 py-1 text-[12px] font-bold">
              {promo(campaign.promotionType)}
            </span>
            <span className={`rounded-full border px-3 py-1 text-[12px] font-bold ${campaignIsOpen ? "border-green-200 bg-green-50 text-green-800" : "border-stone-200 bg-stone-100 text-stone-700"}`}>
              {statusLabel(campaign.status)}
            </span>
            {campaign.verificationStatus === "verified" && (
              <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-[12px] font-bold text-green-800">
                {t("listing.reviewed")}
              </span>
            )}
          </div>
          <h1 className="font-display mt-4 text-[34px] font-black leading-tight sm:text-[48px]">{campaign.title}</h1>
          <p className="mt-2 text-[16px] font-semibold text-[#57534e]">
            {[campaign.businessName, campaign.location].filter(Boolean).join(" • ")}
          </p>
          <p className="mt-1 text-[13.5px] font-semibold text-[#6f6862]">
            <time dateTime={campaign.createdAt} title={formatDateTime(campaign.createdAt)}>
              {t("listing.posted", { age: formatRelativeTime(campaign.createdAt) })}
            </time>
            {" • "}
            <time dateTime={effectiveDeadline} title={formatDateTime(effectiveDeadline)}>
              {t("camp.applyBy", { date: formatDate(effectiveDeadline) })}
            </time>
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/campaigns?apply=${encodeURIComponent(campaign.id)}`}
              className="rounded-2xl bg-[#c7431f] px-6 py-3.5 text-[15px] font-extrabold text-white hover:bg-[#a93618]"
            >
              {t("camp.apply")}
            </Link>
            <span className="rounded-2xl border border-[#e9ddc3] bg-white px-5 py-3.5 text-[14px] font-bold text-[#17452e]">
              {t("camp.paid")}
            </span>
          </div>
        </div>

        <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
          <section>
            <h2 className="font-display text-[24px] font-black">{t("detail.aboutCampaign")}</h2>
            <p className="mt-3 whitespace-pre-line text-[15.5px] leading-relaxed text-[#57534e]">
              {campaign.description || t("detail.noCampaignDescription")}
            </p>
            {campaign.website && (
              <p className="mt-5">
                <a
                  href={campaign.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-[14.5px] font-bold text-[#c7431f] hover:underline"
                >
                  {t("detail.visitWebsite")}: {campaign.website}
                </a>
              </p>
            )}
            <ReportButton targetType="campaign" targetId={campaign.id} targetName={campaign.title} className="mt-6" />
          </section>

          <aside className="h-fit rounded-3xl border border-[#f0e6cc] bg-[#fffbf1] p-5">
            <h2 className="text-[16px] font-extrabold">{t("detail.campaignDetails")}</h2>
            <dl className="mt-4 grid gap-4">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt className="text-[12px] font-bold uppercase tracking-widest text-[#6f6862]">{fact.label}</dt>
                  <dd className="mt-1 text-[14.5px] font-semibold leading-relaxed text-[#1c1917]">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </article>
    </div>
  );
}
