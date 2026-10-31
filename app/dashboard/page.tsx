"use client";

import { useLang } from "@/frontend/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CATEGORIES, CONTENT_TYPES, LANGUAGES, PLATFORMS, PROMOTION_TYPES, formatINR } from "@/shared/constants";
import PrivacyNotice from "@/frontend/components/PrivacyNotice";

type User = { id: string; name: string; email: string; phone?: string | null; role: string; emailVerifiedAt?: string | null; createdAt?: string };
type Campaign = {
  id: string;
  title: string;
  businessName: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  location: string | null;
  language: string | null;
  format: string | null;
  budget: number | null;
  status: string | null;
  promotionType?: string | null;
  category?: string | null;
  description?: string | null;
  targetAudience?: string | null;
  website?: string | null;
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
  decisionNote?: string | null;
  decisionAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  campaignTitle?: string | null;
  businessName?: string | null;
  format?: string | null;
};
type Profile = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  category: string | null;
  followers: number | null;
  languages: string | null;
  contentTypes?: string | null;
  bio?: string | null;
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
type Notification = {
  id: string;
  kind: string;
  campaignTitle: string;
  actorName?: string | null;
  applicationStatus?: string | null;
  readAt?: string | null;
  createdAt?: string | null;
};
type Data = {
  user: User;
  campaigns?: Campaign[];
  applications: Application[];
  profiles?: Profile[];
  openCampaigns?: Campaign[];
  notifications?: Notification[];
  unreadNotificationCount?: number;
};
type CampaignForm = {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  title: string;
  promotionType: string;
  category: string;
  website: string;
  targetAudience: string;
  location: string;
  language: string;
  format: string;
  description: string;
  budget: string;
};
type ProfileForm = {
  name: string;
  phone: string;
  email: string;
  platform: string;
  instagram: string;
  youtube: string;
  profileUrl: string;
  followers: string;
  category: string;
  languages: string[];
  location: string;
  contentTypes: string[];
  bio: string;
};

const inputClass = "w-full rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 text-[14px] outline-none focus:border-[#1c1917]";
const labelClass = "grid gap-1.5 text-[13.5px] font-bold";

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
    case "hired":
    case "completed":
      return "bg-[#17452e] text-white";
    case "shortlisted":
      return "bg-sky-100 text-sky-900";
    case "pending":
    case "paused":
    case "applied":
      return "bg-amber-100 text-amber-900";
    case "rejected":
    case "suspended":
      return "bg-red-100 text-red-800";
    default:
      return "bg-stone-100 text-stone-700";
  }
}

