"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminAuth, adminSupabase } from "@/lib/admin-supabase";

type Row = Record<string, string | number | boolean | null>;
const SECTIONS = ["Overview","Creators","Campaigns","Brands","Users","Reports / Moderation","Analytics","Admin Management / RBAC","Security / MFA","Notifications","Settings"] as const;
const CREATOR_TABS = ["all","pending_review","active","changes_requested","rejected","suspended","deactivated"] as const;
const CAMPAIGN_TABS = ["all","pending_review","live","scheduled","changes_requested","rejected","paused","completed"] as const;
const card: React.CSSProperties = { background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:18 };
const badge = (s: string): React.CSSProperties => ({ background: s==="active"||s==="live" ? "#16a34a" : s==="pending_review" ? "#d97706" : s==="rejected" ? "#dc2626" : "#64748b", color:"#fff", borderRadius:999, padding:"2px 10px", fontSize:12, fontWeight:600 });

export default function AdminControlCenter() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
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
    const db = adminSupabase();
    const [c, k] = await Promise.all([
      db.from("preview_creators").select("*").order("created_at", { ascending: false }),
      db.from("preview_campaigns").select("*").order("created_at", { ascending: false }),
    ]);
    if (c.error || k.error) setErr("Could not load records. Your session may lack permission (AAL2 + role required), or the Preview API schema is not exposed yet.");
    else { setCreators((c.data ?? []) as Row[]); setCampaigns((k.data ?? []) as Row[]); setErr(""); }
    setLoading(false);
  }, []);

  useEffect(() => { (async () => {
    const { data: { session } } = await adminAuth().getSession();
    if (!session) { router.replace("/admin/login"); return; }
    const { data: aal } = await adminAuth().mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") { router.replace("/admin/mfa"); return; }
    const { error: registrationError } = await adminSupabase().schema("admin").rpc("register_my_session");
    setReady(true);
    if (registrationError) { setErr("Unable to register this admin session. Access remains denied; contact an administrator."); setLoading(false); return; }
    load();
  })(); }, [router, load]);

  const filteredCreators = useMemo(() => creators.filter(c => (tab==="all"||c.status===tab) && JSON.stringify(c).toLowerCase().includes(query.toLowerCase())), [creators, tab, query]);
  const filteredCampaigns = useMemo(() => campaigns.filter(c => (tab==="all"||c.status===tab) && JSON.stringify(c).toLowerCase().includes(query.toLowerCase())), [campaigns, tab, query]);

  async function act(action: string) {
    if (!selected) return;
    if (["request_changes","reject"].includes(action) && !reason.trim()) { setErr("A reason is mandatory for Request Changes and Reject."); return; }
    if (!window.confirm(`Confirm: ${action} this ${kind}? This is recorded in the audit log.`)) return;
    setErr(""); setMsg("");
    const fn = kind === "creator" ? "review_creator" : "review_campaign";
    const id = String(selected.id);
    const { error } = await adminSupabase().rpc(fn, kind === "creator" ? { p_creator_id: id, p_action: action, p_reason: reason || null } : { p_campaign_id: id, p_action: action, p_reason: reason || null });
    if (error) { setErr(`Action failed: ${error.message}`); return; }
    setMsg(`Action completed: ${action}. Decision, audit event and in-app notification recorded.`);
    setReason(""); setSelected(null); load();
  }

  if (!ready) return <main style={{ padding: 40, fontFamily: "system-ui" }}>Checking secure session (AAL2 required)…</main>;

  return (
    <main style={{ display:"flex", minHeight:"100vh", background:"#f6f7fb", color:"#111827", fontFamily:"system-ui,sans-serif" }}>
      <aside style={{ width:260, background:"#0f172a", color:"#e2e8f0", padding:20, flexShrink:0 }} className="admin-sidebar">
        <div style={{ fontWeight:800, fontSize:20, color:"#fff" }}>YaarLink <span style={{ color:"#38bdf8" }}>Admin</span></div>
        <div style={{ fontSize:12, margin:"6px 0 20px", color:"#94a3b8" }}>Control Center · Preview · AAL2 verified</div>
        <nav style={{ display:"grid", gap:6 }}>
          {SECTIONS.map(s => <button key={s} onClick={() => { setSection(s); setTab("all"); setSelected(null); }} style={{ textAlign:"left", padding:"10px 12px", borderRadius:10, border:0, cursor:"pointer", background: section===s ? "#1d4ed8" : "transparent", color: section===s ? "#fff" : "#cbd5e1", fontWeight: section===s ? 700 : 500 }}>{s}</button>)}
        </nav>
        <button onClick={async () => { await adminAuth().signOut({ scope: "global" }); router.replace("/admin/login"); }} style={{ marginTop:24, padding:"10px 12px", borderRadius:10, border:0, background:"#334155", color:"#fff", cursor:"pointer" }}>Secure logout</button>
      </aside>

      <section style={{ flex:1, padding:24, minWidth:0 }}>
        <h1 style={{ fontSize:28, margin:"0 0 4px" }}>{section}</h1>
        <p style={{ color:"#6b7280", marginTop:0 }}>Authenticated Admin Control Center (Preview data; synthetic records are labelled in the database).</p>
        {loading && <p>Loading…</p>}
        {err && <p role="alert" style={{ ...card, background:"#fef2f2", borderColor:"#fca5a5" }}>{err} <a href="/admin/setup">First administrator setup</a></p>}
        {msg && <p style={{ ...card, background:"#f0fdf4", borderColor:"#86efac" }}>{msg}</p>}

        {section==="Overview" && <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:14 }}>
          {[["Creators", creators.length],["Pending review", creators.filter(c=>c.status==="pending_review").length],["Campaigns", campaigns.length],["Campaigns pending", campaigns.filter(c=>c.status==="pending_review").length],["Live campaigns", campaigns.filter(c=>c.status==="live").length]].map(([k,v]) => <div key={k} style={card}><div style={{ fontSize:30, fontWeight:800 }}>{v}</div><div style={{ color:"#6b7280" }}>{k}</div></div>)}
        </div>}

        {(section==="Creators"||section==="Campaigns") && <>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
            {(section==="Creators"?CREATOR_TABS:CAMPAIGN_TABS).map(t => <button key={t} onClick={() => setTab(t)} style={{ padding:"8px 12px", borderRadius:999, border:"1px solid #d1d5db", background: tab===t ? "#1d4ed8" : "#fff", color: tab===t ? "#fff" : "#111827", cursor:"pointer" }}>{t.replaceAll("_"," ")}</button>)}
            <input aria-label="Search" placeholder="Search…" value={query} onChange={e=>setQuery(e.target.value)} style={{ padding:10, border:"1px solid #d1d5db", borderRadius:10, flex:1, minWidth:180 }} />
          </div>
          <div style={card}>
            {(section==="Creators"?filteredCreators:filteredCampaigns).length===0 ? <p style={{ color:"#6b7280" }}>No records in this queue — empty state.</p> :
            (section==="Creators"?filteredCreators:filteredCampaigns).map(r => (
              <div key={String(r.id)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0", borderBottom:"1px solid #eef2f7" }}>
                <div><strong>{String(r.display_name ?? r.title ?? "")}</strong><div style={{ color:"#6b7280", fontSize:13 }}>{String(r.handle ?? r.budget_band ?? "")} · {String(r.niche ?? r.description ?? "")}</div></div>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}><span style={badge(String(r.status))}>{String(r.status).replaceAll("_"," ")}</span>
                <button onClick={() => { setSelected(r); setKind(section==="Creators"?"creator":"campaign"); }} style={{ padding:"8px 12px", borderRadius:8, cursor:"pointer" }}>View / Review</button></div>
              </div>))}
          </div>

          {selected && <div style={{ ...card, marginTop:16 }}>
            <h3 style={{ marginTop:0 }}>{kind==="creator" ? "Creator review" : "Campaign review"} — {String(selected.display_name ?? selected.title)}</h3>
            <pre style={{ whiteSpace:"pre-wrap", background:"#f8fafc", padding:12, borderRadius:10, fontSize:12 }}>{JSON.stringify(selected, null, 2)}</pre>
            <label>Reason (mandatory for Request Changes / Reject)<textarea value={reason} onChange={e=>setReason(e.target.value)} style={{ width:"100%", padding:10, borderRadius:10, border:"1px solid #d1d5db", minHeight:70, boxSizing:"border-box" }} /></label>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:10 }}>
              {kind==="creator" ? <>
                <button onClick={()=>act("approve")}>Approve &amp; Activate</button>
                <button onClick={()=>act("request_changes")}>Request Changes</button>
                <button onClick={()=>act("reject")}>Reject</button>
                <button onClick={()=>act("suspend")}>Suspend</button>
                <button onClick={()=>act("deactivate")}>Deactivate</button>
                <button onClick={()=>act("reactivate")}>Reactivate</button>
              </> : <>
                <button onClick={()=>act("approve_publish")}>Approve &amp; Publish</button>
                <button onClick={()=>act("request_changes")}>Request Changes</button>
                <button onClick={()=>act("reject")}>Reject</button>
                <button onClick={()=>act("pause")}>Pause</button>
                <button onClick={()=>act("resume")}>Resume</button>
                <button onClick={()=>act("end")}>End Campaign</button>
              </>}
              <button onClick={()=>setSelected(null)}>Close</button>
            </div>
            <p style={{ fontSize:12, color:"#6b7280" }}>Every action runs server-side in the database (permission + AAL2 + state-transition checks, row lock). Invalid transitions and duplicate approvals are rejected; failures never show success.</p>
          </div>}
        </>}

        {!["Overview","Creators","Campaigns"].includes(section) && <div style={card}><p><strong>{section}</strong> — live module shell connected to the same AAL2 session. Detailed operations for this module run through the same permission-checked database policies; no synthetic action is faked here.</p></div>}
      </section>
      <style>{`@media (max-width: 760px){ .admin-sidebar{display:none} }`}</style>
    </main>
  );
}
