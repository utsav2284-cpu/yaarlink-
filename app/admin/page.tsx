"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminAuth, adminRpc } from "@/lib/admin-supabase";

type Row = Record<string, string | number | boolean | null>;
const SECTIONS = ["Overview","Creators","Campaigns"] as const;
const CREATOR_TABS = ["all","pending","approved","rejected","suspended","incomplete"] as const;
const CAMPAIGN_TABS = ["all","pending","open","rejected","paused","closed","expired"] as const;
const card: React.CSSProperties = { background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:18 };
const badge = (s: string): React.CSSProperties => ({ background: s==="approved"||s==="open" ? "#16a34a" : s==="pending" ? "#d97706" : s==="rejected" ? "#dc2626" : "#64748b", color:"#fff", borderRadius:999, padding:"2px 10px", fontSize:12, fontWeight:600 });

export default function AdminControlCenter() {
  const router = useRouter();
  const production = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
  const [ready, setReady] = useState(false);
  const [assuranceVerified, setAssuranceVerified] = useState(false);
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Overview");
  const [creators, setCreators] = useState<Row[]>([]);
  const [campaigns, setCampaigns] = useState<Row[]>([]);
  const [tab, setTab] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [kind, setKind] = useState<"creator"|"campaign">("creator");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
    const [c, k] = await Promise.all([
      adminRpc("marketplace_review_queue", { p_kind: "creator" }),
      adminRpc("marketplace_review_queue", { p_kind: "campaign" }),
    ]);
    if (c.error || k.error) { setCreators([]); setCampaigns([]); setSelected(null); setErr("Marketplace review is unavailable. The marketplace database or review permissions are not configured."); }
    else { setCreators((c.data ?? []) as Row[]); setCampaigns((k.data ?? []) as Row[]); setErr(""); }
    } catch { setCreators([]); setCampaigns([]); setSelected(null); setErr("Could not load the marketplace review queues. Check the admin configuration and try again."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { let cancelled = false; void (async () => {
    try {
      const { data: { session }, error: sessionError } = await adminAuth().getSession();
      if (sessionError) throw sessionError;
      if (!session) { if (!cancelled) router.replace("/admin/login"); return; }
      const { data: aal, error: aalError } = await adminAuth().mfa.getAuthenticatorAssuranceLevel();
      if (aalError) throw aalError;
      if (aal?.currentLevel !== "aal2") { if (!cancelled) router.replace("/admin/mfa"); return; }
      if (!cancelled) setAssuranceVerified(true);
      const { error: registrationError } = await adminRpc("register_my_session");
      if (cancelled) return;
      setReady(true);
      if (registrationError) { setErr("Unable to register this admin session. Access remains denied; contact an administrator."); setLoading(false); return; }
      await load();
    } catch {
      if (!cancelled) { setReady(true); setLoading(false); setErr("Cannot connect to admin authentication. Check the admin configuration and try again."); }
    }
  })(); return () => { cancelled = true; }; }, [router, load]);

  const filteredCreators = useMemo(() => creators.filter(c => (tab==="all"||c.status===tab) && JSON.stringify(c).toLowerCase().includes(query.toLowerCase())), [creators, tab, query]);
  const filteredCampaigns = useMemo(() => campaigns.filter(c => (tab==="all"||c.status===tab) && JSON.stringify(c).toLowerCase().includes(query.toLowerCase())), [campaigns, tab, query]);

  async function act(action: string) {
    if (!selected) return;
    if (action === "reject" && !reason.trim()) { setErr("A reason is mandatory for rejection."); return; }
    if (!window.confirm(`Confirm: ${action} this ${kind}? This is recorded in the audit log.`)) return;
    setErr(""); setMsg("");
    const id = String(selected.id);
    try {
      const { error } = await adminRpc("marketplace_review_decision", { p_kind: kind, p_id: id, p_action: action, p_reason: reason || null });
      if (error) { setErr("Review could not be completed. Check the record state and your permissions, then try again."); return; }
      setMsg("Review saved in the selected marketplace database. Public visibility depends on the app using this same database and the record meeting listing requirements.");
      setReason(""); setSelected(null); await load();
    } catch { setErr("Review could not be completed. Check your connection and try again."); }
  }

  if (!ready) return <main style={{ padding: 40, fontFamily: "system-ui" }}>Checking secure session (AAL2 required)…</main>;

  return (
    <main className="admin-layout" style={{ display:"flex", minHeight:"100vh", background:"#f6f7fb", color:"#111827", fontFamily:"system-ui,sans-serif" }}>
      <aside style={{ width:260, background:"#0f172a", color:"#e2e8f0", padding:20, flexShrink:0 }} className="admin-sidebar">
        <div style={{ fontWeight:800, fontSize:20, color:"#fff" }}>YaarLink <span style={{ color:"#38bdf8" }}>Admin</span></div>
        <div style={{ fontSize:12, margin:"6px 0 20px", color:"#94a3b8" }}>Control Center · {production ? "Production" : "Preview"} · {assuranceVerified ? "AAL2 session" : "Authentication unavailable"}</div>
        <nav style={{ display:"grid", gap:6 }}>
          {SECTIONS.slice(0, 3).map(s => <button key={s} onClick={() => { setSection(s); setTab("all"); setSelected(null); }} style={{ textAlign:"left", padding:"10px 12px", borderRadius:10, border:0, cursor:"pointer", background: section===s ? "#1d4ed8" : "transparent", color: section===s ? "#fff" : "#cbd5e1", fontWeight: section===s ? 700 : 500 }}>{s}</button>)}
        </nav>
        <button onClick={async () => { await adminAuth().signOut({ scope: "global" }); router.replace("/admin/login"); }} style={{ marginTop:24, padding:"10px 12px", borderRadius:10, border:0, background:"#334155", color:"#fff", cursor:"pointer" }}>Secure logout</button>
      </aside>

      <section style={{ flex:1, padding:24, minWidth:0 }}>
        <h1 style={{ fontSize:28, margin:"0 0 4px" }}>{section}</h1>
        <p style={{ color:"#6b7280", marginTop:0 }}>Review creators and campaigns.</p>
        <p role="status" style={{ ...card, background:"#fffbeb", borderColor:"#fcd34d", color:"#78350f" }}><strong>{production ? "Production:" : "Preview only:"}</strong> review uses marketplace records in the selected project, when configured. Public visibility requires the app to use that same database.</p>
        {loading && <p>Loading…</p>}
        {err && <p role="alert" style={{ ...card, background:"#fef2f2", borderColor:"#fca5a5" }}>{err} <a href="/admin/setup">First administrator setup</a></p>}
        {msg && <p style={{ ...card, background:"#f0fdf4", borderColor:"#86efac" }}>{msg}</p>}

        {section==="Overview" && !err && !loading && <><div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:16 }}>
          <button onClick={() => { setSection("Creators"); setTab("pending"); }}>Review pending creators</button>
          <button onClick={() => { setSection("Campaigns"); setTab("pending"); }}>Review pending campaigns</button>
        </div><p style={{ color:"#6b7280", fontSize:12 }}>Counts cover at most the latest 200 records in each queue.</p><div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:14 }}>
          {[["Creators", creators.length],["Pending review", creators.filter(c=>c.status==="pending").length],["Campaigns", campaigns.length],["Campaigns pending", campaigns.filter(c=>c.status==="pending").length],["Live campaigns", campaigns.filter(c=>c.status==="open").length]].map(([k,v]) => <div key={k} style={card}><div style={{ fontSize:30, fontWeight:800 }}>{v}</div><div style={{ color:"#6b7280" }}>{k}</div></div>)}
        </div></>}

        {(section==="Creators"||section==="Campaigns") && <>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
            {(section==="Creators"?CREATOR_TABS:CAMPAIGN_TABS).map(t => <button key={t} onClick={() => setTab(t)} style={{ padding:"8px 12px", borderRadius:999, border:"1px solid #d1d5db", background: tab===t ? "#1d4ed8" : "#fff", color: tab===t ? "#fff" : "#111827", cursor:"pointer" }}>{t.replaceAll("_"," ")}</button>)}
            <input aria-label="Search" placeholder="Search…" value={query} onChange={e=>setQuery(e.target.value)} style={{ padding:10, border:"1px solid #d1d5db", borderRadius:10, flex:1, minWidth:180 }} />
          </div>
          <div style={card}>
            {(section==="Creators"?filteredCreators:filteredCampaigns).length===0 ? <p style={{ color:"#6b7280" }}>No records available in this queue. If an error is shown above, the marketplace is not connected.</p> :
            (section==="Creators"?filteredCreators:filteredCampaigns).map(r => (
              <div key={String(r.id)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0", borderBottom:"1px solid #eef2f7" }}>
                <div><strong>{String(r.display_name ?? r.title ?? "")}</strong><div style={{ color:"#6b7280", fontSize:13 }}>{String(r.platform ?? r.business_name ?? "")} · {String(r.category ?? r.description ?? "")}</div></div>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}><span style={badge(String(r.status))}>{String(r.status).replaceAll("_"," ")}</span>
                <button onClick={() => { setSelected(r); setKind(section==="Creators"?"creator":"campaign"); }} style={{ padding:"8px 12px", borderRadius:8, cursor:"pointer" }}>View / Review</button></div>
              </div>))}
          </div>

          {selected && <div style={{ ...card, marginTop:16 }}>
            <h3 style={{ marginTop:0 }}>{kind==="creator" ? "Creator review" : "Campaign review"} — {String(selected.display_name ?? selected.title)}</h3>
            <pre style={{ whiteSpace:"pre-wrap", background:"#f8fafc", padding:12, borderRadius:10, fontSize:12 }}>{JSON.stringify(selected, null, 2)}</pre>
            <label>Reason (mandatory for rejection)<textarea value={reason} onChange={e=>setReason(e.target.value)} style={{ width:"100%", padding:10, borderRadius:10, border:"1px solid #d1d5db", minHeight:70, boxSizing:"border-box" }} /></label>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:10 }}>
              <button disabled={selected.status !== "pending"} onClick={()=>act("approve")}>{kind === "creator" ? "Approve creator" : "Approve & publish campaign"}</button>
              <button disabled={selected.status !== "pending"} onClick={()=>act("reject")}>Reject</button>
              <button onClick={()=>setSelected(null)}>Close</button>
            </div>
            <p style={{ fontSize:12, color:"#6b7280" }}>Review actions require server-side authorization and a valid record state. Creator listings must also pass the public profile checks.</p>
          </div>}
        </>}


      </section>
      <style>{`@media (max-width: 760px){ .admin-layout{flex-direction:column} .admin-sidebar{width:auto !important} .admin-sidebar nav{display:flex !important; overflow-x:auto; padding-bottom:4px} .admin-sidebar nav button{white-space:nowrap} }`}</style>
    </main>
  );
}
