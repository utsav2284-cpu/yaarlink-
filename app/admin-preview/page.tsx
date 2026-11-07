"use client";
import { useMemo, useState } from "react";

const CREATORS = [
  { name: "Aarav Demo", handle: "@aarav.demo", niche: "Comedy", band: "100k–500k", status: "active" },
  { name: "Meera Studio", handle: "@meera.studio", niche: "Beauty", band: "500k–1M", status: "active" },
  { name: "Kabir Travels", handle: "@kabir.travels", niche: "Travel", band: "50k–100k", status: "flagged" },
  { name: "Sana Cooks", handle: "@sana.cooks", niche: "Food", band: "1M+", status: "active" },
];
const CAMPAIGNS = [
  { title: "Launch Week (Synthetic)", brand: "Acme Glow (Synthetic)", status: "live", budget: "₹1–5L" },
  { title: "Festive Push (Synthetic)", brand: "Northwind Snacks (Synthetic)", status: "draft", budget: "₹5–10L" },
];
const BRANDS = [
  { name: "Acme Glow (Synthetic)", industry: "Beauty", status: "active" },
  { name: "Northwind Snacks (Synthetic)", industry: "Food", status: "active" },
  { name: "Orbit Fitness (Synthetic)", industry: "Fitness", status: "active" },
];
const SECTIONS = ["Overview","Creators","Campaigns","Brands","Users","Reports / Moderation","Analytics","Admin Management / RBAC","Security / MFA","Notifications","Settings"] as const;
type Section = (typeof SECTIONS)[number];

const card: React.CSSProperties = { background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:18 };
const badge = (c:string): React.CSSProperties => ({ background:c, color:"#fff", borderRadius:999, padding:"2px 10px", fontSize:12, fontWeight:600 });

