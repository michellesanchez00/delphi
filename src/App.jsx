import { useState, useEffect, useCallback, useMemo } from "react";
import { REGULATIONS, CONTROLS_LIBRARY, DOMAINS, REGIONS, MARSH_ENTITIES } from "./regulatoryData";

const PROXY_URL = "https://delphi-proxy.vercel.app/api/claude";
const SESSION_KEY = "delphi_auth";
const SCOPE_KEY = "delphi_scope";
const ANALYSIS_KEY = "delphi_analyses";

const C = {
  bg:"#0a0c10",panel:"#111318",panel2:"#181c24",border:"#1e2433",
  text:"#e2e8f0",muted:"#64748b",accent:"#6366f1",accentHover:"#818cf8",
  green:"#10b981",greenBg:"rgba(16,185,129,0.12)",greenBorder:"rgba(16,185,129,0.3)",
  red:"#ef4444",redBg:"rgba(239,68,68,0.12)",redBorder:"rgba(239,68,68,0.3)",
  amber:"#f59e0b",amberBg:"rgba(245,158,11,0.12)",amberBorder:"rgba(245,158,11,0.3)",
  blue:"#3b82f6",blueBg:"rgba(59,130,246,0.12)",blueBorder:"rgba(59,130,246,0.3)",
  indigo:"#6366f1",indigoBg:"rgba(99,102,241,0.12)",indigoBorder:"rgba(99,102,241,0.3)",
};

const storage={
  get:(k,d=null)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch{return d;}},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}},
};

const formatDeadline=(iso)=>{if(!iso)return null;return new Date(iso+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});};
const daysUntil=(iso)=>{if(!iso)return null;const n=new Date();n.setHours(0,0,0,0);return Math.round((new Date(iso+"T00:00:00")-n)/86400000);};
const urgencyColor=(d)=>{if(d===null)return C.muted;if(d<0)return C.red;if(d<=90)return C.amber;if(d<=180)return C.blue;return C.green;};
const regionFlag={EU:"EU",US:"US",UK:"UK",APAC:"APAC",Global:"Global",Canada:"CA",LATAM:"LATAM","Middle East":"ME",Africa:"AF"};

const scopeStyle=(s)=>({"In Scope":{bg:C.greenBg,border:C.greenBorder,color:C.green},"Out of Scope":{bg:C.redBg,border:C.redBorder,color:C.red},Pending:{bg:C.amberBg,border:C.amberBorder,color:C.amber}}[s]||{bg:"rgba(100,116,139,0.1)",border:"rgba(100,116,139,0.3)",color:C.muted});
const statusStyle=(s)=>({"In Force":{bg:C.greenBg,border:C.greenBorder,color:C.green},Proposed:{bg:C.amberBg,border:C.amberBorder,color:C.amber},Analyzed:{bg:C.indigoBg,border:C.indigoBorder,color:C.indigo},Repealed:{bg:C.redBg,border:C.redBorder,color:C.red}}[s]||{bg:"rgba(100,116,139,0.1)",border:"rgba(100,116,139,0.3)",color:C.muted});

function Badge({text,style:s={}}){
  return(<span style={{display:"inline-flex",alignItems:"center",fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:20,border:"1px solid",backgroundColor:s.bg||"rgba(100,116,139,0.1)",borderColor:s.border||"rgba(100,116,139,0.3)",color:s.color||C.muted,whiteSpace:"nowrap"}}>{text}</span>);
}

const NAV=[{id:"dashboard",label:"Dashboard",icon:"⊞"},{id:"inventory",label:"Regulation Inventory",icon:"≡"},{id:"analyze",label:"Analyze",icon:"⚡"},{id:"controls",label:"Controls Library",icon:"✓"},{id:"timeline",label:"Timeline",icon:"→"},{id:"calendar",label:"Calendar",icon:"▦"}];

const G=`*{box-sizing:border-box;margin:0;padding:0;}body{background:#0a0c10;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;}input,select,button{font-family:inherit;}::-webkit-scrollbar{width:4px;height:4px;}::-webkit-scrollbar-thumb{background:#1e2433;border-radius:4px;}@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 0.8s linear infinite;}table{border-collapse:collapse;width:100%;}`;

function Login({onLogin}){
  const [pw,setPw]=useState("");const [err,setErr]=useState("");
  const go=()=>pw==="Regscan"?onLogin():setErr("Incorrect password.");
  return(<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}><style>{G}</style><div style={{width:"100%",maxWidth:360}}><div style={{textAlign:"center",marginBottom:32}}><div style={{fontSize:28,fontWeight:800,color:C.text,letterSpacing:-1}}>DELPHI</div><div style={{fontSize:13,color:C.muted,marginTop:4}}>Marsh Regulatory Intelligence Platform</div></div><div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:16,padding:32}}><div style={{marginBottom:16}}><label style={{display:"block",fontSize:11,color:C.muted,marginBottom:6,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase"}}>Password</label><input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&go()} style={{width:"100%",background:C.panel2,border:`1px solid ${err?C.red:C.border}`,color:C.text,borderRadius:8,padding:"10px 12px",fontSize:14,outline:"none"}} placeholder="Enter access code" autoFocus/>{err&&<div style={{color:C.red,fontSize:12,marginTop:6}}>{err}</div>}</div><button onClick={go} style={{width:"100%",background:C.accent,border:"none",color:"#fff",fontWeight:700,padding:"11px",borderRadius:8,fontSize:14,cursor:"pointer"}}>Access DELPHI</button></div></div></div>);
}

function Sidebar({active,onNav,onLogout,totalRegs,inScope}){
  return(<div style={{position:"fixed",inset:"0 auto 0 0",width:220,background:C.panel,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",zIndex:40,overflowY:"auto"}}><div style={{padding:"20px 16px 16px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}><div style={{fontSize:18,fontWeight:800,color:C.text,letterSpacing:-0.5}}>DELPHI</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>Marsh Regulatory Intelligence</div></div><nav style={{flex:1,padding:"12px 8px"}}>{NAV.map(n=>(<button key={n.id} onClick={()=>onNav(n.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:500,textAlign:"left",marginBottom:2,background:active===n.id?C.accent:"transparent",color:active===n.id?"#fff":C.muted,transition:"all 0.15s"}}><span style={{fontSize:15,width:18,textAlign:"center",flexShrink:0}}>{n.icon}</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.label}</span></button>))}</nav><div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,flexShrink:0}}><div style={{fontSize:11,color:C.muted,marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span>Regulations:</span><span style={{color:C.text,fontWeight:600}}>{totalRegs}</span></div><div style={{display:"flex",justifyContent:"space-between"}}><span>In Scope:</span><span style={{color:C.green,fontWeight:600}}>{inScope}</span></div></div><button onClick={onLogout} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:6,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontSize:12,cursor:"pointer"}}>Sign out</button></div></div>);
}