function splitList(value: string | null | undefined) {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function campaignToForm(c: Campaign): CampaignForm {
  return {
    businessName: c.businessName ?? "",
    contactName: c.contactName ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    title: c.title ?? "",
    promotionType: c.promotionType ?? "Product",
    category: c.category ?? "",
    website: c.website ?? "",
    targetAudience: c.targetAudience ?? "",
    location: c.location ?? "",
    language: c.language ?? "English",
    format: c.format ?? "Story",
    description: c.description ?? "",
    budget: String(c.budget ?? 5000),
  };
}

function profileToForm(p: Profile): ProfileForm {
  return {
    name: p.name ?? "",
    phone: p.phone ?? "",
    email: p.email ?? "",
    platform: p.platform ?? "Instagram",
    instagram: p.instagram ?? "",
    youtube: p.youtube ?? "",
    profileUrl: p.profileUrl ?? "",
    followers: String(p.followers ?? 0),
    category: p.category ?? "",
    languages: splitList(p.languages),
    location: p.location ?? "",
    contentTypes: splitList(p.contentTypes),
    bio: p.bio ?? "",
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const { lang, t, opt, promo, platform: platformLabel } = useLang();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  const [editingCampaignId, setEditingCampaignId] = useState("");
  const [campaignForm, setCampaignForm] = useState<CampaignForm | null>(null);
  const [editingProfileId, setEditingProfileId] = useState("");
  const [profileForm, setProfileForm] = useState<ProfileForm | null>(null);
  const [editingApplicationId, setEditingApplicationId] = useState("");
  const [reactivatingApplicationId, setReactivatingApplicationId] = useState("");
  const [applicationForm, setApplicationForm] = useState({ creatorContact: "", message: "" });
  const [applicationConsent, setApplicationConsent] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});

  const fetchData = useCallback(async (): Promise<Data | null> => {
    const r = await fetch("/api/me/dashboard", { cache: "no-store" });
    if (r.status === 401) {
      router.replace("/login");
      return null;
    }
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Could not load");
    return d as Data;
  }, [router]);

  const loadData = async () => {
    const d = await fetchData();
    if (d) setData(d);
  };

  useEffect(() => {
    fetchData()
      .then((d) => {
        if (d) setData(d);
      })
      .catch((e: Error) => setError(e.message));
  }, [fetchData]);

  useEffect(() => {
    const id = window.setInterval(() => setCurrentHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const jsonRequest = (url: string, method: string, body?: Record<string, unknown>) =>
    fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });

  const runAction = async (key: string, request: () => Promise<Response>, after?: () => void) => {
    setBusyKey(key);
    setNotice("");
    setActionError("");
    try {
      const res = await request();
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Action failed");
      await loadData();
      after?.();
      setNotice(t("dash.saved"));
    } catch {
      setActionError(t("dash.actionFailed"));
    } finally {
      setBusyKey("");
    }
  };

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
  const notifications = data.notifications ?? [];
  const unreadCount = data.unreadNotificationCount ?? notifications.filter((n) => !n.readAt).length;
  const statusLabel = (status: string | null | undefined) => (status ? t(`status.${status}`) : "");
  const dateLocale = lang === "hi" ? "hi-IN" : lang === "pa" ? "pa-IN" : "en-IN";
  const formatDate = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(dateLocale, { dateStyle: "medium" });
  };
  const notificationText = (n: Notification) => {
    const template = t(
      n.kind === "application_received" ? "notify.received" : n.kind === "application_withdrawn" ? "notify.withdrawn" : "notify.status",
    );
    return template
      .replace("{actor}", n.actorName ?? "")
      .replace("{campaign}", n.campaignTitle)
      .replace("{status}", statusLabel(n.applicationStatus));
  };

  const renderNotifications = () => (
    <section className="mt-8 rounded-[24px] border border-[#e9ddc3] bg-white p-5 card-shadow" aria-labelledby="notifications-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="notifications-heading" className="text-[19px] font-extrabold">
          {t("notify.title")} {unreadCount > 0 && <span className="ml-1 rounded-full bg-[#e4572e] px-2.5 py-1 text-[12px] text-white">{unreadCount} {t("notify.unread")}</span>}
        </h2>
        {unreadCount > 0 && (
          <button
            type="button"
            disabled={busyKey === "notifications:all"}
            onClick={() => runAction("notifications:all", () => jsonRequest("/api/me/notifications", "PATCH", { all: true }))}
            className="rounded-xl border border-[#e9ddc3] px-4 py-2 text-[13px] font-bold disabled:opacity-50"
          >
            {t("notify.markAllRead")}
          </button>
        )}
      </div>
      {notifications.length === 0 ? (
        <p className="mt-3 text-[14px] text-[#78716c]">{t("notify.empty")}</p>
      ) : (
        <div className="mt-4 grid gap-2">
          {notifications.map((n) => (
            <div key={n.id} className={`rounded-xl border p-3 ${n.readAt ? "border-[#f0e6cc] bg-white" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold">{notificationText(n)}</p>
                  <p className="mt-0.5 text-[12px] text-[#a8a29e]">{formatDate(n.createdAt)}</p>
                </div>
                {!n.readAt && (
                  <button
                    type="button"
                    disabled={busyKey === `notification:${n.id}`}
                    onClick={() => runAction(`notification:${n.id}`, () => jsonRequest("/api/me/notifications", "PATCH", { id: n.id }))}
                    className="rounded-lg bg-white px-3 py-1.5 text-[12px] font-bold disabled:opacity-50"
                  >
                    {t("notify.markRead")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  const renderCampaignEdit = (c: Campaign) => {
    if (editingCampaignId !== c.id || !campaignForm) return null;
    const busy = busyKey === `campaign:${c.id}:edit`;
    const set = (field: keyof CampaignForm, value: string) => setCampaignForm((f) => (f ? { ...f, [field]: value } : f));
    return (
      <form
        className="mt-4 rounded-2xl border border-[#e9ddc3] bg-[#fffbf1] p-4"
        onSubmit={(e) => {
          e.preventDefault();
          runAction(
            `campaign:${c.id}:edit`,
            () => jsonRequest("/api/campaigns", "PATCH", { id: c.id, ...campaignForm, budget: Number(campaignForm.budget || 0) }),
            () => {
              setEditingCampaignId("");
              setCampaignForm(null);
            },
          );
        }}
      >
        <h3 className="text-[16px] font-extrabold">{t("dash.editCampaign")}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[#78716c]">{t("dash.editReviewWarning")}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>{t("brand.businessName")}<input value={campaignForm.businessName} onChange={(e) => set("businessName", e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>{t("brand.contactName")}<input value={campaignForm.contactName} onChange={(e) => set("contactName", e.target.value)} className={inputClass} /></label>
          <label className={`${labelClass} sm:col-span-2`}>{t("brand.titleLabel")}<input value={campaignForm.title} onChange={(e) => set("title", e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>{t("brand.promoting")}
            <select value={campaignForm.promotionType} onChange={(e) => set("promotionType", e.target.value)} className={inputClass}>
              {PROMOTION_TYPES.map((p) => <option key={p.id} value={p.id}>{promo(p.title)}</option>)}
            </select>
          </label>
          <label className={labelClass}>{t("brand.category")}
            <select value={campaignForm.category} onChange={(e) => set("category", e.target.value)} className={inputClass}>
              <option value="">—</option>
              {CATEGORIES.map((category) => <option key={category} value={category}>{opt(category)}</option>)}
            </select>
          </label>
          <label className={labelClass}>{t("brand.website")}<input value={campaignForm.website} onChange={(e) => set("website", e.target.value)} placeholder={t("brand.phWebsite")} className={inputClass} /></label>
          <label className={labelClass}>{t("brand.audience")}<input value={campaignForm.targetAudience} onChange={(e) => set("targetAudience", e.target.value)} placeholder={t("brand.phAudience")} className={inputClass} /></label>
          <label className={labelClass}>{t("brand.location")}<input value={campaignForm.location} onChange={(e) => set("location", e.target.value)} placeholder={t("brand.phLocation")} className={inputClass} /></label>
          <label className={labelClass}>{t("brand.budget")}<input inputMode="numeric" value={campaignForm.budget} onChange={(e) => set("budget", e.target.value.replace(/[^0-9]/g, ""))} className={inputClass} /></label>
          <label className={labelClass}>{t("brand.language")}
            <select value={campaignForm.language} onChange={(e) => set("language", e.target.value)} className={inputClass}>
              {LANGUAGES.map((language) => <option key={language} value={language}>{opt(language)}</option>)}
            </select>
          </label>
          <label className={labelClass}>{t("brand.format")}
            <select value={campaignForm.format} onChange={(e) => set("format", e.target.value)} className={inputClass}>
              {CONTENT_TYPES.map((format) => <option key={format} value={format}>{opt(format)}</option>)}
            </select>
          </label>
          <label className={labelClass}>{t("brand.phone")}<input value={campaignForm.phone} onChange={(e) => set("phone", e.target.value)} placeholder={t("brand.phPhone")} className={inputClass} /></label>
          <label className={labelClass}>{t("brand.email")}<input value={campaignForm.email} onChange={(e) => set("email", e.target.value)} placeholder={t("brand.phEmail")} className={inputClass} /></label>
          <label className={`${labelClass} sm:col-span-2`}>{t("brand.descLabel")}<textarea value={campaignForm.description} onChange={(e) => set("description", e.target.value)} rows={4} placeholder={t("brand.phDesc")} className={inputClass} /></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className="rounded-xl bg-[#1c1917] px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50">{busy ? t("dash.saving") : t("dash.saveChanges")}</button>
          <button type="button" disabled={busy} onClick={() => { setEditingCampaignId(""); setCampaignForm(null); }} className="rounded-xl border border-[#e9ddc3] bg-white px-5 py-2.5 text-[13.5px] font-bold disabled:opacity-50">{t("dash.cancel")}</button>
        </div>
      </form>
    );
  };

  const renderBrandApplication = (a: Application) => {
    const actionable = a.status === "applied" || a.status === "shortlisted" || a.status === "hired";
    const decide = (action: string) => {
      if (action === "reject" && !window.confirm(t("dash.confirmRejectApplication"))) return;
      runAction(
        `application:${a.id}:${action}`,
        () => jsonRequest("/api/applications", "PATCH", { id: a.id, action, decisionNote: decisionNotes[a.id] ?? a.decisionNote ?? "" }),
        () => setDecisionNotes((notes) => { const next = { ...notes }; delete next[a.id]; return next; }),
      );
    };
    return (
      <div key={a.id} className="rounded-lg bg-white p-3 text-[13.5px]">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-bold">{a.creatorName}</p>
            {a.creatorContact && (
              <>
                <p className="break-all text-[#e4572e]">{a.creatorContact}</p>
                <p className="mt-0.5 text-[11.5px] font-semibold text-[#78716c]">🔒 {t("dash.brandContactUse")}</p>
              </>
            )}
            <p className="mt-0.5 text-[12px] text-[#a8a29e]">{t("dash.appliedOn")}: {formatDate(a.createdAt)}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${statusPillClass(a.status)}`}>{statusLabel(a.status)}</span>
        </div>
        {a.message && <p className="mt-2 text-[#57534e]">“{a.message}”</p>}
        {a.decisionNote && <p className="mt-2 rounded-lg bg-[#fffbf1] p-2 text-[12.5px] text-[#57534e]"><b>{t("dash.brandNote")}:</b> {a.decisionNote}</p>}
        {actionable && (
          <div className="mt-3 grid gap-2">
            <label className="grid gap-1 text-[12.5px] font-bold">
              {t("dash.decisionNote")}
              <textarea
                value={decisionNotes[a.id] ?? a.decisionNote ?? ""}
                onChange={(e) => setDecisionNotes((notes) => ({ ...notes, [a.id]: e.target.value }))}
                rows={2}
                placeholder={t("dash.decisionNotePh")}
                className="rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-3 py-2 text-[13px] font-normal outline-none focus:border-[#1c1917]"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {a.status === "applied" && <button type="button" disabled={busyKey === `application:${a.id}:shortlist`} onClick={() => decide("shortlist")} className="rounded-lg bg-sky-700 px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50">{t("dash.shortlist")}</button>}
              {(a.status === "applied" || a.status === "shortlisted") && <button type="button" disabled={busyKey === `application:${a.id}:hire`} onClick={() => decide("hire")} className="rounded-lg bg-[#17452e] px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50">{t("dash.hire")}</button>}
              {a.status === "hired" && <button type="button" disabled={busyKey === `application:${a.id}:complete`} onClick={() => decide("complete")} className="rounded-lg bg-[#17452e] px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-50">{t("dash.completeApplication")}</button>}
              {(a.status === "applied" || a.status === "shortlisted") && <button type="button" disabled={busyKey === `application:${a.id}:reject`} onClick={() => decide("reject")} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] font-bold text-red-800 disabled:opacity-50">{t("dash.rejectApplication")}</button>}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderProfileEdit = (profile: Profile) => {
    if (editingProfileId !== profile.id || !profileForm) return null;
    const busy = busyKey === `profile:${profile.id}:edit`;
    const set = (field: keyof ProfileForm, value: string | string[]) => setProfileForm((f) => (f ? { ...f, [field]: value } : f));
    const toggle = (field: "languages" | "contentTypes", value: string) =>
      setProfileForm((f) => {
        if (!f) return f;
        const values = f[field].includes(value) ? f[field].filter((x) => x !== value) : [...f[field], value];
        return { ...f, [field]: values };
      });
    return (
      <form
        className="mt-4 rounded-2xl border border-[#e9ddc3] bg-[#fffbf1] p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (profileForm.languages.length === 0) {
            setActionError(t("cr.err"));
            return;
          }
          runAction(`profile:${profile.id}:edit`, () => jsonRequest("/api/creators", "PATCH", { ...profileForm }), () => {
            setEditingProfileId("");
            setProfileForm(null);
          });
        }}
      >
        <h3 className="text-[16px] font-extrabold">{t("dash.editProfile")}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[#78716c]">{t("dash.editReviewWarning")}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>{t("cr.name")}<input value={profileForm.name} onChange={(e) => set("name", e.target.value)} placeholder={t("cr.phName")} className={inputClass} /></label>
          <label className={labelClass}>{t("cr.phone")}<input value={profileForm.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>{t("cr.email")}<input value={profileForm.email} onChange={(e) => set("email", e.target.value)} placeholder={t("cr.phEmail")} className={inputClass} /></label>
          <label className={labelClass}>{t("cr.city")}<input value={profileForm.location} onChange={(e) => set("location", e.target.value)} placeholder={t("cr.phCity")} className={inputClass} /></label>
          <label className={labelClass}>{t("cr.platform")}
            <select value={profileForm.platform} onChange={(e) => set("platform", e.target.value)} className={inputClass}>
              {PLATFORMS.map((platform) => <option key={platform} value={platform}>{platformLabel(platform)}</option>)}
            </select>
          </label>
          <label className={labelClass}>{t("cr.profileLink")}<input value={profileForm.profileUrl} onChange={(e) => set("profileUrl", e.target.value)} placeholder={t("cr.phProfile")} className={inputClass} /></label>
          <label className={labelClass}>{t("cr.instagram")}<input value={profileForm.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder={t("cr.phIg")} className={inputClass} /></label>
          <label className={labelClass}>{t("cr.youtube")}<input value={profileForm.youtube} onChange={(e) => set("youtube", e.target.value)} placeholder={t("cr.phYt")} className={inputClass} /></label>
          <label className={labelClass}>{t("cr.followers")}<input inputMode="numeric" value={profileForm.followers} onChange={(e) => set("followers", e.target.value.replace(/[^0-9]/g, ""))} placeholder={t("cr.phFollowers")} className={inputClass} /></label>
          <label className={labelClass}>{t("cr.category")}
            <select value={profileForm.category} onChange={(e) => set("category", e.target.value)} className={inputClass}>
              <option value="">—</option>
              {CATEGORIES.map((category) => <option key={category} value={category}>{opt(category)}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4">
          <p className="text-[13.5px] font-bold">{t("cr.langs")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {LANGUAGES.map((language) => (
              <button key={language} type="button" onClick={() => toggle("languages", language)} className={`rounded-full border px-4 py-2 text-[13px] font-bold ${profileForm.languages.includes(language) ? "border-[#1c1917] bg-[#1c1917] text-white" : "border-[#e9ddc3] bg-white"}`}>{opt(language)}</button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <p className="text-[13.5px] font-bold">{t("cr.content")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CONTENT_TYPES.map((contentType) => (
              <button key={contentType} type="button" onClick={() => toggle("contentTypes", contentType)} className={`rounded-full border px-4 py-2 text-[13px] font-bold ${profileForm.contentTypes.includes(contentType) ? "border-[#e4572e] bg-[#e4572e] text-white" : "border-[#e9ddc3] bg-white"}`}>{opt(contentType)}</button>
            ))}
          </div>
        </div>
        <label className={`${labelClass} mt-4`}>{t("cr.bio")}<textarea value={profileForm.bio} onChange={(e) => set("bio", e.target.value)} rows={3} placeholder={t("cr.phBio")} className={inputClass} /></label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className="rounded-xl bg-[#1c1917] px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50">{busy ? t("dash.saving") : t("dash.saveChanges")}</button>
          <button type="button" disabled={busy} onClick={() => { setEditingProfileId(""); setProfileForm(null); }} className="rounded-xl border border-[#e9ddc3] bg-white px-5 py-2.5 text-[13.5px] font-bold disabled:opacity-50">{t("dash.cancel")}</button>
        </div>
      </form>
    );
  };

  const renderCreatorApplication = (a: Application) => {
    const editing = editingApplicationId === a.id;
    const reactivating = reactivatingApplicationId === a.id;
    const applicationFormOpen = editing || reactivating;
    const canEdit = a.status === "applied" || a.status === "shortlisted";
    const canWithdraw = canEdit || a.status === "hired";
    return (
      <div key={a.id} className="rounded-2xl border border-[#e9ddc3] bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-extrabold">{a.campaignTitle ?? t("nav.campaigns")}</p>
            <p className="truncate text-[13px] text-[#78716c]">{[a.businessName, opt(a.format)].filter(Boolean).join(" · ")}</p>
            <p className="mt-0.5 text-[12px] text-[#a8a29e]">{t("dash.appliedOn")}: {formatDate(a.createdAt)}</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-bold ${statusPillClass(a.status)}`}>{statusLabel(a.status)}</span>
        </div>
        {a.message && <p className="mt-3 text-[13.5px] text-[#57534e]"><b>{t("dash.yourMessage")}:</b> “{a.message}”</p>}
        {a.creatorContact && (
          <p className="mt-2 break-all text-[13px] text-[#57534e]">
            <b>{t("dash.sharedContact")}:</b> {a.creatorContact}
          </p>
        )}
        {a.decisionNote && <p className="mt-2 rounded-xl bg-[#fffbf1] p-3 text-[13px] text-[#57534e]"><b>{t("dash.brandNote")}:</b> {a.decisionNote}</p>}

        {applicationFormOpen ? (
          <form
            className="mt-3 grid gap-3 rounded-xl border border-[#e9ddc3] bg-[#fffbf1] p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (reactivating) {
                runAction(
                  `application:${a.id}:reactivate`,
                  () =>
                    jsonRequest("/api/applications", "PATCH", {
                      id: a.id,
                      action: "reactivate",
                      ...applicationForm,
                      contactSharingConsent: applicationConsent,
                    }),
                  () => {
                    setReactivatingApplicationId("");
                    setApplicationConsent(false);
                  },
                );
                return;
              }
              runAction(
                `application:${a.id}:edit`,
                () => jsonRequest("/api/applications", "PATCH", { id: a.id, action: "edit", ...applicationForm }),
                () => setEditingApplicationId(""),
              );
            }}
          >
            <PrivacyNotice textKey={reactivating ? "dash.reactivateNotice" : "privacy.applicationEditNotice"} compact />
            <label className={labelClass}>
              {t("dash.contactForBrand")}
              <input
                value={applicationForm.creatorContact}
                onChange={(e) => setApplicationForm((f) => ({ ...f, creatorContact: e.target.value }))}
                required
                minLength={3}
                placeholder={t("camp.applyContact")}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>{t("dash.yourMessage")}<textarea value={applicationForm.message} onChange={(e) => setApplicationForm((f) => ({ ...f, message: e.target.value }))} rows={3} placeholder={t("camp.applyPhMsg")} className={inputClass} /></label>
            {reactivating && (
              <label htmlFor={`reactivate-consent-${a.id}`} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#e9ddc3] bg-white px-3.5 py-3 text-[13px] font-semibold leading-relaxed text-[#57534e]">
                <input
                  id={`reactivate-consent-${a.id}`}
                  type="checkbox"
                  checked={applicationConsent}
                  onChange={(e) => setApplicationConsent(e.target.checked)}
                  required
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#e4572e]"
                />
                <span>{t("dash.reactivateConsent")}</span>
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={
                  applicationForm.creatorContact.trim().length < 3 ||
                  (reactivating && !applicationConsent) ||
                  busyKey === `application:${a.id}:${reactivating ? "reactivate" : "edit"}`
                }
                className="rounded-xl bg-[#1c1917] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {reactivating ? t("dash.reactivateApplication") : t("dash.saveChanges")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingApplicationId("");
                  setReactivatingApplicationId("");
                  setApplicationConsent(false);
                }}
                className="rounded-xl border border-[#e9ddc3] bg-white px-4 py-2 text-[13px] font-bold"
              >
                {t("dash.cancel")}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setEditingApplicationId(a.id);
                  setReactivatingApplicationId("");
                  setApplicationConsent(false);
                  setApplicationForm({ creatorContact: a.creatorContact ?? "", message: a.message ?? "" });
                }}
                className="rounded-xl bg-[#1c1917] px-4 py-2 text-[13px] font-bold text-white"
              >
                {t("dash.editApplication")}
              </button>
            )}
            {canWithdraw && (
              <button
                type="button"
                disabled={busyKey === `application:${a.id}:withdraw`}
                onClick={() => {
                  if (window.confirm(t("dash.confirmWithdraw"))) {
                    runAction(`application:${a.id}:withdraw`, () => jsonRequest("/api/applications", "PATCH", { id: a.id, action: "withdraw" }));
                  }
                }}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[13px] font-bold text-red-800 disabled:opacity-50"
              >
                {t("dash.withdrawApplication")}
              </button>
            )}
            {a.status === "withdrawn" && (
              <button
                type="button"
                disabled={busyKey === `application:${a.id}:reactivate`}
                onClick={() => {
                  setEditingApplicationId("");
                  setReactivatingApplicationId(a.id);
                  setApplicationConsent(false);
                  setApplicationForm({ creatorContact: a.creatorContact ?? "", message: a.message ?? "" });
                }}
                className="rounded-xl bg-[#e4572e] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {t("dash.reactivateApplication")}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#e4572e]">{t(greetingKey)}, {user.name.split(" ")[0]} 🙏</p>
          <h1 className="font-display text-[30px] font-black sm:text-[40px]">{t("dash.title")}</h1>
          <p className="text-[14.5px] text-[#78716c]">{user.email} · <span className="font-bold">{accountLabel}</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={isBrand ? "/brands" : "/campaigns"} className="rounded-2xl bg-[#e4572e] px-5 py-3 text-[14.5px] font-bold text-white hover:bg-[#c7431f]">
            {isBrand ? t("dash.newCampaign") : t("dash.findCampaigns")}
          </Link>
          <Link href="/account" className="rounded-2xl border border-[#1c1917] bg-white px-5 py-3 text-[14.5px] font-bold">{t("dash.accountSettings")}</Link>
          <button onClick={logout} className="rounded-2xl border border-[#e9ddc3] bg-white px-5 py-3 text-[14.5px] font-bold">{t("dash.logout")}</button>
        </div>
      </div>

      {notice && <p role="status" className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-[14px] font-bold text-green-800">{notice}</p>}
      {actionError && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-bold text-red-700">{actionError}</p>}

      {!user.emailVerifiedAt && (
        <div className="mt-5 flex flex-col justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-[14.5px] font-extrabold text-amber-950">{t("dash.emailNotVerified")}</p>
            <p className="mt-0.5 text-[13.5px] text-[#57534e]">{t("dash.emailNotVerifiedHelp")}</p>
          </div>
          <Link href="/account" className="shrink-0 rounded-xl bg-[#1c1917] px-4 py-2.5 text-center text-[13.5px] font-bold text-white">{t("dash.verifyNow")}</Link>
        </div>
      )}

      {renderNotifications()}

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
              const campaignBusy = busyKey.startsWith(`campaign:${c.id}:`);
              return (
                <div key={c.id} className="rounded-2xl border border-[#e9ddc3] bg-white p-5 card-shadow">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[16px] font-extrabold">{c.title}</p>
                      <p className="text-[13px] text-[#78716c]">{[c.businessName, c.location, opt(c.language), opt(c.format)].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="rounded-full bg-[#fff4de] px-3 py-1 text-[12.5px] font-bold">🔒 {formatINR(c.budget || 0)}</span>
                      <span className={`rounded-full px-3 py-1 text-[12.5px] font-bold ${statusPillClass(c.status)}`}>{statusLabel(c.status)}</span>
                    </div>
                  </div>

                  {(c.status !== "open" || c.verificationStatus !== "verified" || c.moderationNote) && (
                    <div className={`mt-3 rounded-xl border p-3 ${c.status === "rejected" || c.status === "suspended" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                      <p className="text-[13.5px] font-semibold text-[#44403c]">
                        {c.status === "pending" ? t("dash.campaignInReview") : c.status === "paused" ? t("dash.campaignPaused") : t("verify.notPublic")}
                      </p>
                      {c.status === "pending" && c.verificationCode && (
                        <>
                          <p className="mt-2 text-[12px] font-bold uppercase tracking-widest text-amber-800">{t("dash.verificationCode")}</p>
                          <p className="font-mono text-[18px] font-black tracking-wider">{c.verificationCode}</p>
                          <p className="mt-1 text-[13px] leading-relaxed text-[#57534e]">{t("verify.businessHelp")}</p>
                        </>
                      )}
                      {c.moderationNote && <p className="mt-2 text-[13px] text-[#57534e]"><b>{t("dash.reviewNote")}:</b> {c.moderationNote}</p>}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCampaignId(c.id);
                        setCampaignForm(campaignToForm(c));
                      }}
                      className="rounded-xl bg-[#1c1917] px-4 py-2 text-[13px] font-bold text-white"
                    >
                      {t("dash.editCampaign")}
                    </button>
                    {c.status === "open" && (
                      <button type="button" disabled={campaignBusy} onClick={() => runAction(`campaign:${c.id}:pause`, () => jsonRequest("/api/campaigns", "PATCH", { id: c.id, action: "pause" }))} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] font-bold text-amber-900 disabled:opacity-50">{t("dash.pauseCampaign")}</button>
                    )}
                    {(c.status === "paused" || c.status === "closed" || c.status === "rejected") && (
                      <button type="button" disabled={campaignBusy} onClick={() => runAction(`campaign:${c.id}:republish`, () => jsonRequest("/api/campaigns", "PATCH", { id: c.id, action: "republish" }))} className="rounded-xl bg-[#17452e] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
                        {c.status === "paused" ? t("dash.republishCampaign") : t("dash.resubmitCampaign")}
                      </button>
                    )}
                    {c.status !== "closed" && (
                      <button
                        type="button"
                        disabled={campaignBusy}
                        onClick={() => {
                          if (window.confirm(t("dash.confirmCloseCampaign"))) {
                            runAction(`campaign:${c.id}:close`, () => jsonRequest("/api/campaigns", "PATCH", { id: c.id, action: "close" }));
                          }
                        }}
                        className="rounded-xl border border-[#e9ddc3] bg-white px-4 py-2 text-[13px] font-bold disabled:opacity-50"
                      >
                        {t("dash.closeCampaign")}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={campaignBusy}
                      onClick={() => {
                        if (window.confirm(t("dash.confirmDeleteCampaign"))) {
                          runAction(`campaign:${c.id}:delete`, () => jsonRequest("/api/campaigns", "DELETE", { id: c.id }), () => {
                            if (editingCampaignId === c.id) {
                              setEditingCampaignId("");
                              setCampaignForm(null);
                            }
                          });
                        }
                      }}
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[13px] font-bold text-red-800 disabled:opacity-50"
                    >
                      {t("dash.deleteCampaign")}
                    </button>
                  </div>

                  {renderCampaignEdit(c)}

                  <div className="mt-4 rounded-xl border border-[#f0e6cc] bg-[#fffbf1] p-3">
                    <p className="text-[12px] font-bold uppercase tracking-widest text-[#a8a29e]">{apps.length} {t("dash.applications")}</p>
                    {apps.length === 0 ? (
                      <p className="mt-1 text-[13.5px] text-[#78716c]">{t("dash.noApps")}</p>
                    ) : (
                      <div className="mt-2 grid gap-2">{apps.map(renderBrandApplication)}</div>
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
                          <p className="text-[13px] text-[#78716c]">{[platformLabel(profile.platform), opt(profile.category), opt(profile.languages), profile.location].filter(Boolean).join(" · ")}</p>
                          <p className="mt-1 text-[13px] font-semibold text-[#57534e]">
                            {profile.verifiedFollowers != null ? t("dash.verifiedFollowers") : t("dash.claimedFollowers")}: {followerCount.toLocaleString("en-IN")}
                          </p>
                          {profileLink && (
                            <a href={profileLink} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-[13px] font-semibold text-[#e4572e]">{profileLink}</a>
                          )}
                        </div>
                        <span className={`rounded-full px-3 py-1 text-[12.5px] font-bold ${statusPillClass(profile.status)}`}>{statusLabel(profile.status)}</span>
                      </div>

                      {(profile.status !== "approved" || profile.verificationStatus !== "verified" || profile.moderationNote) && (
                        <div className={`mt-3 rounded-xl border p-3 ${profile.status === "rejected" || profile.status === "suspended" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                          <p className="text-[13.5px] font-semibold text-[#44403c]">{profile.status === "pending" ? t("dash.creatorInReview") : t("verify.notPublic")}</p>
                          {profile.status === "pending" && profile.verificationCode && (
                            <>
                              <p className="mt-2 text-[12px] font-bold uppercase tracking-widest text-amber-800">{t("dash.verificationCode")}</p>
                              <p className="font-mono text-[18px] font-black tracking-wider">{profile.verificationCode}</p>
                              <p className="mt-1 text-[13px] leading-relaxed text-[#57534e]">{t("verify.creatorHelp")}</p>
                            </>
                          )}
                          {profile.moderationNote && <p className="mt-2 text-[13px] text-[#57534e]"><b>{t("dash.reviewNote")}:</b> {profile.moderationNote}</p>}
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProfileId(profile.id);
                            setProfileForm(profileToForm(profile));
                          }}
                          className="rounded-xl bg-[#1c1917] px-4 py-2 text-[13px] font-bold text-white"
                        >
                          {t("dash.editProfile")}
                        </button>
                        <button
                          type="button"
                          disabled={busyKey === `profile:${profile.id}:delete`}
                          onClick={() => {
                            if (window.confirm(t("dash.confirmDeleteProfile"))) {
                              runAction(`profile:${profile.id}:delete`, () => jsonRequest("/api/creators", "DELETE"), () => {
                                if (editingProfileId === profile.id) {
                                  setEditingProfileId("");
                                  setProfileForm(null);
                                }
                              });
                            }
                          }}
                          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[13px] font-bold text-red-800 disabled:opacity-50"
                        >
                          {t("dash.deleteProfile")}
                        </button>
                      </div>

                      {renderProfileEdit(profile)}
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
                {data.applications.map(renderCreatorApplication)}
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