export default function AdminPreview() {
  const [section, setSection] = useState<Section>("Overview");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const creators = useMemo(()=>CREATORS.filter(c=>(status==="all"||c.status===status) && (c.name+c.handle+c.niche).toLowerCase().includes(query.toLowerCase())),[query,status]);

  return (
    <main style={{display:"flex",minHeight:"100vh",background:"#f6f7fb",color:"#111827",fontFamily:"system-ui,sans-serif"}}>
      <aside style={{width:260,background:"#0f172a",color:"#e2e8f0",padding:20,flexShrink:0}} className="admin-sidebar">
        <div style={{fontWeight:800,fontSize:20,color:"#fff"}}>YaarLink <span style={{color:"#38bdf8"}}>Admin</span></div>
        <div style={{fontSize:12,margin:"6px 0 20px",color:"#94a3b8"}}>Preview V2 · Synthetic data only</div>
        <nav style={{display:"grid",gap:6}}>
          {SECTIONS.map(s=>(
            <button key={s} onClick={()=>setSection(s)} style={{textAlign:"left",padding:"10px 12px",borderRadius:10,border:0,cursor:"pointer",background:section===s?"#1d4ed8":"transparent",color:section===s?"#fff":"#cbd5e1",fontWeight:section===s?700:500}}>{s}</button>
          ))}
        </nav>
        <div style={{marginTop:24,fontSize:12,color:"#94a3b8",lineHeight:1.6}}>Auth: Preview Supabase<br/>Database: admin-preview-v2<br/>Production: not connected</div>
      </aside>

      <section style={{flex:1,padding:24,minWidth:0}}>
        <div style={{...card,background:"#fef3c7",borderColor:"#f59e0b",marginBottom:18}}>
          <strong>Synthetic Preview data — not real marketplace data.</strong> Dashboard reads are UI demonstrations. Writes require an authenticated AAL2 admin session with a verified TOTP factor; unauthenticated actions are disabled rather than faked.
        </div>
        <h1 style={{fontSize:28,margin:"0 0 4px"}}>{section}</h1>
        <p style={{color:"#6b7280",marginTop:0}}>YaarLink Admin Preview V2 · {section} module</p>

        {section==="Overview" && (<>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14}}>
            {[["Creators (synthetic)","4"],["Campaigns (synthetic)","2"],["Brands (synthetic)","3"],["Open reports","0"],["Admin permissions","31"],["Roles","5"]].map(([k,v])=>(
              <div key={k} style={card}><div style={{fontSize:30,fontWeight:800}}>{v}</div><div style={{color:"#6b7280"}}>{k}</div></div>
            ))}
          </div>
          <div style={{...card,marginTop:16}}><h3>Weekly activity (synthetic)</h3>
            {[["Mon",40],["Tue",65],["Wed",52],["Thu",80],["Fri",72],["Sat",90],["Sun",58]].map(([d,v])=>(
              <div key={d} style={{display:"flex",alignItems:"center",gap:10,margin:"6px 0"}}><span style={{width:36}}>{d}</span><div style={{height:14,background:"#2563eb",borderRadius:6,width:`${v}%`}}/><span>{v}</span></div>
            ))}</div>
        </>)}

        {section==="Creators" && (<div style={card}>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
            <input aria-label="Search creators" placeholder="Search creators…" value={query} onChange={e=>setQuery(e.target.value)} style={{padding:10,border:"1px solid #d1d5db",borderRadius:10,flex:1,minWidth:200}}/>
            <select aria-label="Status filter" value={status} onChange={e=>setStatus(e.target.value)} style={{padding:10,borderRadius:10}}><option value="all">All statuses</option><option>active</option><option>flagged</option><option>suspended</option></select>
          </div>
          {creators.length===0 ? <p style={{color:"#6b7280"}}>No creators match — empty state. Try clearing the search or filter.</p> :
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["Name","Handle","Niche","Followers","Status"].map(h=><th key={h} style={{textAlign:"left",padding:10,borderBottom:"2px solid #e5e7eb"}}>{h}</th>)}</tr></thead>
          <tbody>{creators.map(c=><tr key={c.handle}><td style={{padding:10}}>{c.name}</td><td style={{padding:10}}>{c.handle}</td><td style={{padding:10}}>{c.niche}</td><td style={{padding:10}}>{c.band}</td><td style={{padding:10}}><span style={badge(c.status==="active"?"#16a34a":"#d97706")}>{c.status}</span></td></tr>)}</tbody></table></div>}
        </div>)}

        {section==="Campaigns" && <div style={card}>{CAMPAIGNS.map(c=><div key={c.title} style={{display:"flex",justifyContent:"space-between",padding:"12px 0",borderBottom:"1px solid #eef2f7"}}><div><strong>{c.title}</strong><div style={{color:"#6b7280"}}>{c.brand} · {c.budget}</div></div><span style={badge(c.status==="live"?"#16a34a":"#64748b")}>{c.status}</span></div>)}</div>}
        {section==="Brands" && <div style={card}>{BRANDS.map(b=><div key={b.name} style={{display:"flex",justifyContent:"space-between",padding:"12px 0",borderBottom:"1px solid #eef2f7"}}><div><strong>{b.name}</strong><div style={{color:"#6b7280"}}>{b.industry}</div></div><span style={badge("#16a34a")}>{b.status}</span></div>)}</div>}
        {section==="Users" && <div style={card}><p>Demo User One · user.one@example.com · <span style={badge("#16a34a")}>active</span></p><p>Demo User Two · user.two@example.com · <span style={badge("#16a34a")}>active</span></p><p style={{color:"#6b7280"}}>Synthetic accounts only. No real user data is loaded in Preview.</p></div>}
        {section==="Reports / Moderation" && <div style={card}><p><strong>0 open reports (synthetic queue).</strong></p><p style={{color:"#6b7280"}}>Moderation actions require <code>moderation.act</code>, AAL2 and step-up in the Preview database policies. No action is simulated here.</p></div>}
        {section==="Analytics" && <div style={card}><h3>Campaign reach (synthetic rollups)</h3>{[["Launch Week",78],["Festive Push",34]].map(([k,v])=><div key={k} style={{display:"flex",alignItems:"center",gap:10,margin:"8px 0"}}><span style={{width:140}}>{k}</span><div style={{height:16,background:"#7c3aed",borderRadius:6,width:`${v}%`}}/><span>{v}%</span></div>)}<p style={{color:"#6b7280"}}>Backed by <code>preview.analytics_daily_rollups</code> design; values shown are synthetic.</p></div>}
        {section==="Admin Management / RBAC" && <div style={card}><p><strong>Roles:</strong> super_admin, admin, moderator, support, analyst</p><p><strong>Permissions:</strong> 31 (30 assignable + non-assignable <code>owner.bootstrap</code>)</p><p style={{color:"#6b7280"}}>Role changes require <code>admins.manage</code>/<code>roles.manage</code> with AAL2 + step-up in the database. This Preview UI does not bypass those checks.</p></div>}
        {section==="Security / MFA" && <div style={card}><ul style={{lineHeight:1.9}}><li>Privileged access requires AAL2 + live verified TOTP factor (database-enforced).</li><li>Recovery codes never grant AAL2 or step-up.</li><li>Session revocation blocks the registered session immediately and never auto-suspends the account.</li><li>Suspension is a separate authorized operation.</li></ul><p style={{color:"#b45309"}}>Status: database policies implemented in Preview; live MFA flow NOT TESTED (no first Super Admin claimed yet).</p></div>}
        {section==="Notifications" && <div style={card}><p><strong>Queue:</strong> empty (synthetic).</p><p style={{color:"#6b7280"}}>Notification sending is not connected in Preview; nothing is claimed as sent.</p><button disabled style={{padding:"10px 16px",borderRadius:10}}>Send test notification (disabled — not connected)</button></div>}
        {section==="Settings" && <div style={card}><p><strong>Preview banner:</strong> enabled (synthetic config)</p><p style={{color:"#6b7280"}}>Site configuration lives in <code>ops.ops_site_config</code> behind <code>site_config.manage</code>. Production settings are never shown or edited here.</p><button disabled style={{padding:"10px 16px",borderRadius:10}}>Save settings (disabled — sign-in required)</button></div>}
      </section>
      <style>{`@media (max-width: 760px){ .admin-sidebar{display:none} }`}</style>
    </main>
  );
}
