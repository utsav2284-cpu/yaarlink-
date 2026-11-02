"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import type { PublicCreatorDetail } from "@/backend/public-listings";
import { useLang } from "@/frontend/i18n";
import ReportButton from "@/frontend/components/ReportButton";

export default function CreatorDetail({ creator }: { creator: PublicCreatorDetail }) {
  const {
    t,
    opt,
    platform: platformLabel,
    status: statusLabel,
    formatCompactNumber,
    formatDateTime,
    formatRelativeTime,
  } = useLang();

  useEffect(() => {
    document.title = `${creator.name} · YaarLink`;
  }, [creator.name]);

  const profileLinks = Array.from(
    new Map(
      [creator.profileUrl, creator.instagram, creator.youtube]
        .filter((value): value is string => Boolean(value))
        .map((value) => [value.toLowerCase(), value]),
    ).values(),
  );
  const primaryProfile = profileLinks[0];

  const facts: Array<{ label: string; value: ReactNode }> = [
    {
      label: t("cr.followers"),
      value: `${formatCompactNumber(creator.followers)} ${t("browse.followers")}`,
    },
    { label: t("cr.platform"), value: platformLabel(creator.platform) },
    { label: t("cr.category"), value: opt(creator.category) },
    ...(creator.location ? [{ label: t("cr.city"), value: creator.location }] : []),
    { label: t("brand.language"), value: opt(creator.languages) },
    { label: t("cr.content"), value: opt(creator.contentTypes) },
    { label: t("listing.sortStatus"), value: statusLabel(creator.status) },
    {
      label: t("listing.listedLabel"),
      value: (
        <time dateTime={creator.createdAt} title={formatDateTime(creator.createdAt)}>
          {formatRelativeTime(creator.createdAt)}
        </time>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/brands#creator-discovery" className="text-[14px] font-bold text-[#c7431f] hover:underline">
        ← {t("detail.backToCreators")}
      </Link>

      <article className="mt-5 overflow-hidden rounded-[28px] border border-[#e9ddc3] bg-white card-shadow">
        <div className="bg-[#17452e] p-6 text-white sm:p-10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-[#ffc53d] text-[32px] font-black text-[#1c1917]">
              {creator.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#ffc53d] px-3 py-1 text-[12px] font-extrabold text-[#1c1917]">
                  {t("listing.reviewed")}
                </span>
                <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[12px] font-bold">
                  {statusLabel(creator.status)}
                </span>
              </div>
              <h1 className="font-display mt-3 break-words text-[34px] font-black leading-tight sm:text-[48px]">{creator.name}</h1>
              <p className="mt-2 text-[15.5px] font-semibold text-white/80">
                {[opt(creator.category), creator.location, opt(creator.languages)].filter(Boolean).join(" • ")}
              </p>
              <p className="mt-1 text-[13.5px] font-semibold text-white/65">
                <time dateTime={creator.createdAt} title={formatDateTime(creator.createdAt)}>
                  {t("listing.listed", { age: formatRelativeTime(creator.createdAt) })}
                </time>
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {primaryProfile && (
              <a
                href={primaryProfile}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl bg-[#ffc53d] px-6 py-3.5 text-[15px] font-extrabold text-[#1c1917] hover:bg-[#ffb703]"
              >
                {t("detail.openProfile")}
              </a>
            )}
            <Link
              href="/brands"
              className="rounded-2xl border border-white/40 px-6 py-3.5 text-[15px] font-extrabold text-white hover:bg-white hover:text-[#17452e]"
            >
              {t("dash.create")}
            </Link>
          </div>
        </div>

        <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
          <section>
            <h2 className="font-display text-[24px] font-black">{t("detail.aboutCreator")}</h2>
            <p className="mt-3 whitespace-pre-line text-[15.5px] leading-relaxed text-[#57534e]">
              {creator.bio || t("detail.noCreatorBio")}
            </p>
            <p className="mt-5 rounded-2xl border border-[#e9ddc3] bg-[#fffbf1] p-4 text-[14px] font-semibold leading-relaxed text-[#57534e]">
              {t("detail.creatorContactNote")}
            </p>
            {profileLinks.length > 0 && (
              <div className="mt-6">
                <h3 className="text-[15px] font-extrabold">{t("detail.profileLinks")}</h3>
                <ul className="mt-2 grid gap-2">
                  {profileLinks.map((link) => (
                    <li key={link}>
                      <a href={link} target="_blank" rel="noopener noreferrer" className="break-all text-[14px] font-bold text-[#c7431f] hover:underline">
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ReportButton targetType="creator" targetId={creator.id} targetName={creator.name} className="mt-6" />
          </section>

          <aside className="h-fit rounded-3xl border border-[#f0e6cc] bg-[#fffbf1] p-5">
            <h2 className="text-[16px] font-extrabold">{t("detail.creatorProfile")}</h2>
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