function StatCard({label,value,sub,color}){
  const col={indigo:C.indigo,emerald:C.green,amber:C.amber,red:C.red,blue:C.blue}[color]||C.indigo;
  return(<div style={{background:C.panel,border:`1px solid ${C.border}`,borderLeft:`3px solid ${col}`,borderRadius:12,padding:"14px 16px"}}><div style={{fontSize:26,fontWeight:800,color:col}}>{value}</div><div style={{fontSize:13,color:C.text,fontWeight:600,marginTop:2}}>{label}</div>{sub&&<div style={{fontSize:11,color:C.muted,marginTop:2}}>{sub}</div>}</div>);
}

function Dashboard({allRegs,scopeMap,analysisMap}){
  const byScope=useMemo(()=>{const c={"In Scope":0,"Out of Scope":0,Pending:0};allRegs.forEach(r=>{const s=scopeMap[r.id]||"Pending";if(s in c)c[s]++;});return c;},[allRegs,scopeMap]);
  const analyzed=Object.keys(analysisMap).length;
  const upcoming=useMemo(()=>allRegs.filter(r=>{if(!r.deadline)return false;const d=daysUntil(r.deadline);return d!==null&&d>=0&&d<=180;}).sort((a,b)=>new Date(a.deadline)-new Date(b.deadline)).slice(0,8),[allRegs]);
  const byDomain=useMemo(()=>{const m={};allRegs.forEach(r=>{if(!m[r.domain])m[r.domain]={total:0,inScope:0};m[r.domain].total++;if((scopeMap[r.id]||"Pending")==="In Scope")m[r.domain].inScope++;});return Object.entries(m).sort((a,b)=>b[1].total-a[1].total);},[allRegs,scopeMap]);
  const byRegion=useMemo(()=>{const m={};allRegs.forEach(r=>{m[r.region]=(m[r.region]||0)+1;});return Object.entries(m).sort((a,b)=>b[1]-a[1]);},[allRegs]);
  return(<div><div style={{marginBottom:20}}><h1 style={{fontSize:20,fontWeight:800,color:C.text}}>Compliance Posture Dashboard</h1><p style={{fontSize:13,color:C.muted,marginTop:4}}>Global regulatory inventory overview for Marsh entities</p></div><div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}><StatCard label="Total Regulations" value={allRegs.length} color="indigo"/><StatCard label="In Scope" value={byScope["In Scope"]} sub="Applicable" color="emerald"/><StatCard label="Out of Scope" value={byScope["Out of Scope"]} sub="Excluded" color="red"/><StatCard label="Pending Review" value={byScope.Pending} sub="Awaiting" color="amber"/><StatCard label="Analyzed" value={analyzed} sub="AI complete" color="blue"/></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}><div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,padding:16}}><div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:12}}>Regulations by Domain</div>{byDomain.map(([dom,{total,inScope}])=>(<div key={dom} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><div style={{fontSize:12,color:C.muted,width:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flexShrink:0}}>{dom}</div><div style={{flex:1,background:C.panel2,borderRadius:4,height:6,overflow:"hidden"}}><div style={{height:"100%",background:C.accent,borderRadius:4,width:`${(total/allRegs.length)*100}%`}}/></div><div style={{fontSize:12,color:C.text,width:24,textAlign:"right"}}>{total}</div><div style={{fontSize:11,color:C.green,width:70,textAlign:"right"}}>{inScope} in scope</div></div>))}</div><div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,padding:16}}><div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:12}}>Upcoming Deadlines (180 days)</div>{upcoming.length===0&&<div style={{fontSize:12,color:C.muted,textAlign:"center",padding:"20px 0"}}>No deadlines in next 180 days</div>}{upcoming.map(r=>{const days=daysUntil(r.deadline);return(<div key={r.id} style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,paddingBottom:8,marginBottom:8,borderBottom:`1px solid ${C.border}`}}><div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div><div style={{fontSize:11,color:C.muted}}>{r.region} · {r.domain}</div></div><div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:12,fontWeight:700,color:urgencyColor(days)}}>{formatDeadline(r.deadline)}</div><div style={{fontSize:11,color:C.muted}}>{days===0?"Today":`${days}d`}</div></div></div>);})}</div></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,padding:16}}><div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:12}}>Regulations by Region</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{byRegion.map(([reg,cnt])=>(<div key={reg} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}><span style={{color:C.muted,flex:1}}>{reg}</span><span style={{color:C.text,fontWeight:600}}>{cnt}</span></div>))}</div></div><div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,padding:16}}><div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:12}}>Scope Status</div>{Object.entries(byScope).map(([s,cnt])=>{const pct=allRegs.length?((cnt/allRegs.length)*100).toFixed(0):0;const col={"In Scope":C.green,"Out of Scope":C.red,Pending:C.amber}[s];return(<div key={s} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{color:C.muted}}>{s}</span><span style={{color:C.text}}>{cnt} ({pct}%)</span></div><div style={{height:8,background:C.panel2,borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",background:col,borderRadius:4,width:`${pct}%`,transition:"width 0.4s ease"}}/></div></div>);})}</div></div></div>);
}

function Inventory({allRegs,scopeMap,onScopeChange,analysisMap,onDelete,isAdmin,onAnalyzeClick}){
  const [search,setSearch]=useState("");const [domain,setDomain]=useState("All");const [region,setRegion]=useState("All");const [scope,setScope]=useState("All");const [page,setPage]=useState(1);const [delConfirm,setDelConfirm]=useState(null);const PER=20;
  const filtered=useMemo(()=>{let list=[...allRegs];if(search){const q=search.toLowerCase();list=list.filter(r=>r.name.toLowerCase().includes(q)||r.reference.toLowerCase().includes(q)||r.id.toLowerCase().includes(q)||(r.tags||[]).some(t=>t.toLowerCase().includes(q)));}if(domain!=="All")list=list.filter(r=>r.domain===domain);if(region!=="All")list=list.filter(r=>r.region===region);if(scope!=="All")list=list.filter(r=>(scopeMap[r.id]||"Pending")===scope);return list;},[allRegs,search,domain,region,scope,scopeMap]);
  const pages=Math.ceil(filtered.length/PER);const paged=filtered.slice((page-1)*PER,page*PER);
  const inp={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"8px 12px",fontSize:13,outline:"none"};
  const th={padding:"10px 12px",fontSize:11,fontWeight:700,color:C.muted,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap",textTransform:"uppercase",letterSpacing:"0.05em"};
  const td={padding:"10px 12px",borderBottom:`1px solid ${C.border}`,verticalAlign:"top"};
  const confirmDel=(id)=>{if(delConfirm===id){onDelete(id);setDelConfirm(null);}else{setDelConfirm(id);setTimeout(()=>setDelConfirm(null),3000);}};
  return(<div><div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}><div><h1 style={{fontSize:20,fontWeight:800,color:C.text}}>Regulation Inventory</h1><p style={{fontSize:13,color:C.muted,marginTop:4}}>{filtered.length} regulations {filtered.length!==allRegs.length&&`(${allRegs.length} total)`}</p></div>{isAdmin&&<Badge text="Admin Mode" style={{bg:C.indigoBg,border:C.indigoBorder,color:C.indigo}}/>}</div><div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search regulations, references, tags..." style={{...inp,flex:1,minWidth:200}}/><select value={domain} onChange={e=>{setDomain(e.target.value);setPage(1);}} style={{...inp,cursor:"pointer"}}><option>All</option>{DOMAINS.map(d=><option key={d}>{d}</option>)}</select><select value={region} onChange={e=>{setRegion(e.target.value);setPage(1);}} style={{...inp,cursor:"pointer"}}><option>All</option>{["EU","US","UK","APAC","Global","Canada","LATAM","Middle East","Africa"].map(r=><option key={r}>{r}</option>)}</select><select value={scope} onChange={e=>{setScope(e.target.value);setPage(1);}} style={{...inp,cursor:"pointer"}}><option>All</option><option>In Scope</option><option>Out of Scope</option><option>Pending</option></select></div><div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}><div style={{overflowX:"auto"}}><table><thead style={{background:C.panel2}}><tr><th style={{...th,width:80}}>ID</th><th style={th}>Regulation</th><th style={{...th,width:80}}>Region</th><th style={{...th,width:130}}>Domain</th><th style={{...th,width:90}}>Status</th><th style={{...th,width:100}}>Scope</th><th style={{...th,width:130}}>Deadline</th><th style={{...th,width:200}}>Set Scope</th><th style={{...th,width:100}}>Actions</th></tr></thead><tbody>{paged.map(r=>{const rs=analysisMap[r.id]?"Analyzed":r.status;const cs=scopeMap[r.id]||"Pending";const days=daysUntil(r.deadline);return(<tr key={r.id}><td style={{...td,fontFamily:"monospace",fontSize:11,color:C.muted}}>{r.id}</td><td style={td}><div style={{fontWeight:600,color:C.text,fontSize:13,maxWidth:280}}>{r.name}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{r.reference}</div></td><td style={{...td,fontSize:12}}>{r.region}</td><td style={td}><Badge text={r.domain}/></td><td style={td}><Badge text={rs} style={statusStyle(rs)}/></td><td style={td}><Badge text={cs} style={scopeStyle(cs)}/></td><td style={{...td,fontSize:12,whiteSpace:"nowrap"}}>{r.deadline?<span style={{color:urgencyColor(days)}}>{formatDeadline(r.deadline)}{days!==null&&days>=0&&<span style={{color:C.muted,marginLeft:4}}>({days}d)</span>}</span>:<span style={{color:C.border}}>-</span>}</td><td style={td}><div style={{display:"flex",gap:6,alignItems:"center"}}><select value={cs} onChange={e=>onScopeChange(r.id,e.target.value)} style={{background:C.panel2,border:`1px solid ${C.border}`,color:C.text,borderRadius:6,padding:"4px 8px",fontSize:12,cursor:"pointer",outline:"none"}}><option>Pending</option><option>In Scope</option><option>Out of Scope</option></select>{isAdmin&&<button onClick={()=>confirmDel(r.id)} style={{fontSize:11,padding:"4px 8px",borderRadius:6,border:`1px solid ${delConfirm===r.id?C.red:C.border}`,background:delConfirm===r.id?C.redBg:"transparent",color:delConfirm===r.id?C.red:C.muted,cursor:"pointer"}}>{delConfirm===r.id?"Confirm":"X"}</button>}</div></td><td style={td}><button onClick={()=>onAnalyzeClick(r.id)} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,fontWeight:600,padding:"5px 10px",borderRadius:6,border:`1px solid ${analysisMap[r.id]?C.indigoBorder:C.border}`,background:analysisMap[r.id]?C.indigoBg:"transparent",color:analysisMap[r.id]?C.indigo:C.muted,cursor:"pointer",whiteSpace:"nowrap"}}>⚡ {analysisMap[r.id]?"View Analysis":"Analyze"}</button></td></tr>);})}{paged.length===0&&<tr><td colSpan={9} style={{...td,textAlign:"center",color:C.muted,padding:"48px 0"}}>No regulations match your filters</td></tr>}</tbody></table></div>{pages>1&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderTop:`1px solid ${C.border}`}}><span style={{fontSize:12,color:C.muted}}>Page {page} of {pages} - {filtered.length} results</span><div style={{display:"flex",gap:4}}><button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${C.border}`,background:C.panel2,color:C.text,fontSize:12,cursor:"pointer",opacity:page===1?0.4:1}}>Prev</button><button onClick={()=>setPage(p=>Math.min(pages,p+1))} disabled={page===pages} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${C.border}`,background:C.panel2,color:C.text,fontSize:12,cursor:"pointer",opacity:page===pages?0.4:1}}>Next</button></div></div>}</div></div>);
}

function Analyze({allRegs,scopeMap,onScopeChange,analysisMap,onAnalysisComplete,initialRegId,onAnalyzeDone}){
  const [selected,setSelected]=useState(initialRegId||"");
  const [searchQ,setSearchQ]=useState("");
  const [showDropdown,setShowDropdown]=useState(false);
  const [loading,setLoading]=useState(false);const [error,setError]=useState("");const [result,setResult]=useState(null);
  const reg=allRegs.find(r=>r.id===selected);
  // If arriving from Inventory with a pre-selected reg, load it
  useEffect(()=>{if(initialRegId){setSelected(initialRegId);if(onAnalyzeDone)onAnalyzeDone();}},[initialRegId]);
  useEffect(()=>{setResult(selected&&analysisMap[selected]?analysisMap[selected]:null);},[selected,analysisMap]);
  const filteredRegs=useMemo(()=>{if(!searchQ)return allRegs;const q=searchQ.toLowerCase();return allRegs.filter(r=>r.name.toLowerCase().includes(q)||r.reference.toLowerCase().includes(q)||r.id.toLowerCase().includes(q));},[allRegs,searchQ]);
  const selectReg=(id)=>{setSelected(id);setSearchQ("");setShowDropdown(false);};
  const inScopeIds=useMemo(()=>new Set(Object.entries(scopeMap).filter(([,v])=>v==="In Scope").map(([k])=>k)),[scopeMap]);
  const analyze=async()=>{
    if(!reg)return;setLoading(true);setError("");setResult(null);
    const existingCtrl=CONTROLS_LIBRARY.filter(c=>c.regulations.some(rId=>inScopeIds.has(rId)&&rId!==selected)).map(c=>`${c.controlId}: ${c.title}`).join("\n");
    const regCtrl=CONTROLS_LIBRARY.filter(c=>c.regulations.includes(selected));
    const prompt=`You are a senior regulatory compliance expert for Marsh McLennan.

IMPORTANT: Your ENTIRE response must be a single valid JSON object. No markdown, no backticks, no explanation outside JSON. All string values must be properly escaped. Do not use newlines inside string values.

Analyze this regulation for Marsh. The Marsh group entities are: ${MARSH_ENTITIES.join(", ")}.

Assess which of these entities are In Scope or Out of Scope for this regulation and why. Consider the entity's business type, jurisdiction, and regulatory perimeter.

Analyze this regulation for Marsh:
Name: ${reg.name}
Reference: ${reg.reference}
Region: ${reg.region}
Domain: ${reg.domain}
Effective: ${reg.effectiveDate}
Deadline: ${reg.deadline||"N/A"}
Summary: ${reg.summary}
Marsh entities: ${(reg.marshEntities||[]).join(", ")}

Existing controls already in place (from other In Scope regulations):
${existingCtrl||"None yet"}

Controls mapped to this regulation in the library:
${regCtrl.map(c=>`${c.controlId}: ${c.title}`).join(", ")||"None mapped"}

Return ONLY this JSON structure with no other text:
{"executiveSummary":"2-3 sentence impact summary","businessRisk":"High","riskRationale":"one sentence","keyObligations":["obligation 1","obligation 2","obligation 3"],"marshScope":[{"entity":"Marsh (Parent)","inScope":true,"reason":"one sentence rationale"},{"entity":"Marsh Risk","inScope":true,"reason":"one sentence rationale"}],"newControls":[{"title":"control name","description":"what to do","priority":"Immediate"}],"gapAnalysis":"gap assessment paragraph","deadlineRisk":"deadline commentary or empty string","recommendedActions":["action 1","action 2","action 3"]}

Rules: businessRisk must be High, Medium, or Low. priority must be Immediate, Short-term, or Ongoing. newControls should only include controls NOT already covered by existing controls listed above. marshScope must assess ALL of these entities: ${MARSH_ENTITIES.join(", ")}. Each reason must be one concise sentence with no newlines.`;
    try{
      const res=await fetch(PROXY_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:2000,messages:[{role:"user",content:prompt}]})});
      if(!res.ok)throw new Error(`API error ${res.status}`);
      const data=await res.json();
      const raw=data.content?.[0]?.text||"";
      // Strip markdown code fences if present
      const text=raw.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
      // Robustly extract and clean JSON from the response
      let parsed;
      try {
        // Try direct parse first
        parsed=JSON.parse(text);
      } catch {
        try {
          // Extract JSON block
          const m=text.match(/\{[\s\S]*\}/);
          if(!m) throw new Error("No JSON found in response");
          let jsonStr=m[0];
          // Fix common Claude JSON issues:
          // 1. Remove trailing commas before } or ]
          jsonStr=jsonStr.replace(/,\s*([}\]])/g,'$1');
          // 2. Fix unescaped newlines inside strings
          jsonStr=jsonStr.replace(/([^\\])\n/g,'$1 ');
          // 3. Fix unescaped quotes inside string values (basic)
          parsed=JSON.parse(jsonStr);
        } catch(e2) {
          // Last resort: build a minimal result from the text
          parsed={
            executiveSummary:"Analysis completed but response could not be fully parsed. Please try again.",
            businessRisk:"Medium",
            riskRationale:"See raw output below.",
            keyObligations:[text.substring(0,500)],
            newControls:[],
            gapAnalysis:"Please re-run the analysis.",
            deadlineRisk:"",
            recommendedActions:["Re-run analysis for structured output"]
          };
        }
      }
      onAnalysisComplete(selected,parsed);setResult(parsed);
    }catch(e){setError(e.message||"Analysis failed");}
    finally{setLoading(false);}
  };
  const riskColor=r=>({High:C.red,Medium:C.amber,Low:C.green}[r]||C.muted);
  const inp={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"10px 12px",fontSize:14,width:"100%",outline:"none"};
  const card={background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:12};
  const marshScopeFromReg=reg?MARSH_ENTITIES.map(e=>({entity:e,inScope:(reg.marshEntities||[]).includes(e)})):[];
  return(<div><div style={{marginBottom:20}}><h1 style={{fontSize:20,fontWeight:800,color:C.text}}>Analyze Regulation</h1><p style={{fontSize:13,color:C.muted,marginTop:4}}>AI-powered compliance analysis with gap assessment</p></div><div style={card}><div style={{marginBottom:12}}><label style={{display:"block",fontSize:11,color:C.muted,marginBottom:6,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>Select Regulation</label>
        <div style={{position:"relative"}}>
          <input value={selected&&!showDropdown?(allRegs.find(r=>r.id===selected)?.name||selected):searchQ} onChange={e=>{setSearchQ(e.target.value);setShowDropdown(true);if(!e.target.value)setSelected("");}} onFocus={()=>{setShowDropdown(true);if(selected)setSearchQ("");}} onBlur={()=>setTimeout(()=>setShowDropdown(false),200)} placeholder="Search by name, reference, or ID..." style={{...inp,width:"100%",paddingRight:36}}/>
          <span onClick={()=>{setSelected("");setSearchQ("");setShowDropdown(true);}} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",cursor:"pointer",color:C.muted,fontSize:14,userSelect:"none"}}>{selected?"×":"▾"}</span>
          {showDropdown&&(<div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:100,background:C.panel,border:`1px solid ${C.border}`,borderRadius:8,marginTop:4,maxHeight:280,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.4)"}}>{filteredRegs.length===0&&<div style={{padding:"12px 16px",fontSize:12,color:C.muted}}>No regulations found</div>}{filteredRegs.map(r=>(<div key={r.id} onMouseDown={()=>selectReg(r.id)} style={{padding:"10px 14px",cursor:"pointer",borderBottom:`1px solid ${C.border}`,background:selected===r.id?C.indigoBg:"transparent"}} onMouseEnter={e=>e.currentTarget.style.background=selected===r.id?C.indigoBg:C.panel2} onMouseLeave={e=>e.currentTarget.style.background=selected===r.id?C.indigoBg:"transparent"}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontFamily:"monospace",fontSize:10,color:C.muted,flexShrink:0}}>{r.id}</span><span style={{fontSize:13,color:C.text,fontWeight:selected===r.id?600:400}}>{r.name}</span>{analysisMap[r.id]&&<span style={{marginLeft:"auto",fontSize:10,color:C.indigo,flexShrink:0}}>Analyzed</span>}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{r.reference} · {r.region} · {r.domain}</div></div>))}</div>)}
        </div></div>{reg&&<div style={{background:C.panel2,borderRadius:8,padding:12,marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:8}}><div><div style={{fontWeight:700,color:C.text,fontSize:14}}>{reg.name}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{reg.reference} - {reg.region} - {reg.domain}</div></div><div style={{display:"flex",gap:6,flexShrink:0}}><Badge text={analysisMap[selected]?"Analyzed":reg.status} style={statusStyle(analysisMap[selected]?"Analyzed":reg.status)}/><Badge text={scopeMap[selected]||"Pending"} style={scopeStyle(scopeMap[selected]||"Pending")}/></div></div><p style={{fontSize:12,color:C.muted,lineHeight:1.6,marginBottom:8}}>{reg.summary}</p>{reg.deadline&&<div style={{fontSize:12,color:urgencyColor(daysUntil(reg.deadline)),marginBottom:8}}>Deadline: {formatDeadline(reg.deadline)} ({daysUntil(reg.deadline)} days)</div>}<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:12,color:C.muted}}>Scope:</span><select value={scopeMap[selected]||"Pending"} onChange={e=>onScopeChange(selected,e.target.value)} style={{background:C.panel,border:`1px solid ${C.border}`,color:C.text,borderRadius:6,padding:"4px 8px",fontSize:12,cursor:"pointer",outline:"none"}}><option>Pending</option><option>In Scope</option><option>Out of Scope</option></select></div></div>}
        {reg&&<div style={{...card,marginTop:0}}>
          <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:10}}>◈ Marsh Entity Scope</div>
          <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Scope based on regulation's jurisdictional perimeter and entity type. Run AI analysis below for detailed rationale.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div><div style={{fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:C.green,fontWeight:700,marginBottom:6}}>● In Scope ({marshScopeFromReg.filter(e=>e.inScope).length})</div>{marshScopeFromReg.filter(e=>e.inScope).map(e=>{const aiEntry=result?.marshScope?.find(x=>x.entity===e.entity);return(<div key={e.entity} style={{background:C.greenBg,border:`1px solid ${C.greenBorder}`,borderLeft:`3px solid ${C.green}`,borderRadius:8,padding:"10px 12px",marginBottom:6}}><div style={{fontSize:12,fontWeight:600,color:C.text}}>{e.entity}</div>{aiEntry?.reason&&<div style={{fontSize:11,color:C.muted,marginTop:3,lineHeight:1.4}}>{aiEntry.reason}</div>}</div>);})}
            {marshScopeFromReg.filter(e=>e.inScope).length===0&&<div style={{fontSize:12,color:C.muted,fontStyle:"italic"}}>None</div>}</div>
            <div><div style={{fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:C.muted,fontWeight:700,marginBottom:6}}>○ Out of Scope ({marshScopeFromReg.filter(e=>!e.inScope).length})</div>{marshScopeFromReg.filter(e=>!e.inScope).map(e=>{const aiEntry=result?.marshScope?.find(x=>x.entity===e.entity);return(<div key={e.entity} style={{background:C.panel2,border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.muted}`,borderRadius:8,padding:"10px 12px",marginBottom:6,opacity:0.7}}><div style={{fontSize:12,fontWeight:600,color:C.muted}}>{e.entity}</div>{aiEntry?.reason&&<div style={{fontSize:11,color:C.muted,marginTop:3,lineHeight:1.4}}>{aiEntry.reason}</div>}</div>);})}
            {marshScopeFromReg.filter(e=>!e.inScope).length===0&&<div style={{fontSize:12,color:C.muted,fontStyle:"italic"}}>None</div>}</div>
          </div>
          <div style={{fontSize:10,color:C.muted,marginTop:8,fontStyle:"italic"}}>Run AI analysis to populate per-entity rationale. Always validate with legal counsel.</div>
        </div>}
        <button onClick={analyze} disabled={!selected||loading} style={{display:"flex",alignItems:"center",gap:8,background:C.accent,border:"none",color:"#fff",fontWeight:700,padding:"10px 20px",borderRadius:8,fontSize:14,cursor:selected&&!loading?"pointer":"not-allowed",opacity:!selected||loading?0.6:1}}>{loading?<span>Analyzing...</span>:"Run Analysis"}</button>{error&&<div style={{marginTop:12,background:C.redBg,border:`1px solid ${C.redBorder}`,color:C.red,borderRadius:8,padding:12,fontSize:13}}>{error}</div>}</div>{result&&<div><div style={{...card,borderLeft:`3px solid ${riskColor(result.businessRisk)}`}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><div style={{fontWeight:700,color:C.text}}>Executive Summary</div><div style={{fontSize:14,fontWeight:800,color:riskColor(result.businessRisk)}}>{result.businessRisk} Risk</div></div><p style={{fontSize:13,color:C.muted,lineHeight:1.7}}>{result.executiveSummary}</p>{result.riskRationale&&<p style={{fontSize:12,color:C.muted,marginTop:8,fontStyle:"italic"}}>{result.riskRationale}</p>}</div><div style={card}><div style={{fontWeight:700,color:C.text,marginBottom:10}}>Key Obligations</div>{result.keyObligations?.map((o,i)=><div key={i} style={{display:"flex",gap:8,marginBottom:6,fontSize:13,color:C.muted}}><span style={{color:C.accent,flexShrink:0}}>-</span>{o}</div>)}</div><div style={card}><div style={{fontWeight:700,color:C.text,marginBottom:8}}>Gap Analysis</div><p style={{fontSize:13,color:C.muted,lineHeight:1.7}}>{result.gapAnalysis}</p></div>{result.newControls?.length>0&&<div style={{...card,background:C.indigoBg,border:`1px solid ${C.indigoBorder}`}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><div style={{fontWeight:700,color:C.indigo}}>New Controls Required ({result.newControls.length})</div><span style={{fontSize:11,color:C.muted}}>- not covered by existing in-scope regulations</span></div>{result.newControls.map((c,i)=>{const pc={Immediate:C.red,"Short-term":C.amber,Ongoing:C.blue}[c.priority]||C.blue;return(<div key={i} style={{background:"rgba(0,0,0,0.2)",border:`1px solid ${C.indigoBorder}`,borderRadius:8,padding:12,marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:4}}><span style={{fontWeight:600,color:C.accentHover,fontSize:13}}>{c.title}</span><Badge text={c.priority} style={{bg:`${pc}22`,border:`${pc}44`,color:pc}}/></div><p style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{c.description}</p></div>);})}</div>}{result.recommendedActions?.length>0&&<div style={card}><div style={{fontWeight:700,color:C.text,marginBottom:10}}>Recommended Actions</div>{result.recommendedActions.map((a,i)=><div key={i} style={{display:"flex",gap:10,marginBottom:6,fontSize:13,color:C.muted,alignItems:"flex-start"}}><span style={{fontFamily:"monospace",fontSize:11,background:C.panel2,borderRadius:4,padding:"2px 6px",flexShrink:0}}>{i+1}</span>{a}</div>)}</div>}{result.deadlineRisk&&<div style={{...card,background:C.amberBg,border:`1px solid ${C.amberBorder}`}}><div style={{display:"flex",gap:8,fontSize:13,color:C.amber}}><span>!</span><span>{result.deadlineRisk}</span></div></div>}</div>}</div>);
}

function Controls({allRegs,scopeMap,isAdmin,onDeleteControl,deletedControlIds}){
  const [cat,setCat]=useState("All");const [search,setSearch]=useState("");const [showAll,setShowAll]=useState(false);const [delCtrl,setDelCtrl]=useState(null);
  const confirmDelCtrl=(id)=>{if(delCtrl===id){onDeleteControl(id);setDelCtrl(null);}else{setDelCtrl(id);setTimeout(()=>setDelCtrl(null),3000);}};
  const inScopeIds=useMemo(()=>new Set(Object.entries(scopeMap).filter(([,v])=>v==="In Scope").map(([k])=>k)),[scopeMap]);
  const categories=useMemo(()=>["All",...new Set(CONTROLS_LIBRARY.map(c=>c.category))],[]);
  const controls=useMemo(()=>{let l=CONTROLS_LIBRARY.filter(c=>!(deletedControlIds||[]).includes(c.controlId));if(!showAll)l=l.filter(c=>c.regulations.some(rId=>inScopeIds.has(rId)));if(cat!=="All")l=l.filter(c=>c.category===cat);if(search){const q=search.toLowerCase();l=l.filter(c=>c.title.toLowerCase().includes(q)||c.description.toLowerCase().includes(q));}return l;},[inScopeIds,cat,search,showAll,deletedControlIds]);
  const card={background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:10};
  const inp={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"8px 12px",fontSize:13,outline:"none"};
  return(
    <div>
      <div style={{marginBottom:16}}>
        <h1 style={{fontSize:20,fontWeight:800,color:C.text}}>Controls Library</h1>
        <p style={{fontSize:13,color:C.muted,marginTop:4}}>{controls.length} controls {showAll?"(all)":"(in-scope)"}</p>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search controls..." style={{...inp,flex:1,minWidth:180}}/>
        <select value={cat} onChange={e=>setCat(e.target.value)} style={{...inp,cursor:"pointer"}}>{categories.map(c=><option key={c}>{c}</option>)}</select>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:C.muted,cursor:"pointer"}}>
          <input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)} style={{accentColor:C.accent}}/>Show all
        </label>
      </div>
      {inScopeIds.size===0&&!showAll&&(
        <div style={{background:C.amberBg,border:`1px solid ${C.amberBorder}`,borderRadius:12,padding:20,textAlign:"center",marginBottom:16}}>
          <div style={{color:C.amber,fontSize:13,fontWeight:600}}>No regulations are marked In Scope yet</div>
          <div style={{color:C.muted,fontSize:12,marginTop:4}}>Set regulations to In Scope in the Inventory tab</div>
        </div>
      )}
      {controls.map(ctrl=>{
        const pc={Immediate:C.red,"Short-term":C.amber,Ongoing:C.blue}[ctrl.priority]||C.blue;
        return(
          <div key={ctrl.controlId} style={card}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:8}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                  <span style={{fontFamily:"monospace",fontSize:11,color:C.muted}}>{ctrl.controlId}</span>
                  <Badge text={ctrl.priority} style={{bg:`${pc}22`,border:`${pc}44`,color:pc}}/>
                </div>
                <div style={{fontWeight:700,color:C.text,fontSize:14}}>{ctrl.title}</div>
              </div>
              <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                <Badge text={ctrl.category}/>
                {isAdmin&&<button onClick={()=>confirmDelCtrl(ctrl.controlId)} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:`1px solid ${delCtrl===ctrl.controlId?C.red:C.border}`,background:delCtrl===ctrl.controlId?C.redBg:"transparent",color:delCtrl===ctrl.controlId?C.red:C.muted,cursor:"pointer",flexShrink:0}}>{delCtrl===ctrl.controlId?"Confirm":"×"}</button>}
              </div>
            </div>
            <p style={{fontSize:12,color:C.muted,lineHeight:1.6,marginBottom:8}}>{ctrl.description}</p>
            <div style={{fontSize:12,color:C.muted,marginBottom:4}}><span style={{color:C.text,fontWeight:600}}>Owner:</span> {ctrl.owner}</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:10}}><span style={{color:C.text,fontWeight:600}}>Testing:</span> {ctrl.testingCriteria}</div>
            <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:6}}>Required by:</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
              {ctrl.regulations.map(rId=>{
                const iS=inScopeIds.has(rId);
                const nm=allRegs.find(r=>r.id===rId)?.name||rId;
                return(<span key={rId} style={{fontSize:11,padding:"2px 8px",borderRadius:12,border:`1px solid ${iS?C.greenBorder:C.border}`,background:iS?C.greenBg:"transparent",color:iS?C.green:C.muted}}>{rId} - {nm.substring(0,25)}{iS?" (In Scope)":""}</span>);
              })}
            </div>
          </div>
        );
      })}
      {controls.length===0&&(inScopeIds.size>0||showAll)&&(
        <div style={{textAlign:"center",color:C.muted,padding:"48px 0",fontSize:13}}>No controls match your filters</div>
      )}
    </div>
  );
}

function Timeline({allRegs,scopeMap}){
  const [filter,setFilter]=useState("All");
  const withDeadlines=useMemo(()=>{let l=allRegs.filter(r=>r.deadline);if(filter==="In Scope")l=l.filter(r=>(scopeMap[r.id]||"Pending")==="In Scope");if(filter==="Upcoming")l=l.filter(r=>daysUntil(r.deadline)!==null&&daysUntil(r.deadline)>=0);return l.sort((a,b)=>new Date(a.deadline)-new Date(b.deadline));},[allRegs,scopeMap,filter]);
  const grouped=useMemo(()=>{const g={};withDeadlines.forEach(r=>{const y=r.deadline.substring(0,4);if(!g[y])g[y]=[];g[y].push(r);});return g;},[withDeadlines]);
  const sel={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"8px 12px",fontSize:13,cursor:"pointer",outline:"none"};
  return(<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:8}}><div><h1 style={{fontSize:20,fontWeight:800,color:C.text}}>Regulatory Timeline</h1><p style={{fontSize:13,color:C.muted,marginTop:4}}>{withDeadlines.length} regulations with deadlines</p></div><select value={filter} onChange={e=>setFilter(e.target.value)} style={sel}><option>All</option><option>In Scope</option><option>Upcoming</option></select></div>{Object.keys(grouped).length===0&&<div style={{textAlign:"center",color:C.muted,padding:"64px 0"}}>No deadlines match your filter</div>}{Object.entries(grouped).sort().map(([year,regs])=>(<div key={year} style={{marginBottom:32}}><div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}><div style={{fontSize:18,fontWeight:800,color:C.accent}}>{year}</div><div style={{height:1,flex:1,background:C.border}}/><span style={{fontSize:11,color:C.muted}}>{regs.length} deadline{regs.length!==1?"s":""}</span></div><div style={{paddingLeft:20,position:"relative"}}><div style={{position:"absolute",left:6,top:8,bottom:8,width:1,background:C.border}}/>{regs.map(r=>{const days=daysUntil(r.deadline);const col=urgencyColor(days);const cs=scopeMap[r.id]||"Pending";return(<div key={r.id} style={{position:"relative",display:"flex",alignItems:"flex-start",gap:16,marginBottom:10}}><div style={{position:"absolute",left:-16,top:14,width:10,height:10,borderRadius:"50%",border:`2px solid ${col}`,background:days!==null&&days<0?col:"transparent",flexShrink:0}}/><div style={{flex:1,background:C.panel,border:`1px solid ${C.border}`,borderRadius:10,padding:12,display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"}}><div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,color:C.text,fontSize:13}}>{r.name}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{r.reference} - {r.region} - {r.domain}</div></div><div style={{textAlign:"right",flexShrink:0}}><div style={{fontWeight:700,fontSize:12,color:col}}>{formatDeadline(r.deadline)}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{days<0?`${Math.abs(days)}d past`:days===0?"Today":`${days}d`}</div><div style={{marginTop:4}}><Badge text={cs} style={scopeStyle(cs)}/></div></div></div></div>);})}</div></div>))}</div>);
}

function Calendar({allRegs,scopeMap}){
  const today=new Date();
  const [viewDate,setViewDate]=useState(new Date(today.getFullYear(),today.getMonth(),1));
  const [selectedDay,setSelectedDay]=useState(null);const [filter,setFilter]=useState("All");
  const month=viewDate.getMonth();const year=viewDate.getFullYear();
  const firstDay=new Date(year,month,1).getDay();const daysInMonth=new Date(year,month+1,0).getDate();
  const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
  const withDeadlines=useMemo(()=>{let l=allRegs.filter(r=>r.deadline);if(filter==="In Scope")l=l.filter(r=>(scopeMap[r.id]||"Pending")==="In Scope");return l;},[allRegs,scopeMap,filter]);
  const regsByDay=useMemo(()=>{const m={};withDeadlines.forEach(r=>{const d=new Date(r.deadline+"T00:00:00");if(d.getMonth()===month&&d.getFullYear()===year){const day=d.getDate();if(!m[day])m[day]=[];m[day].push(r);}});return m;},[withDeadlines,month,year]);
  const sel={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"8px 12px",fontSize:13,cursor:"pointer",outline:"none"};
  const btn={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"8px 12px",fontSize:13,cursor:"pointer"};
  return(<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:8}}><div><h1 style={{fontSize:20,fontWeight:800,color:C.text}}>Regulatory Calendar</h1><p style={{fontSize:13,color:C.muted,marginTop:4}}>{MONTHS[month]} {year}</p></div><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><select value={filter} onChange={e=>setFilter(e.target.value)} style={sel}><option>All</option><option>In Scope</option></select><button onClick={()=>setViewDate(new Date(year,month-1,1))} style={btn}>Prev</button><span style={{fontSize:13,fontWeight:700,color:C.text,minWidth:140,textAlign:"center"}}>{MONTHS[month]} {year}</span><button onClick={()=>setViewDate(new Date(year,month+1,1))} style={btn}>Next</button><button onClick={()=>{setViewDate(new Date(today.getFullYear(),today.getMonth(),1));setSelectedDay(null);}} style={{...btn,color:C.accent}}>Today</button></div></div><div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}><div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:`1px solid ${C.border}`}}>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} style={{padding:"8px 0",textAlign:"center",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase"}}>{d}</div>)}</div><div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>{Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`} style={{minHeight:72,borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`,background:C.bg}}/>)}{Array.from({length:daysInMonth}).map((_,i)=>{const day=i+1;const isToday=day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();const regsHere=regsByDay[day]||[];const isSel=selectedDay===day;return(<div key={day} onClick={()=>setSelectedDay(isSel?null:day)} style={{minHeight:72,borderRight:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`,padding:6,cursor:"pointer",background:isSel?"rgba(99,102,241,0.1)":"transparent"}}><div style={{fontSize:12,fontWeight:700,width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",marginBottom:4,background:isToday?C.accent:"transparent",color:isToday?"#fff":C.muted}}>{day}</div>{regsHere.slice(0,2).map(r=>{const col=urgencyColor(daysUntil(r.deadline));return(<div key={r.id} style={{fontSize:10,padding:"1px 4px",borderRadius:3,marginBottom:2,background:`${col}22`,color:col,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name.substring(0,18)}</div>);})}{regsHere.length>2&&<div style={{fontSize:10,color:C.muted}}>+{regsHere.length-2}</div>}</div>);})}</div></div>{selectedDay&&(regsByDay[selectedDay]||[]).length>0&&<div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginTop:12}}><div style={{fontWeight:700,color:C.text,fontSize:14,marginBottom:12}}>{MONTHS[month]} {selectedDay}, {year} - {(regsByDay[selectedDay]||[]).length} deadline{(regsByDay[selectedDay]||[]).length!==1?"s":""}</div>{(regsByDay[selectedDay]||[]).map(r=>{const days=daysUntil(r.deadline);return(<div key={r.id} style={{display:"flex",justifyContent:"space-between",gap:12,paddingBottom:10,marginBottom:10,borderBottom:`1px solid ${C.border}`}}><div><div style={{fontWeight:600,color:C.text,fontSize:13}}>{r.name}</div><div style={{fontSize:11,color:C.muted,marginTop:2}}>{r.reference} - {r.region}</div></div><div style={{textAlign:"right",flexShrink:0}}><Badge text={scopeMap[r.id]||"Pending"} style={scopeStyle(scopeMap[r.id]||"Pending")}/><div style={{fontSize:11,marginTop:4,color:urgencyColor(days)}}>{days===0?"Today":days<0?`${Math.abs(days)}d past`:`${days}d`}</div></div></div>);})}</div>}</div>);
}

export default function App(){
  const [authed,setAuthed]=useState(()=>storage.get(SESSION_KEY,false));
  const [view,setView]=useState("dashboard");
  const [scopeMap,setScopeMap]=useState(()=>storage.get(SCOPE_KEY,{}));
  const [analysisMap,setAnalysisMap]=useState(()=>storage.get(ANALYSIS_KEY,{}));
  const [deletedIds,setDeletedIds]=useState(()=>storage.get("delphi_deleted",[]));
  const [deletedControlIds,setDeletedControlIds]=useState(()=>storage.get("delphi_deleted_controls",[]));
  const [isAdmin,setIsAdmin]=useState(()=>storage.get("delphi_admin",false));
  const [analyzeRegId,setAnalyzeRegId]=useState(null);
  const allRegs=useMemo(()=>{const d=new Set(deletedIds);return REGULATIONS.filter(r=>!d.has(r.id));},[deletedIds]);
  const inScopeCount=useMemo(()=>Object.values(scopeMap).filter(v=>v==="In Scope").length,[scopeMap]);
  const login=()=>{setAuthed(true);storage.set(SESSION_KEY,true);};
  const logout=()=>{setAuthed(false);storage.set(SESSION_KEY,false);};
  const setScopeFor=useCallback((id,val)=>{setScopeMap(prev=>{const n={...prev,[id]:val};storage.set(SCOPE_KEY,n);return n;});},[]);
  const onAnalysisComplete=useCallback((id,data)=>{setAnalysisMap(prev=>{const n={...prev,[id]:data};storage.set(ANALYSIS_KEY,n);return n;});},[]);
  const onDelete=useCallback((id)=>{setDeletedIds(prev=>{const n=[...prev,id];storage.set("delphi_deleted",n);return n;});},[]);
  const onDeleteControl=useCallback((id)=>{setDeletedControlIds(prev=>{const n=[...prev,id];storage.set("delphi_deleted_controls",n);return n;});},[]);
  if(!authed)return <Login onLogin={login}/>;
  const vp={allRegs,scopeMap,analysisMap};
  return(<div style={{minHeight:"100vh",background:C.bg,color:C.text}}><style>{G}</style><Sidebar active={view} onNav={setView} onLogout={logout} totalRegs={allRegs.length} inScope={inScopeCount}/><main style={{marginLeft:220,minHeight:"100vh"}}><div style={{maxWidth:1100,margin:"0 auto",padding:"24px 28px"}}><div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}><button onClick={()=>{const v=!isAdmin;setIsAdmin(v);storage.set("delphi_admin",v);}} style={{fontSize:12,padding:"6px 14px",borderRadius:8,cursor:"pointer",border:`1px solid ${isAdmin?C.redBorder:C.border}`,background:isAdmin?C.redBg:"transparent",color:isAdmin?C.red:C.muted}}>{isAdmin?"Admin Mode ON (click to disable)":"Admin Mode"}</button></div>{view==="dashboard"&&<Dashboard {...vp}/>}{view==="inventory"&&<Inventory {...vp} onScopeChange={setScopeFor} onDelete={onDelete} isAdmin={isAdmin} onAnalyzeClick={(id)=>{setAnalyzeRegId(id);setView("analyze");}}/>}{view==="analyze"&&<Analyze {...vp} onScopeChange={setScopeFor} onAnalysisComplete={onAnalysisComplete} initialRegId={analyzeRegId} onAnalyzeDone={()=>setAnalyzeRegId(null)}/>}{view==="controls"&&<Controls {...vp} isAdmin={isAdmin} onDeleteControl={onDeleteControl} deletedControlIds={deletedControlIds}/>}{view==="timeline"&&<Timeline {...vp}/>}{view==="calendar"&&<Calendar {...vp}/>}</div></main></div>);
}
