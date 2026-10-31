"use client";

import { useEffect, useState } from "react";
import { formatINR } from "@/shared/constants";

type Tab = "campaigns" | "creators" | "reports" | "applications" | "contacts" | "audit";
type ModerationEntity = "campaign" | "creator" | "report";

const emptyAdminData = () => ({ campaigns: [], creators: [], applications: [], contacts: [], reports: [], auditLogs: [] });

const REPORT_REASON_LABELS: Record<string, string> = {
  impersonation: "Impersonation / not the owner",
  scam: "Scam or fraud",
  spam: "Spam",
  "incorrect-info": "Incorrect information",
  other: "Other",
};

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function statusClass(status?: string | null, isReport = false) {
  if (isReport && status === "open") return "bg-red-100 text-red-800";
  switch (status) {
    case "approved":
    case "open":
    case "verified":
    case "resolved":
    case "success":
      return "bg-green-100 text-green-800";
    case "pending":
      return "bg-amber-100 text-amber-900";
    case "rejected":
    case "suspended":
    case "failed":
    case "failure":
      return "bg-red-100 text-red-800";
    default:
      return "bg-stone-100 text-stone-700";
  }
}

function StatusPill({ status, isReport = false }: { status?: string | null; isReport?: boolean }) {
  if (!status) return <span className="text-stone-400">—</span>;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-bold capitalize ${statusClass(status, isReport)}`}>
      {status}
    </span>
  );
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  tone = "neutral",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "danger" | "warning" | "neutral";
}) {
  const classes =
    tone === "primary"
      ? "bg-[#17452e] text-white hover:bg-[#123623]"
      : tone === "danger"
        ? "border border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
        : tone === "warning"
          ? "border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
          : "border border-[#e9ddc3] bg-white text-[#1c1917] hover:bg-[#fffbf1]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`whitespace-nowrap rounded-lg px-3 py-2 text-[12.5px] font-bold disabled:cursor-not-allowed disabled:opacity-50 ${classes}`}
    >
      {children}
    </button>
  );
}

function ProfileLinks({ links }: { links: Array<string | null | undefined> }) {
  const uniqueLinks = [...new Set(links.filter(Boolean) as string[])];
  if (uniqueLinks.length === 0) return <span className="text-stone-400">—</span>;
  return (
    <div className="grid max-w-[230px] gap-1">
      {uniqueLinks.map((link) => (
        <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="break-all text-[12px] font-semibold text-[#e4572e] hover:underline">
          {link}
        </a>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const [data, setData] = useState<any>(emptyAdminData);
  const [tab, setTab] = useState<Tab>("campaigns");
  const [key, setKey] = useState("");
  const [totp, setTotp] = useState("");
  const [authed, setAuthed] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [verifiedFollowers, setVerifiedFollowers] = useState<Record<string, string>>({});

  const clearAdminState = () => {
    setData(emptyAdminData());
    setVerifiedFollowers({});
    setTab("campaigns");
    setKey("");
    setTotp("");
    setNotice("");
    setBusyKey("");
    setAuthed(false);
  };

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/data", { credentials: "include", cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Wrong password");
      setData({ ...emptyAdminData(), ...d });
      setAuthed(true);
    } catch (e: any) {
      const message = e.message || "Could not load admin data";
      clearAdminState();
      setErr(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const moderate = async (entity: ModerationEntity, id: string, action: string, extra: Record<string, unknown> = {}) => {
    if (action === "delete" && !window.confirm("Delete this listing permanently?")) return;
    if (action === "approve") {
      const confirmed = window.confirm(
        entity === "creator"
          ? "Confirm: the creator sent this code from the linked social account (or placed it in the bio/about section), and the follower count has been checked."
          : "Confirm: the brand sent this code from the business WhatsApp, email, or official social account connected with this campaign.",
      );
      if (!confirmed) return;
    }

    let note: string | undefined;
    if (["reject", "suspend", "close", "review"].includes(action)) {
      const entered = window.prompt("Optional note for the owner (leave blank if none):", "");
      if (entered === null) return;
      note = entered.trim() || undefined;
    }

    const actionKey = `${entity}:${id}:${action}`;
    setBusyKey(actionKey);
    setErr("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ entity, id, action, note, ...extra }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Moderation action failed");
      await load();
      setNotice("Moderation updated.");
    } catch (e: any) {
      setErr(e.message || "Moderation action failed");
    } finally {
      setBusyKey("");
    }
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: key, totp: totp.trim() || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Wrong password");
      setKey("");
      setTotp("");
      await load();
    } catch (error: any) {
      setData(emptyAdminData());
      setVerifiedFollowers({});
      setTotp("");
      setAuthed(false);
      setErr(error.message || "Could not log in");
      setLoading(false);
    }
  };

  const lockAdmin = async () => {
    // Remove sensitive rows from memory/DOM immediately; the browser cookie is
    // independent of React state and is still sent with the logout request.
    clearAdminState();
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/logout", { method: "POST", credentials: "include", cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Server-side sign-out failed. Please try again.");
    } catch (error: any) {
      setErr(error.message || "Admin data was cleared locally, but server-side sign-out failed. Log in again and choose Lock admin to revoke all sessions.");
    } finally {
      setLoading(false);
    }
  };

  if (!authed) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <form
          onSubmit={login}
          className="rounded-[28px] border border-[#e9ddc3] bg-white p-8 card-shadow"
        >
          <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#e4572e]">Owner only 🔒</p>
          <h1 className="font-display mt-1 text-[28px] font-black">Admin login</h1>
          <p className="mt-1 text-[14px] text-[#78716c]">Budgets and contact details are visible only here.</p>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Admin password"
            autoComplete="current-password"
            className="mt-5 w-full rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]"
          />
          <input
            type="text"
            value={totp}
            onChange={(e) => setTotp(e.target.value.replace(/[^0-9 ]/g, "").slice(0, 7))}
            placeholder="Authenticator code (if enabled)"
            autoComplete="one-time-code"
            inputMode="numeric"
            className="mt-3 w-full rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]"
          />
          {err && <p className="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13.5px] font-bold text-red-700">{err}</p>}
          <button disabled={loading || !key} className="mt-4 w-full rounded-2xl bg-[#1c1917] py-3.5 text-[15.5px] font-extrabold text-white disabled:opacity-50">
            {loading ? "Checking…" : "Open admin →"}
          </button>
        </form>
      </div>
    );
  }

  const campaigns = data.campaigns ?? [];
  const creators = data.creators ?? [];
  const applications = data.applications ?? [];
  const contacts = data.contacts ?? [];
  const reports = data.reports ?? [];
  const auditLogs = data.auditLogs ?? [];
  const pendingReviews =
    campaigns.filter((c: any) => c.status === "pending").length +
    creators.filter((c: any) => c.status === "pending").length;
  const openReports = reports.filter((r: any) => r.status === "open").length;
  const activeRows =
    tab === "campaigns" ? campaigns : tab === "creators" ? creators : tab === "reports" ? reports : tab === "applications" ? applications : tab === "audit" ? auditLogs : contacts;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-2 flex justify-end">
        <button
          onClick={lockAdmin}
          disabled={loading}
          className="rounded-full border border-[#e9ddc3] bg-white px-4 py-2 text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          Lock admin 🔒
        </button>
      </div>
      <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#e4572e]">Internal • Team YaarLink</p>
      <h1 className="font-display text-[30px] font-black sm:text-[40px]">Admin overview</h1>
      <p className="text-[14.5px] text-[#78716c]">Real data from Postgres. Only approved/open listings that pass verification are public.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { a: campaigns.length, b: "Campaigns" },
          { a: creators.length, b: "Creators" },
          { a: applications.length, b: "Applications" },
          { a: contacts.length, b: "Messages" },
          { a: pendingReviews, b: "Pending reviews" },
          { a: openReports, b: "Open reports" },
        ].map((s) => (
          <div key={s.b} className="rounded-2xl border border-[#e9ddc3] bg-white p-5 text-center">
            <p className="font-display text-[30px] font-black">{s.a}</p>
            <p className="text-[13px] font-bold text-[#78716c]">{s.b}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13.5px] leading-relaxed text-[#57534e]">
        <b className="text-[#1c1917]">Before approving:</b> creators must send their code from the linked Instagram/YouTube account
        (or place it temporarily in the bio/about section), and the displayed follower count should be checked. Brands should
        send their code from the business WhatsApp, email, or official social account connected with the campaign.
      </div>

      <div className="mt-6 flex gap-2 overflow-x-auto no-scrollbar">
        {([
          { id: "campaigns", label: "campaigns" },
          { id: "creators", label: "creators" },
          { id: "reports", label: `reports${openReports ? ` (${openReports})` : ""}` },
          { id: "applications", label: "applications" },
          { id: "contacts", label: "contacts" },
          { id: "audit", label: "audit log" },
        ] as Array<{ id: Tab; label: string }>).map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`shrink-0 rounded-full px-5 py-2.5 text-[14px] font-bold capitalize ${tab === item.id ? "bg-[#1c1917] text-white" : "bg-white border border-[#e9ddc3]"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {notice && <p role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-[13.5px] font-bold text-green-800">{notice}</p>}
      {err && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-bold text-red-700">{err}</p>}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-[#e9ddc3] bg-white">
        {tab === "campaigns" && (
          <table className="w-full min-w-[980px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-[#f0e6cc] text-[#a8a29e]">
                <th className="p-4">Campaign</th>
                <th className="p-4">Business & contact</th>
                <th className="p-4">Budget & details</th>
                <th className="p-4">Verification</th>
                <th className="p-4">Status</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c: any) => {
                const busy = busyKey.startsWith(`campaign:${c.id}:`);
                return (
                  <tr key={c.id} className="border-b border-[#faf3e0] align-top">
                    <td className="max-w-[260px] p-4">
                      <p className="font-bold">{c.title}</p>
                      {c.description && <p className="mt-1 line-clamp-3 text-[12.5px] text-[#78716c]">{c.description}</p>}
                      <p className="mt-1 text-[11.5px] text-[#a8a29e]">{formatDate(c.createdAt)}</p>
                    </td>
                    <td className="max-w-[230px] p-4">
                      <p className="font-semibold">{c.businessName}</p>
                      {c.contactName && <p>{c.contactName}</p>}
                      <p className="break-all text-[12px] text-[#78716c]">{c.phone || ""}{c.phone && c.email ? <br /> : null}{c.email || ""}</p>
                      {c.website && (
                        <a href={c.website} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-[12px] font-semibold text-[#e4572e] hover:underline">
                          {c.website}
                        </a>
                      )}
                    </td>
                    <td className="p-4">
                      <p className="font-bold">{formatINR(c.budget)}</p>
                      <p className="text-[12.5px] text-[#78716c]">{[c.promotionType, c.category, c.language, c.location, c.format].filter(Boolean).join(" • ")}</p>
                    </td>
                    <td className="max-w-[220px] p-4">
                      <StatusPill status={c.verificationStatus || "unverified"} />
                      {c.verificationCode && <p className="mt-2 font-mono text-[13px] font-black tracking-wide">{c.verificationCode}</p>}
                      {c.reviewedAt && <p className="mt-1 text-[11.5px] text-[#a8a29e]">Reviewed {formatDate(c.reviewedAt)}</p>}
                      {c.moderationNote && <p className="mt-1 text-[12px] text-[#78716c]">Note: {c.moderationNote}</p>}
                    </td>
                    <td className="p-4"><StatusPill status={c.status} /></td>
                    <td className="p-4">
                      <div className="flex max-w-[220px] flex-wrap gap-1.5">
                        {c.status !== "open" && (
                          <ActionButton tone="primary" disabled={busy} onClick={() => moderate("campaign", c.id, "approve")}>Approve & open</ActionButton>
                        )}
                        {(c.status !== "pending" || !c.verificationCode) && (
                          <ActionButton tone="warning" disabled={busy} onClick={() => moderate("campaign", c.id, "review")}>
                            {c.status === "pending" ? "Issue code" : "Send to review"}
                          </ActionButton>
                        )}
                        {c.status === "pending" && (
                          <ActionButton tone="danger" disabled={busy} onClick={() => moderate("campaign", c.id, "reject")}>Reject</ActionButton>
                        )}
                        {c.status === "open" && (
                          <ActionButton tone="warning" disabled={busy} onClick={() => moderate("campaign", c.id, "close")}>Close</ActionButton>
                        )}
                        <ActionButton tone="danger" disabled={busy} onClick={() => moderate("campaign", c.id, "delete")}>Delete</ActionButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === "creators" && (
          <table className="w-full min-w-[1120px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-[#f0e6cc] text-[#a8a29e]">
                <th className="p-4">Creator & contact</th>
                <th className="p-4">Social profiles</th>
                <th className="p-4">Details</th>
                <th className="p-4">Followers</th>
                <th className="p-4">Verification</th>
                <th className="p-4">Status</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {creators.map((c: any) => {
                const busy = busyKey.startsWith(`creator:${c.id}:`);
                const followerValue = verifiedFollowers[c.id] ?? String(c.verifiedFollowers ?? c.followers ?? 0);
                return (
                  <tr key={c.id} className="border-b border-[#faf3e0] align-top">
                    <td className="max-w-[220px] p-4">
                      <p className="font-bold">{c.name}</p>
                      <p className="break-all text-[12px] text-[#78716c]">{c.phone || ""}{c.phone && c.email ? <br /> : null}{c.email || ""}</p>
                      <p className="mt-1 text-[11.5px] text-[#a8a29e]">{formatDate(c.createdAt)}</p>
                    </td>
                    <td className="p-4"><ProfileLinks links={[c.profileUrl, c.instagram, c.youtube]} /></td>
                    <td className="max-w-[260px] p-4">
                      <p>{[c.platform, c.category, c.languages, c.location, c.contentTypes].filter(Boolean).join(" • ")}</p>
                      {c.bio && <p className="mt-1 line-clamp-3 text-[12.5px] text-[#78716c]">{c.bio}</p>}
                    </td>
                    <td className="min-w-[170px] p-4">
                      <p className="text-[12.5px] text-[#78716c]">Claimed: {(c.followers || 0).toLocaleString("en-IN")}</p>
                      <label htmlFor={`verified-followers-${c.id}`} className="mt-2 block text-[11.5px] font-bold text-[#57534e]">
                        Verified count to publish
                      </label>
                      <input
                        id={`verified-followers-${c.id}`}
                        type="number"
                        min={0}
                        max={100000000}
                        value={followerValue}
                        onChange={(e) => setVerifiedFollowers((values) => ({ ...values, [c.id]: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-[#e9ddc3] px-2.5 py-2 text-[13px]"
                      />
                    </td>
                    <td className="max-w-[220px] p-4">
                      <StatusPill status={c.verificationStatus || "unverified"} />
                      {c.verificationCode && <p className="mt-2 font-mono text-[13px] font-black tracking-wide">{c.verificationCode}</p>}
                      {c.reviewedAt && <p className="mt-1 text-[11.5px] text-[#a8a29e]">Reviewed {formatDate(c.reviewedAt)}</p>}
                      {c.moderationNote && <p className="mt-1 text-[12px] text-[#78716c]">Note: {c.moderationNote}</p>}
                    </td>
                    <td className="p-4"><StatusPill status={c.status} /></td>
                    <td className="p-4">
                      <div className="flex max-w-[220px] flex-wrap gap-1.5">
                        {c.status !== "approved" && c.status !== "incomplete" && (
                          <ActionButton
                            tone="primary"
                            disabled={busy}
                            onClick={() => moderate("creator", c.id, "approve", { verifiedFollowers: followerValue })}
                          >
                            Approve & publish
                          </ActionButton>
                        )}
                        {c.status !== "incomplete" && (c.status !== "pending" || !c.verificationCode) && (
                          <ActionButton tone="warning" disabled={busy} onClick={() => moderate("creator", c.id, "review")}>
                            {c.status === "pending" ? "Issue code" : "Send to review"}
                          </ActionButton>
                        )}
                        {c.status === "pending" && (
                          <ActionButton tone="danger" disabled={busy} onClick={() => moderate("creator", c.id, "reject")}>Reject</ActionButton>
                        )}
                        {c.status === "approved" && (
                          <ActionButton tone="danger" disabled={busy} onClick={() => moderate("creator", c.id, "suspend")}>Suspend</ActionButton>
                        )}
                        <ActionButton tone="danger" disabled={busy} onClick={() => moderate("creator", c.id, "delete")}>Delete</ActionButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === "reports" && (
          <table className="w-full min-w-[920px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-[#f0e6cc] text-[#a8a29e]">
                <th className="p-4">Target</th>
                <th className="p-4">Reason & details</th>
                <th className="p-4">Reporter</th>
                <th className="p-4">Status</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r: any) => {
                const busy = busyKey.startsWith(`report:${r.id}:`);
                const targetBusy = busyKey.startsWith(`${r.targetType}:${r.targetId}:`);
                const targetDeleted = String(r.targetLabel || "").startsWith("Deleted ");
                return (
                  <tr key={r.id} className="border-b border-[#faf3e0] align-top">
                    <td className="max-w-[240px] p-4">
                      <p className="font-bold capitalize">{r.targetType}</p>
                      <p>{r.targetLabel || r.targetId}</p>
                      <p className="break-all text-[11.5px] text-[#a8a29e]">{r.targetId}</p>
                    </td>
                    <td className="max-w-[300px] p-4">
                      <p className="font-semibold">{REPORT_REASON_LABELS[r.reason] ?? r.reason}</p>
                      {r.details && <p className="mt-1 text-[12.5px] leading-relaxed text-[#78716c]">{r.details}</p>}
                    </td>
                    <td className="max-w-[220px] p-4">
                      {r.reporterName && <p>{r.reporterName}</p>}
                      {r.reporterContact && <p className="break-all text-[12px] text-[#78716c]">{r.reporterContact}</p>}
                      {!r.reporterName && !r.reporterContact && <span className="text-stone-400">Anonymous</span>}
                    </td>
                    <td className="p-4">
                      <StatusPill status={r.status} isReport />
                      <p className="mt-1 text-[11.5px] text-[#a8a29e]">{formatDate(r.createdAt)}</p>
                      {r.adminNote && <p className="mt-1 text-[12px] text-[#78716c]">Note: {r.adminNote}</p>}
                    </td>
                    <td className="p-4">
                      <div className="flex max-w-[190px] flex-wrap gap-1.5">
                        {r.status === "open" ? (
                          <>
                            {!targetDeleted && r.targetType === "campaign" && (
                              <ActionButton tone="warning" disabled={targetBusy} onClick={() => moderate("campaign", r.targetId, "close")}>Close campaign</ActionButton>
                            )}
                            {!targetDeleted && r.targetType === "creator" && (
                              <ActionButton tone="danger" disabled={targetBusy} onClick={() => moderate("creator", r.targetId, "suspend")}>Suspend creator</ActionButton>
                            )}
                            <ActionButton tone="primary" disabled={busy} onClick={() => moderate("report", r.id, "resolve")}>Resolve</ActionButton>
                            <ActionButton disabled={busy} onClick={() => moderate("report", r.id, "dismiss")}>Dismiss</ActionButton>
                          </>
                        ) : (
                          <ActionButton tone="warning" disabled={busy} onClick={() => moderate("report", r.id, "reopen")}>Reopen</ActionButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === "applications" && (
          <table className="w-full min-w-[640px] text-left text-[13.5px]">
            <thead><tr className="border-b border-[#f0e6cc] text-[#a8a29e]"><th className="p-4">Creator</th><th className="p-4">Contact</th><th className="p-4">Message</th><th className="p-4">Status</th></tr></thead>
            <tbody>{applications.map((a: any) => <tr key={a.id} className="border-b border-[#faf3e0]"><td className="p-4 font-bold">{a.creatorName}</td><td className="p-4">{a.creatorContact}</td><td className="p-4">{a.message}</td><td className="p-4">{a.status}</td></tr>)}</tbody>
          </table>
        )}
        {tab === "contacts" && (
          <table className="w-full min-w-[640px] text-left text-[13.5px]">
            <thead><tr className="border-b border-[#f0e6cc] text-[#a8a29e]"><th className="p-4">Name</th><th className="p-4">Type</th><th className="p-4">Message</th><th className="p-4">Contact</th></tr></thead>
            <tbody>{contacts.map((c: any) => <tr key={c.id} className="border-b border-[#faf3e0]"><td className="p-4 font-bold">{c.name}</td><td className="p-4">{c.kind}</td><td className="p-4">{c.message}</td><td className="p-4">{c.phone || c.email}</td></tr>)}</tbody>
          </table>
        )}
        {tab === "audit" && (
          <table className="w-full min-w-[920px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-[#f0e6cc] text-[#a8a29e]">
                <th className="p-4">Time</th>
                <th className="p-4">Action</th>
                <th className="p-4">Outcome</th>
                <th className="p-4">Target</th>
                <th className="p-4">Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log: any) => (
                <tr key={log.id} className="border-b border-[#faf3e0] align-top">
                  <td className="whitespace-nowrap p-4 text-[12.5px] text-[#78716c]">{formatDate(log.createdAt)}</td>
                  <td className="p-4 font-mono text-[12.5px] font-bold">{log.action}</td>
                  <td className="p-4"><StatusPill status={log.outcome} /></td>
                  <td className="max-w-[220px] p-4">
                    {log.entity ? <p className="font-semibold capitalize">{log.entity}</p> : <span className="text-stone-400">Admin</span>}
                    {log.entityId && <p className="mt-1 break-all text-[11.5px] text-[#a8a29e]">{log.entityId}</p>}
                  </td>
                  <td className="max-w-[360px] p-4">
                    {log.details && <p className="break-all font-mono text-[11.5px] leading-relaxed text-[#57534e]">{log.details}</p>}
                    {log.ipAddress && <p className="mt-1 text-[11.5px] text-[#a8a29e]">IP: {log.ipAddress}</p>}
                    {!log.details && !log.ipAddress && <span className="text-stone-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {activeRows.length === 0 && <p className="p-8 text-center text-[14px] text-[#a8a29e]">Nothing here yet — data will appear as people sign up.</p>}
      </div>
    </div>
  );
}
