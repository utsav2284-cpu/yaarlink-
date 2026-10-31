"use client";

import { useLang } from "@/frontend/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatINR } from "@/shared/constants";

type User = { id: string; name: string; email: string; role: string };
type Campaign = {
  id: string;
  title: string;
  businessName: string;
  location: string | null;
  language: string | null;
  format: string | null;
  budget: number | null;
  status: string | null;
  promotionType?: string | null;
  verificationCode?: string | null;
  verificationStatus?: string | null;
  moderationNote?: string | null;
};
type Application = {
  id: string;
  campaignId: string | null;
  creatorName?: string | null;
  creatorContact?: string | null;
  message: string | null;
  status: string | null;
  campaignTitle?: string | null;
  businessName?: string | null;
  format?: string | null;
};
type Profile = {
  id: string;
  name: string;
  category: string | null;
  followers: number | null;
  languages: string | null;
  status: string | null;
  platform?: string | null;
  location?: string | null;
  profileUrl?: string | null;
  instagram?: string | null;
  youtube?: string | null;
  verificationCode?: string | null;
  verificationStatus?: string | null;
  verifiedFollowers?: number | null;
  moderationNote?: string | null;
};

type Data = {
  user: User;
  campaigns?: Campaign[];
  applications: Application[];
  profiles?: Profile[];
  openCampaigns?: Campaign[];
};

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-2xl border border-[#e9ddc3] bg-white p-5 text-center">
      <p className="font-display text-[30px] font-black">{value}</p>
      <p className="text-[13px] font-bold text-[#78716c]">{label}</p>
    </div>
  );
}

