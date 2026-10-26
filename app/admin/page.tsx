"use client";

import { useEffect, useState } from "react";
import { formatINR } from "@/shared/constants";

export default function AdminPage() {
  const [data, setData] = useState({ campaigns: [], creators: [], applications: [], contacts: [] } as any);
  const [tab, setTab] = useState<"campaigns" | "creators" | "applications" | "contacts">("campaigns");
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/data", { credentials: "include", cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Wrong password");
      setData(d);
      setAuthed(true);
    } catch (e: any) {
      setErr(e.message);
      setAuthed(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (!authed) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <form
          onSubmit={async (e) => { e.preventDefault(); setLoading(true); setErr(""); try { const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ password: key }) }); const d = await res.json(); if (!res.ok) throw new Error(d.error || "Wrong password"); setKey(""); await load(); } catch (e: any) { setErr(e.message); setAuthed(false); setLoading(false); } }}
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
            className="mt-5 rounded-xl border border-[#e9ddc3] bg-[#fffbf1] px-4 py-3 outline-none focus:border-[#1c1917]"
          />
          {err && <p className="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13.5px] font-bold text-red-700">{err}</p>}
          <button disabled={loading || !key} className="mt-4 w-full rounded-2xl bg-[#1c1917] py-3.5 text-[15.5px] font-extrabold text-white disabled:opacity-50">
            {loading ? "Checking…" : "Open admin →"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-2 flex justify-end">
        <button
          onClick={async () => { await fetch("/api/admin/logout", { method: "POST", credentials: "include" }); setAuthed(false); setKey(""); }}
          className="rounded-full border border-[#e9ddc3] bg-white px-4 py-2 text-[13px] font-bold"
        >
          Lock admin 🔒
        </button>
      </div>
      <p className="text-[12.5px] font-bold uppercase tracking-widest text-[#e4572e]">Internal • Team YaarLink</p>
      <h1 className="font-display text-[30px] font-black sm:text-[40px]">Admin overview</h1>
      <p className="text-[14.5px] text-[#78716c]">Real data from Postgres. No fake numbers here.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        {[
          { a: data.campaigns.length, b: "Campaigns" },
          { a: data.creators.length, b: "Creators" },
          { a: data.applications.length, b: "Applications" },
          { a: data.contacts.length, b: "Messages" },
        ].map((s) => (
          <div key={s.b} className="rounded-2xl border border-[#e9ddc3] bg-white p-5 text-center">
            <p className="font-display text-[30px] font-black">{s.a}</p>
            <p className="text-[13px] font-bold text-[#78716c]">{s.b}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-2 overflow-x-auto no-scrollbar">
        {(["campaigns", "creators", "applications", "contacts"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`shrink-0 rounded-full px-5 py-2.5 text-[14px] font-bold capitalize ${tab === t ? "bg-[#1c1917] text-white" : "bg-white border border-[#e9ddc3]"}`}>{t}</button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-[#e9ddc3] bg-white">
        {tab === "campaigns" && (
          <table className="w-full min-w-[640px] text-left text-[13.5px]">
            <thead><tr className="border-b border-[#f0e6cc] text-[#a8a29e]"><th className="p-4">Title</th><th className="p-4">Business</th><th className="p-4">Budget</th><th className="p-4">Lang</th><th className="p-4">Location</th></tr></thead>
            <tbody>{data.campaigns.map((c: any) => <tr key={c.id} className="border-b border-[#faf3e0]"><td className="p-4 font-bold">{c.title}</td><td className="p-4">{c.businessName}<br /><span className="text-[12px] text-[#a8a29e]">{c.phone || c.email || ""}</span></td><td className="p-4 font-bold">{formatINR(c.budget)}</td><td className="p-4">{c.language}</td><td className="p-4">{c.location}</td></tr>)}</tbody>
          </table>
        )}
        {tab === "creators" && (
          <table className="w-full min-w-[640px] text-left text-[13.5px]">
            <thead><tr className="border-b border-[#f0e6cc] text-[#a8a29e]"><th className="p-4">Name</th><th className="p-4">Category</th><th className="p-4">Followers</th><th className="p-4">Languages</th><th className="p-4">Contact</th></tr></thead>
            <tbody>{data.creators.map((c: any) => <tr key={c.id} className="border-b border-[#faf3e0]"><td className="p-4 font-bold">{c.name}</td><td className="p-4">{c.category}</td><td className="p-4">{(c.followers || 0).toLocaleString("en-IN")}</td><td className="p-4">{c.languages}</td><td className="p-4">{c.phone || c.email || c.profileUrl}</td></tr>)}</tbody>
          </table>
        )}
        {tab === "applications" && (
          <table className="w-full min-w-[640px] text-left text-[13.5px]">
            <thead><tr className="border-b border-[#f0e6cc] text-[#a8a29e]"><th className="p-4">Creator</th><th className="p-4">Contact</th><th className="p-4">Message</th><th className="p-4">Status</th></tr></thead>
            <tbody>{data.applications.map((a: any) => <tr key={a.id} className="border-b border-[#faf3e0]"><td className="p-4 font-bold">{a.creatorName}</td><td className="p-4">{a.creatorContact}</td><td className="p-4">{a.message}</td><td className="p-4">{a.status}</td></tr>)}</tbody>
          </table>
        )}
        {tab === "contacts" && (
          <table className="w-full min-w-[640px] text-left text-[13.5px]">
            <thead><tr className="border-b border-[#f0e6cc] text-[#a8a29e]"><th className="p-4">Name</th><th className="p-4">Type</th><th className="p-4">Message</th><th className="p-4">Contact</th></tr></thead>
            <tbody>{data.contacts.map((c: any) => <tr key={c.id} className="border-b border-[#faf3e0]"><td className="p-4 font-bold">{c.name}</td><td className="p-4">{c.kind}</td><td className="p-4">{c.message}</td><td className="p-4">{c.phone || c.email}</td></tr>)}</tbody>
          </table>
        )}
        {data[tab].length === 0 && <p className="p-8 text-center text-[14px] text-[#a8a29e]">Nothing here yet — data will appear as people sign up.</p>}
      </div>
    </div>
  );
}