function statusPillClass(status: string | null | undefined) {
  switch (status) {
    case "approved":
    case "open":
      return "bg-[#17452e] text-white";
    case "pending":
      return "bg-amber-100 text-amber-900";
    case "rejected":
    case "suspended":
      return "bg-red-100 text-red-800";
    default:
      return "bg-stone-100 text-stone-700";
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const { t, opt, platform: platformLabel } = useLang();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());

  useEffect(() => {
    fetch("/api/me/dashboard", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) {
          router.replace("/login");
          return;
        }
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load");
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, [router]);

  useEffect(() => {
    const id = window.setInterval(() => setCurrentHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/");
    router.refresh();
  };

  if (error) return <div className="mx-auto max-w-4xl p-10 text-center text-red-700">{error}</div>;
  if (!data)
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="h-10 w-64 animate-pulse rounded-xl bg-[#f0e6cc]" />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#f0e6cc]/70" />)}
        </div>
      </div>
    );

  const { user } = data;
  const isBrand = user.role === "brand";
  const greetingKey =
    currentHour >= 5 && currentHour < 12
      ? "dash.goodMorning"
      : currentHour >= 12 && currentHour < 17
        ? "dash.goodAfternoon"
        : currentHour >= 17 && currentHour < 22
          ? "dash.goodEvening"
          : "dash.goodNight";
  const accountLabel = isBrand ? t("dash.brandAccount") : t("dash.creatorAccount");
  const completedProfiles = (data.profiles ?? []).filter((profile) => profile.status !== "incomplete");
  const statusLabel = (status: string | null | undefined) => (status ? t(`status.${status}`) : "");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#e4572e]">{t(greetingKey)}, {user.name.split(" ")[0]} 🙏</p>
          <h1 className="font-display text-[30px] font-black sm:text-[40px]">{t("dash.title")}</h1>
          <p className="text-[14.5px] text-[#78716c]">
            {user.email} · <span className="font-bold">{accountLabel}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={isBrand ? "/brands" : "/campaigns"} className="rounded-2xl bg-[#e4572e] px-5 py-3 text-[14.5px] font-bold text-white hover:bg-[#c7431f]">
            {isBrand ? t("dash.newCampaign") : t("dash.findCampaigns")}
          </Link>
          <button onClick={logout} className="rounded-2xl border border-[#e9ddc3] bg-white px-5 py-3 text-[14.5px] font-bold">
            {t("dash.logout")}
          </button>
        </div>
      </div>

      {isBrand ? (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Stat value={data.campaigns?.length ?? 0} label={t("dash.statCampaigns")} />
            <Stat value={data.applications.length} label={t("dash.statApps")} />
            <Stat value={formatINR((data.campaigns ?? []).reduce((s, c) => s + (c.budget || 0), 0))} label={t("dash.statBudget")} />
          </div>

          <h2 className="mt-10 text-[19px] font-extrabold">{t("dash.yourCampaigns")}</h2>
          <div className="mt-3 grid gap-3">
            {(data.campaigns ?? []).length === 0 && (
              <div className="rounded-2xl border border-dashed border-[#e9ddc3] bg-white p-8 text-center">
                <p className="text-[15px] font-bold">{t("dash.noCampaigns")}</p>
                <p className="mt-1 text-[14px] text-[#78716c]">{t("dash.noCampaignsSub")}</p>
                <Link href="/brands" className="mt-4 inline-block rounded-xl bg-[#1c1917] px-5 py-2.5 text-[14px] font-bold text-white">{t("dash.create")}</Link>
              </div>
            )}
            {(data.campaigns ?? []).map((c) => {
              const apps = data.applications.filter((a) => a.campaignId === c.id);
              return (
                <div key={c.id} className="rounded-2xl border border-[#e9ddc3] bg-white p-5 card-shadow">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[16px] font-extrabold">{c.title}</p>
                      <p className="text-[13px] text-[#78716c]">{[c.businessName, c.location, opt(c.language), opt(c.format)].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="rounded-full bg-[#fff4de] px-3 py-1 text-[12.5px] font-bold" title="Only you can see this">🔒 {formatINR(c.budget || 0)}</span>
                      <span className={`rounded-full px-3 py-1 text-[12.5px] font-bold ${statusPillClass(c.status)}`}>{statusLabel(c.status)}</span>
                    </div>
                  </div>
                  {(c.status !== "open" || c.moderationNote) && (
                    <div className={`mt-3 rounded-xl border p-3 ${c.status === "rejected" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                      <p className="text-[13.5px] font-semibold text-[#44403c]">
                        {c.status === "pending" ? t("dash.campaignInReview") : t("verify.notPublic")}
                      </p>
                      {c.status === "pending" && c.verificationCode && (
                        <>
                          <p className="mt-2 text-[12px] font-bold uppercase tracking-widest text-amber-800">{t("dash.verificationCode")}</p>
                          <p className="font-mono text-[18px] font-black tracking-wider">{c.verificationCode}</p>
                          <p className="mt-1 text-[13px] leading-relaxed text-[#57534e]">{t("verify.businessHelp")}</p>
                        </>
                      )}
                      {c.moderationNote && (
                        <p className="mt-2 text-[13px] text-[#57534e]"><b>{t("dash.reviewNote")}:</b> {c.moderationNote}</p>
                      )}
                    </div>
                  )}
                  <div className="mt-3 rounded-xl border border-[#f0e6cc] bg-[#fffbf1] p-3">
                    <p className="text-[12px] font-bold uppercase tracking-widest text-[#a8a29e]">
                      {apps.length} application{apps.length === 1 ? "" : "s"}
                    </p>
                    {apps.length === 0 ? (
                      <p className="mt-1 text-[13.5px] text-[#78716c]">{t("dash.noApps")}</p>
                    ) : (
                      <div className="mt-2 grid gap-2">
                        {apps.map((a) => (
                          <div key={a.id} className="rounded-lg bg-white p-3 text-[13.5px]">
                            <p className="font-bold">{a.creatorName}</p>
                            {a.creatorContact && <p className="text-[#e4572e]">{a.creatorContact}</p>}
                            {a.message && <p className="mt-1 text-[#57534e]">“{a.message}”</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Stat value={completedProfiles.length} label={t("dash.statProfiles")} />
            <Stat value={data.applications.length} label={t("dash.statApplied")} />
            <Stat value={data.openCampaigns?.length ?? 0} label={t("dash.statOpen")} />
          </div>

          {completedProfiles.length === 0 && (
            <div className="mt-6 flex flex-col items-start justify-between gap-3 rounded-2xl bg-[#ffc53d] p-5 sm:flex-row sm:items-center">
              <p className="text-[15px] font-bold">{t("dash.completeProfile")}</p>
              <Link href="/creators" className="rounded-xl bg-[#1c1917] px-5 py-2.5 text-[14px] font-bold text-white">{t("dash.completeBtn")}</Link>
            </div>
          )}

          {completedProfiles.length > 0 && (
            <section className="mt-8">
              <h2 className="text-[19px] font-extrabold">{t("dash.profileStatus")}</h2>
              <div className="mt-3 grid gap-3">
                {completedProfiles.map((profile) => {
                  const profileLink = profile.profileUrl || profile.instagram || profile.youtube;
                  const followerCount = profile.verifiedFollowers ?? profile.followers ?? 0;
                  return (
                    <div key={profile.id} className="rounded-2xl border border-[#e9ddc3] bg-white p-5 card-shadow">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[16px] font-extrabold">{profile.name}</p>
                          <p className="text-[13px] text-[#78716c]">
                            {[platformLabel(profile.platform), opt(profile.category), opt(profile.languages), profile.location].filter(Boolean).join(" · ")}
                          </p>
                          <p className="mt-1 text-[13px] font-semibold text-[#57534e]">
                            {profile.verifiedFollowers != null ? t("dash.verifiedFollowers") : t("dash.claimedFollowers")}: {followerCount.toLocaleString("en-IN")}
                          </p>
                          {profileLink && (
                            <a href={profileLink} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-[13px] font-semibold text-[#e4572e]">
                              {profileLink}
                            </a>
                          )}
                        </div>
                        <span className={`rounded-full px-3 py-1 text-[12.5px] font-bold ${statusPillClass(profile.status)}`}>{statusLabel(profile.status)}</span>
                      </div>

                      {(profile.status !== "approved" || profile.moderationNote) && (
                        <div className={`mt-3 rounded-xl border p-3 ${profile.status === "rejected" || profile.status === "suspended" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                          <p className="text-[13.5px] font-semibold text-[#44403c]">
                            {profile.status === "pending" ? t("dash.creatorInReview") : t("verify.notPublic")}
                          </p>
                          {profile.status === "pending" && profile.verificationCode && (
                            <>
                              <p className="mt-2 text-[12px] font-bold uppercase tracking-widest text-amber-800">{t("dash.verificationCode")}</p>
                              <p className="font-mono text-[18px] font-black tracking-wider">{profile.verificationCode}</p>
                              <p className="mt-1 text-[13px] leading-relaxed text-[#57534e]">{t("verify.creatorHelp")}</p>
                            </>
                          )}
                          {profile.moderationNote && (
                            <p className="mt-2 text-[13px] text-[#57534e]"><b>{t("dash.reviewNote")}:</b> {profile.moderationNote}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="text-[19px] font-extrabold">{t("dash.yourApps")}</h2>
              <div className="mt-3 grid gap-3">
                {data.applications.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-[#e9ddc3] bg-white p-6 text-[14px] text-[#78716c]">
                    {t("dash.noAppsYet")} <Link href="/campaigns" className="font-bold text-[#e4572e]">{t("dash.browse")}</Link>
                  </p>
                )}
                {data.applications.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#e9ddc3] bg-white p-4">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-extrabold">{a.campaignTitle ?? "Campaign"}</p>
                      <p className="truncate text-[13px] text-[#78716c]">{[a.businessName, opt(a.format)].filter(Boolean).join(" · ")}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#fff4de] px-3 py-1 text-[12px] font-bold">{statusLabel(a.status)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-[19px] font-extrabold">{t("dash.fresh")}</h2>
              <div className="mt-3 grid gap-3">
                {(data.openCampaigns ?? []).map((c) => (
                  <Link key={c.id} href="/campaigns" className="rounded-2xl border border-[#e9ddc3] bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#1c1917]">
                    <p className="text-[15px] font-extrabold">{c.title}</p>
                    <p className="text-[13px] text-[#78716c]">{[c.businessName, c.location, opt(c.language), opt(c.format)].filter(Boolean).join(" · ")}</p>
                  </Link>
                ))}
                {(data.openCampaigns ?? []).length === 0 && (
                  <p className="rounded-2xl border border-dashed border-[#e9ddc3] bg-white p-6 text-[14px] text-[#78716c]">{t("dash.freshEmpty")}</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
