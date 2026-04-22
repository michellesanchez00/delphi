import { useState, useEffect, useCallback, useMemo } from "react";
import { REGULATIONS, CONTROLS_LIBRARY, DOMAINS, REGIONS, MARSH_ENTITIES } from "./regulatoryData";

const PROXY_URL = "https://delphi-proxy.vercel.app/api/claude";
const SESSION_KEY = "delphi_auth";
const SCOPE_KEY = "delphi_scope";
const ANALYSIS_KEY = "delphi_analyses";
const CUSTOM_REGS_KEY = "delphi_custom_regs";

// ── helpers ────────────────────────────────────────────────────────────────────
const formatDeadline = (iso) => {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const daysUntil = (iso) => {
  if (!iso) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  const d = new Date(iso + "T00:00:00");
  return Math.round((d - now) / 86400000);
};
const urgencyColor = (days) => {
  if (days === null) return "var(--text-muted)";
  if (days < 0) return "#ef4444";
  if (days <= 90) return "#f59e0b";
  if (days <= 180) return "#3b82f6";
  return "#10b981";
};
const regionFlag = { EU:"🇪🇺", US:"🇺🇸", UK:"🇬🇧", APAC:"🌏", Global:"🌐", Canada:"🇨🇦", LATAM:"🌎", "Middle East":"🕌", Africa:"🌍" };
const statusBadge = (s) => {
  const map = { "In Force":"green","Proposed":"amber","Repealed":"red","Amended":"blue","Pending":"gray","Analyzed":"indigo" };
  return map[s] || "gray";
};
const scopeBadge = (s) => ({ "In Scope":"green","Out of Scope":"red","Pending":"amber" }[s] || "gray");

// ── STORAGE ────────────────────────────────────────────────────────────────────
const storage = {
  get: (k, def = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ── BADGE ─────────────────────────────────────────────────────────────────────
function Badge({ color, children, small }) {
  const colors = {
    green: "bg-emerald-100 text-emerald-800 border-emerald-200",
    amber: "bg-amber-100 text-amber-800 border-amber-200",
    red: "bg-red-100 text-red-800 border-red-200",
    blue: "bg-blue-100 text-blue-800 border-blue-200",
    indigo: "bg-indigo-100 text-indigo-800 border-indigo-200",
    gray: "bg-gray-100 text-gray-700 border-gray-200",
  };
  return (
    <span className={`inline-flex items-center border font-medium rounded-full ${small ? "text-xs px-2 py-0.5" : "text-xs px-2.5 py-1"} ${colors[color] || colors.gray}`}>
      {children}
    </span>
  );
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const handle = (e) => {
    e.preventDefault();
    if (pw === "Regscan") { onLogin(); }
    else { setErr("Incorrect password."); }
  };
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-white tracking-tight mb-1">DELPHI</div>
          <div className="text-sm text-gray-400">Marsh Regulatory Intelligence Platform</div>
        </div>
        <form onSubmit={handle} className="bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Password</label>
            <input
              type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(""); }}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              placeholder="Enter access code" autoFocus
            />
            {err && <p className="text-red-400 text-xs mt-1.5">{err}</p>}
          </div>
          <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg text-sm transition">
            Access DELPHI
          </button>
        </form>
      </div>
    </div>
  );
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
const NAV = [
  { id:"dashboard", label:"Dashboard", icon:"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { id:"inventory", label:"Regulation Inventory", icon:"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { id:"analyze", label:"Analyze", icon:"M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" },
  { id:"controls", label:"Controls Library", icon:"M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  { id:"timeline", label:"Timeline", icon:"M13 10V3L4 14h7v7l9-11h-7z" },
  { id:"calendar", label:"Calendar", icon:"M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
];

function Sidebar({ active, onNav, onLogout, totalRegs, inScope }) {
  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-gray-950 border-r border-gray-800 flex flex-col z-40">
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="text-lg font-bold text-white tracking-tight">DELPHI</div>
        <div className="text-xs text-gray-500 mt-0.5">Marsh Regulatory Intelligence</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(n => (
          <button key={n.id} onClick={() => onNav(n.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition text-left ${active === n.id ? "bg-indigo-600 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"}`}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={n.icon}/></svg>
            <span className="truncate">{n.label}</span>
          </button>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-gray-800 space-y-2">
        <div className="text-xs text-gray-500 px-1">
          <div className="flex justify-between"><span>Regulations:</span><span className="text-gray-300 font-medium">{totalRegs}</span></div>
          <div className="flex justify-between mt-0.5"><span>In Scope:</span><span className="text-emerald-400 font-medium">{inScope}</span></div>
        </div>
        <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 hover:bg-gray-800 hover:text-white transition">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
          Sign out
        </button>
      </div>
    </aside>
  );
}

// ── STAT CARD ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  const c = { indigo:"border-indigo-500 bg-indigo-950/30 text-indigo-400", emerald:"border-emerald-500 bg-emerald-950/30 text-emerald-400", amber:"border-amber-500 bg-amber-950/30 text-amber-400", red:"border-red-500 bg-red-950/30 text-red-400", blue:"border-blue-500 bg-blue-950/30 text-blue-400" };
  return (
    <div className={`rounded-xl border-l-4 p-4 ${c[color] || c.indigo} bg-gray-900`}>
      <div className={`text-2xl font-bold`}>{value}</div>
      <div className="text-sm text-gray-300 mt-0.5 font-medium">{label}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({ allRegs, scopeMap, analysisMap }) {
  const byScope = useMemo(() => {
    const c = {"In Scope":0,"Out of Scope":0,"Pending":0};
    allRegs.forEach(r => { const s = scopeMap[r.id] || "Pending"; if (s in c) c[s]++; });
    return c;
  }, [allRegs, scopeMap]);
  const analyzed = useMemo(() => Object.keys(analysisMap).length, [analysisMap]);
  const upcoming = useMemo(() => allRegs.filter(r => { if (!r.deadline) return false; const d = daysUntil(r.deadline); return d !== null && d >= 0 && d <= 180; }).sort((a,b) => new Date(a.deadline) - new Date(b.deadline)).slice(0,8), [allRegs]);
  const byDomain = useMemo(() => {
    const m = {};
    allRegs.forEach(r => {
      if (!m[r.domain]) m[r.domain] = {total:0,inScope:0};
      m[r.domain].total++;
      if ((scopeMap[r.id] || "Pending") === "In Scope") m[r.domain].inScope++;
    });
    return Object.entries(m).sort((a,b) => b[1].total - a[1].total);
  }, [allRegs, scopeMap]);
  const byRegion = useMemo(() => {
    const m = {};
    allRegs.forEach(r => { if (!m[r.region]) m[r.region] = 0; m[r.region]++; });
    return Object.entries(m).sort((a,b) => b[1]-a[1]);
  }, [allRegs]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Compliance Posture Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">Global regulatory inventory overview for Marsh entities</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total Regulations" value={allRegs.length} color="indigo"/>
        <StatCard label="In Scope" value={byScope["In Scope"]} sub="Regulations applicable" color="emerald"/>
        <StatCard label="Out of Scope" value={byScope["Out of Scope"]} sub="Excluded" color="red"/>
        <StatCard label="Pending Review" value={byScope["Pending"]} sub="Awaiting determination" color="amber"/>
        <StatCard label="Analyzed" value={analyzed} sub="AI analysis complete" color="blue"/>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Domain breakdown */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Regulations by Domain</h3>
          <div className="space-y-2">
            {byDomain.map(([dom,{total,inScope}]) => (
              <div key={dom} className="flex items-center gap-3">
                <div className="text-xs text-gray-400 w-36 truncate flex-shrink-0">{dom}</div>
                <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{width:`${(total/allRegs.length)*100}%`}}/>
                </div>
                <div className="text-xs text-gray-300 w-6 text-right">{total}</div>
                <div className="text-xs text-emerald-400 w-14 text-right">{inScope} in scope</div>
              </div>
            ))}
          </div>
        </div>
        {/* Upcoming deadlines */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Upcoming Deadlines (180 days)</h3>
          {upcoming.length === 0 ? (
            <p className="text-xs text-gray-500 py-4 text-center">No deadlines in the next 180 days</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map(r => {
                const days = daysUntil(r.deadline);
                return (
                  <div key={r.id} className="flex items-start gap-3 py-1.5 border-b border-gray-800 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-white truncate">{r.name}</div>
                      <div className="text-xs text-gray-500">{r.region} · {r.domain}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-semibold" style={{color: urgencyColor(days)}}>{formatDeadline(r.deadline)}</div>
                      <div className="text-xs text-gray-500">{days === 0 ? "Today" : `${days}d`}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {/* By region */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Regulations by Region</h3>
          <div className="grid grid-cols-2 gap-2">
            {byRegion.map(([reg,cnt]) => (
              <div key={reg} className="flex items-center gap-2 text-xs">
                <span className="text-base">{regionFlag[reg] || "🌐"}</span>
                <span className="text-gray-400 flex-1">{reg}</span>
                <span className="text-gray-200 font-medium">{cnt}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Scope pie */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Scope Determination Status</h3>
          <div className="space-y-3 mt-4">
            {Object.entries(byScope).map(([s,cnt]) => {
              const pct = allRegs.length ? ((cnt/allRegs.length)*100).toFixed(0) : 0;
              const col = {["In Scope"]:"bg-emerald-500",["Out of Scope"]:"bg-red-500",Pending:"bg-amber-500"}[s];
              return (
                <div key={s}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{s}</span>
                    <span className="text-gray-200">{cnt} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${col}`} style={{width:`${pct}%`}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── INVENTORY ─────────────────────────────────────────────────────────────────
function Inventory({ allRegs, scopeMap, onScopeChange, analysisMap, onDelete, isAdmin }) {
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("All");
  const [region, setRegion] = useState("All");
  const [scope, setScope] = useState("All");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const PER_PAGE = 20;

  const filtered = useMemo(() => {
    let list = [...allRegs];
    if (search) { const q = search.toLowerCase(); list = list.filter(r => r.name.toLowerCase().includes(q) || r.reference.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || r.tags?.some(t => t.toLowerCase().includes(q))); }
    if (domain !== "All") list = list.filter(r => r.domain === domain);
    if (region !== "All") list = list.filter(r => r.region === region);
    if (scope !== "All") list = list.filter(r => (scopeMap[r.id] || "Pending") === scope);
    list.sort((a,b) => {
      let va = sortField === "scope" ? (scopeMap[a.id]||"Pending") : sortField === "status" ? (analysisMap[a.id] ? "Analyzed" : a.status) : a[sortField] || "";
      let vb = sortField === "scope" ? (scopeMap[b.id]||"Pending") : sortField === "status" ? (analysisMap[b.id] ? "Analyzed" : b.status) : b[sortField] || "";
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return list;
  }, [allRegs, search, domain, region, scope, scopeMap, analysisMap, sortField, sortDir]);

  const pages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);

  const sortBy = (f) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("asc"); } setPage(1); };
  const Th = ({f,children}) => (
    <th onClick={() => sortBy(f)} className="px-3 py-2.5 text-left text-xs font-medium text-gray-400 cursor-pointer hover:text-white select-none whitespace-nowrap">
      <span className="flex items-center gap-1">{children}{sortField===f && <span className="text-indigo-400">{sortDir==="asc"?"↑":"↓"}</span>}</span>
    </th>
  );

  const confirmDelete = (id) => {
    if (deleteConfirm === id) { onDelete(id); setDeleteConfirm(null); }
    else { setDeleteConfirm(id); setTimeout(() => setDeleteConfirm(null), 3000); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Regulation Inventory</h1>
          <p className="text-sm text-gray-400">{filtered.length} regulations {filtered.length !== allRegs.length && `(${allRegs.length} total)`}</p>
        </div>
        {isAdmin && <Badge color="indigo">Admin Mode</Badge>}
      </div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search regulations, references, tags…"
          className="flex-1 min-w-56 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-indigo-500"/>
        <select value={domain} onChange={e => { setDomain(e.target.value); setPage(1); }} className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded-lg px-3 py-2 outline-none">
          <option>All</option>{DOMAINS.map(d => <option key={d}>{d}</option>)}
        </select>
        <select value={region} onChange={e => { setRegion(e.target.value); setPage(1); }} className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded-lg px-3 py-2 outline-none">
          <option>All</option>{["EU","US","UK","APAC","Global","Canada","LATAM","Middle East","Africa"].map(r => <option key={r}>{r}</option>)}
        </select>
        <select value={scope} onChange={e => { setScope(e.target.value); setPage(1); }} className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded-lg px-3 py-2 outline-none">
          <option>All</option><option>In Scope</option><option>Out of Scope</option><option>Pending</option>
        </select>
      </div>
      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/60 border-b border-gray-700">
              <tr>
                <Th f="id">ID</Th>
                <Th f="name">Regulation</Th>
                <Th f="region">Region</Th>
                <Th f="domain">Domain</Th>
                <Th f="status">Status</Th>
                <Th f="scope">Scope</Th>
                <th className="px-3 py-2.5 text-left text-xs text-gray-400">Deadline</th>
                <th className="px-3 py-2.5 text-left text-xs text-gray-400">Scope / Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {paged.map(r => {
                const regStatus = analysisMap[r.id] ? "Analyzed" : r.status;
                const currentScope = scopeMap[r.id] || "Pending";
                const days = daysUntil(r.deadline);
                return (
                  <tr key={r.id} className="hover:bg-gray-800/40 transition">
                    <td className="px-3 py-2.5 text-xs text-gray-500 font-mono">{r.id}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-white text-sm leading-tight max-w-xs">{r.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{r.reference}</div>
                    </td>
                    <td className="px-3 py-2.5 text-sm">{regionFlag[r.region]} {r.region}</td>
                    <td className="px-3 py-2.5"><Badge color="gray" small>{r.domain}</Badge></td>
                    <td className="px-3 py-2.5"><Badge color={statusBadge(regStatus)} small>{regStatus}</Badge></td>
                    <td className="px-3 py-2.5"><Badge color={scopeBadge(currentScope)} small>{currentScope}</Badge></td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                      {r.deadline ? <span style={{color:urgencyColor(days)}}>{formatDeadline(r.deadline)}{days !== null && days >= 0 && <span className="ml-1 text-gray-500">({days}d)</span>}</span> : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <select value={currentScope}
                          onChange={e => onScopeChange(r.id, e.target.value)}
                          className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded px-2 py-1 outline-none">
                          <option>Pending</option><option>In Scope</option><option>Out of Scope</option>
                        </select>
                        {isAdmin && (
                          <button onClick={() => confirmDelete(r.id)}
                            className={`text-xs px-2 py-1 rounded transition ${deleteConfirm===r.id ? "bg-red-600 text-white" : "bg-gray-800 text-gray-500 hover:text-red-400 hover:bg-gray-700"}`}>
                            {deleteConfirm===r.id ? "Confirm" : "✕"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paged.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-gray-500 text-sm">No regulations match your filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <span className="text-xs text-gray-500">Page {page} of {pages} · {filtered.length} results</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="px-2.5 py-1 rounded text-xs bg-gray-800 text-gray-300 disabled:opacity-40 hover:bg-gray-700">←</button>
              {Array.from({length:Math.min(5,pages)}, (_,i) => { const pg = Math.max(1,Math.min(pages-4, page-2))+i; return (
                <button key={pg} onClick={() => setPage(pg)} className={`px-2.5 py-1 rounded text-xs ${pg===page?"bg-indigo-600 text-white":"bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>{pg}</button>
              ); })}
              <button onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page===pages} className="px-2.5 py-1 rounded text-xs bg-gray-800 text-gray-300 disabled:opacity-40 hover:bg-gray-700">→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ANALYZE ────────────────────────────────────────────────────────────────────
function Analyze({ allRegs, scopeMap, onScopeChange, analysisMap, onAnalysisComplete }) {
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const reg = allRegs.find(r => r.id === selected);
  const existingAnalysis = selected ? analysisMap[selected] : null;

  useEffect(() => {
    if (existingAnalysis) setResult(existingAnalysis);
    else setResult(null);
  }, [selected, existingAnalysis]);

  const inScopeIds = useMemo(() => new Set(Object.entries(scopeMap).filter(([,v])=>v==="In Scope").map(([k])=>k)), [scopeMap]);
  const existingControlIds = useMemo(() => {
    const ctrlSet = new Set();
    CONTROLS_LIBRARY.forEach(c => { if (c.regulations.some(rId => inScopeIds.has(rId) && rId !== selected)) ctrlSet.add(c.controlId); });
    return ctrlSet;
  }, [inScopeIds, selected]);

  const analyze = async () => {
    if (!reg) return;
    setLoading(true); setError(""); setResult(null);
    const allExistingControls = CONTROLS_LIBRARY
      .filter(c => c.regulations.some(rId => inScopeIds.has(rId) && rId !== selected))
      .map(c => `${c.controlId}: ${c.title}`)
      .join("\n");
    const regControls = CONTROLS_LIBRARY.filter(c => c.regulations.includes(selected));
    const prompt = `You are a senior regulatory compliance expert for Marsh McLennan.

Analyze this regulation for Marsh:
Name: ${reg.name}
Reference: ${reg.reference}
Region: ${reg.region}
Domain: ${reg.domain}
Status: ${reg.status}
Effective Date: ${reg.effectiveDate}
Deadline: ${reg.deadline || "N/A"}
Summary: ${reg.summary}
Applicable Marsh entities: ${reg.marshEntities?.join(", ")}

Existing controls already in place (from other In Scope regulations):
${allExistingControls || "None yet"}

Controls mapped to this regulation in the library:
${regControls.map(c=>`${c.controlId}: ${c.title}`).join("\n") || "None mapped yet"}

Provide a JSON response (no markdown fences) with:
{
  "executiveSummary": "2-3 sentence summary of the regulation's impact on Marsh",
  "businessRisk": "High|Medium|Low",
  "riskRationale": "1-2 sentences explaining the risk rating",
  "keyObligations": ["obligation 1", "obligation 2", "obligation 3", "obligation 4", "obligation 5"],
  "applicableEntities": ["entity1", "entity2"],
  "newControls": [
    {"title": "control title", "description": "what Marsh must do", "priority": "Immediate|Short-term|Ongoing", "isNew": true}
  ],
  "gapAnalysis": "Assessment of the compliance gap and work remaining",
  "deadlineRisk": "Commentary on timeline pressure if applicable",
  "recommendedActions": ["action 1", "action 2", "action 3"]
}
newControls should highlight ONLY controls that are not already covered by existing controls.`;
    try {
      const res = await fetch(PROXY_URL, { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-opus-4-5", max_tokens:2000, messages:[{role:"user",content:prompt}] })
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const text = data.content?.[0]?.text || data.content || "";
      let parsed;
      try { parsed = JSON.parse(text); }
      catch { const m = text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); else throw new Error("Could not parse response"); }
      onAnalysisComplete(selected, parsed);
      setResult(parsed);
    } catch(e) { setError(e.message || "Analysis failed"); }
    finally { setLoading(false); }
  };

  const riskColor = (r) => ({High:"text-red-400",Medium:"text-amber-400",Low:"text-emerald-400"}[r]||"text-gray-400");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Analyze Regulation</h1>
        <p className="text-sm text-gray-400 mt-0.5">AI-powered compliance analysis with gap assessment</p>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider block mb-2">Select Regulation</label>
          <select value={selected} onChange={e => setSelected(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-500">
            <option value="">— Select a regulation to analyze —</option>
            {allRegs.map(r => <option key={r.id} value={r.id}>{r.id}: {r.name}</option>)}
          </select>
        </div>
        {reg && (
          <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-white">{reg.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{reg.reference} · {reg.region} · {reg.domain}</div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Badge color={statusBadge(analysisMap[selected] ? "Analyzed" : reg.status)} small>{analysisMap[selected] ? "Analyzed" : reg.status}</Badge>
                <Badge color={scopeBadge(scopeMap[selected]||"Pending")} small>{scopeMap[selected]||"Pending"}</Badge>
              </div>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">{reg.summary}</p>
            {reg.deadline && <div className="text-xs" style={{color:urgencyColor(daysUntil(reg.deadline))}}>⏱ Deadline: {formatDeadline(reg.deadline)} ({daysUntil(reg.deadline)} days)</div>}
            <div className="flex items-center gap-3 pt-1">
              <label className="text-xs text-gray-400">Scope:</label>
              <select value={scopeMap[selected]||"Pending"} onChange={e => onScopeChange(selected, e.target.value)}
                className="text-xs bg-gray-700 border border-gray-600 text-gray-200 rounded px-2 py-1 outline-none">
                <option>Pending</option><option>In Scope</option><option>Out of Scope</option>
              </select>
            </div>
          </div>
        )}
        <button onClick={analyze} disabled={!selected || loading}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition">
          {loading ? (<><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Analyzing…</>) : "Run Analysis"}
        </button>
        {error && <div className="bg-red-950/50 border border-red-800 text-red-300 text-sm rounded-lg p-3">{error}</div>}
      </div>
      {result && (
        <div className="space-y-4">
          {/* Executive summary */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white">Executive Summary</h3>
              <span className={`text-sm font-bold ${riskColor(result.businessRisk)}`}>
                {result.businessRisk} Risk
              </span>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{result.executiveSummary}</p>
            {result.riskRationale && <p className="text-xs text-gray-500 mt-2 italic">{result.riskRationale}</p>}
          </div>
          {/* Key obligations */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="font-semibold text-white mb-3">Key Obligations</h3>
            <ul className="space-y-2">
              {result.keyObligations?.map((o,i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <span className="text-indigo-400 mt-0.5 flex-shrink-0">→</span>{o}
                </li>
              ))}
            </ul>
          </div>
          {/* Gap analysis */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="font-semibold text-white mb-2">Gap Analysis</h3>
            <p className="text-sm text-gray-300 leading-relaxed">{result.gapAnalysis}</p>
          </div>
          {/* New controls — highlighted */}
          {result.newControls?.length > 0 && (
            <div className="bg-indigo-950/30 border border-indigo-700/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                <h3 className="font-semibold text-indigo-300">New Controls Required ({result.newControls.length})</h3>
                <span className="text-xs text-indigo-500 ml-1">— not covered by existing in-scope regulations</span>
              </div>
              <div className="space-y-3">
                {result.newControls.map((c,i) => (
                  <div key={i} className="bg-indigo-900/20 border border-indigo-800/40 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-medium text-indigo-200 text-sm">{c.title}</span>
                      <Badge color={c.priority==="Immediate"?"red":c.priority==="Short-term"?"amber":"blue"} small>{c.priority}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">{c.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Recommended actions */}
          {result.recommendedActions?.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="font-semibold text-white mb-3">Recommended Actions</h3>
              <ol className="space-y-2">
                {result.recommendedActions.map((a,i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-xs text-gray-500 bg-gray-800 rounded px-1.5 py-0.5 mt-0.5 flex-shrink-0 font-mono">{i+1}</span>{a}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {result.deadlineRisk && (
            <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-4">
              <div className="flex items-start gap-2"><span className="text-amber-400">⚠</span><p className="text-sm text-amber-200">{result.deadlineRisk}</p></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── CONTROLS LIBRARY ──────────────────────────────────────────────────────────
function Controls({ allRegs, scopeMap, analysisMap }) {
  const [cat, setCat] = useState("All");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const inScopeIds = useMemo(() => new Set(Object.entries(scopeMap).filter(([,v])=>v==="In Scope").map(([k])=>k)), [scopeMap]);
  const categories = useMemo(() => ["All", ...new Set(CONTROLS_LIBRARY.map(c => c.category))], []);

  const controls = useMemo(() => {
    let list = CONTROLS_LIBRARY;
    if (!showAll) list = list.filter(c => c.regulations.some(rId => inScopeIds.has(rId)));
    if (cat !== "All") list = list.filter(c => c.category === cat);
    if (search) { const q = search.toLowerCase(); list = list.filter(c => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.owner.toLowerCase().includes(q)); }
    return list;
  }, [inScopeIds, cat, search, showAll]);

  const regName = (id) => allRegs.find(r => r.id === id)?.name || id;
  const isInScope = (id) => inScopeIds.has(id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Controls Library</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {showAll ? `All controls (${controls.length})` : `Controls for In Scope regulations (${controls.length})`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search controls…"
          className="flex-1 min-w-48 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-indigo-500"/>
        <select value={cat} onChange={e => setCat(e.target.value)} className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded-lg px-3 py-2 outline-none">
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="accent-indigo-500"/>
          Show all controls
        </label>
      </div>
      {inScopeIds.size === 0 && !showAll && (
        <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-6 text-center">
          <p className="text-amber-300 text-sm">No regulations are marked In Scope yet.</p>
          <p className="text-amber-500 text-xs mt-1">Mark regulations as In Scope in the Inventory tab to see required controls.</p>
        </div>
      )}
      <div className="grid gap-3">
        {controls.map(ctrl => (
          <div key={ctrl.controlId} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-mono text-gray-500">{ctrl.controlId}</span>
                  <Badge color={ctrl.priority==="Immediate"?"red":ctrl.priority==="Short-term"?"amber":"blue"} small>{ctrl.priority}</Badge>
                </div>
                <div className="font-semibold text-white">{ctrl.title}</div>
              </div>
              <Badge color="gray" small>{ctrl.category}</Badge>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed mb-3">{ctrl.description}</p>
            <div className="text-xs text-gray-500 mb-2"><span className="text-gray-400 font-medium">Owner:</span> {ctrl.owner}</div>
            <div className="text-xs text-gray-500 mb-3"><span className="text-gray-400 font-medium">Testing:</span> {ctrl.testingCriteria}</div>
            {/* Source regulations */}
            <div>
              <div className="text-xs text-gray-500 font-medium mb-1.5">Required by:</div>
              <div className="flex flex-wrap gap-1">
                {ctrl.regulations.map(rId => (
                  <span key={rId} className={`text-xs px-2 py-0.5 rounded-full border ${isInScope(rId) ? "border-emerald-700 bg-emerald-950/40 text-emerald-300" : "border-gray-700 bg-gray-800 text-gray-500"}`}>
                    {rId} · {allRegs.find(r=>r.id===rId)?.name?.substring(0,30) || rId}{isInScope(rId) && " ✓"}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
        {controls.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">No controls match your filters</div>
        )}
      </div>
    </div>
  );
}

// ── TIMELINE ──────────────────────────────────────────────────────────────────
function Timeline({ allRegs, scopeMap }) {
  const [filter, setFilter] = useState("All");
  const withDeadlines = useMemo(() => {
    let list = allRegs.filter(r => r.deadline);
    if (filter === "In Scope") list = list.filter(r => (scopeMap[r.id]||"Pending") === "In Scope");
    if (filter === "Upcoming") list = list.filter(r => daysUntil(r.deadline) !== null && daysUntil(r.deadline) >= 0);
    return list.sort((a,b) => new Date(a.deadline) - new Date(b.deadline));
  }, [allRegs, scopeMap, filter]);

  const grouped = useMemo(() => {
    const groups = {};
    withDeadlines.forEach(r => {
      const yr = r.deadline.substring(0,4);
      if (!groups[yr]) groups[yr] = [];
      groups[yr].push(r);
    });
    return groups;
  }, [withDeadlines]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Regulatory Timeline</h1>
          <p className="text-sm text-gray-400">{withDeadlines.length} regulations with deadlines</p>
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded-lg px-3 py-2 outline-none">
          <option>All</option><option>In Scope</option><option>Upcoming</option>
        </select>
      </div>
      {Object.keys(grouped).length === 0 && (
        <div className="text-center py-16 text-gray-500 text-sm">No regulations with deadlines match your filter</div>
      )}
      <div className="space-y-8">
        {Object.entries(grouped).sort().map(([year, regs]) => (
          <div key={year}>
            <div className="flex items-center gap-3 mb-4">
              <div className="text-lg font-bold text-indigo-400">{year}</div>
              <div className="h-px flex-1 bg-gray-800"/>
              <span className="text-xs text-gray-500">{regs.length} deadline{regs.length!==1?"s":""}</span>
            </div>
            <div className="relative pl-6 space-y-3">
              <div className="absolute left-2 top-2 bottom-2 w-px bg-gray-800"/>
              {regs.map(r => {
                const days = daysUntil(r.deadline);
                const currentScope = scopeMap[r.id] || "Pending";
                return (
                  <div key={r.id} className="relative flex items-start gap-4">
                    <div className="absolute -left-4 w-3 h-3 rounded-full border-2 mt-1" style={{borderColor: urgencyColor(days), backgroundColor: days !== null && days < 0 ? urgencyColor(days) : "transparent"}}/>
                    <div className="flex-1 bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-gray-700 transition">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white text-sm leading-tight">{r.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{r.reference} · {r.region} · {r.domain}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <div className="font-semibold text-sm" style={{color:urgencyColor(days)}}>{formatDeadline(r.deadline)}</div>
                          {days !== null && <div className="text-xs text-gray-500">{days < 0 ? `${Math.abs(days)}d past` : days === 0 ? "Today" : `${days}d`}</div>}
                          <Badge color={scopeBadge(currentScope)} small>{currentScope}</Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CALENDAR ──────────────────────────────────────────────────────────────────
function Calendar({ allRegs, scopeMap }) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(null);
  const [filter, setFilter] = useState("All");

  const withDeadlines = useMemo(() => {
    let list = allRegs.filter(r => r.deadline);
    if (filter === "In Scope") list = list.filter(r => (scopeMap[r.id]||"Pending") === "In Scope");
    return list;
  }, [allRegs, scopeMap, filter]);

  const month = viewDate.getMonth();
  const year = viewDate.getFullYear();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();

  const regsByDay = useMemo(() => {
    const m = {};
    withDeadlines.forEach(r => {
      const d = new Date(r.deadline + "T00:00:00");
      if (d.getMonth() === month && d.getFullYear() === year) {
        const day = d.getDate();
        if (!m[day]) m[day] = [];
        m[day].push(r);
      }
    });
    return m;
  }, [withDeadlines, month, year]);

  const selectedRegs = selectedDay ? regsByDay[selectedDay] || [] : [];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Regulatory Calendar</h1>
          <p className="text-sm text-gray-400">{withDeadlines.filter(r => { const d = new Date(r.deadline+"T00:00:00"); return d.getMonth()===month&&d.getFullYear()===year; }).length} deadlines in {months[month]} {year}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value)} className="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded-lg px-3 py-2 outline-none">
            <option>All</option><option>In Scope</option>
          </select>
          <button onClick={() => setViewDate(new Date(year, month-1, 1))} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition">←</button>
          <span className="text-sm font-semibold text-white w-36 text-center">{months[month]} {year}</span>
          <button onClick={() => setViewDate(new Date(year, month+1, 1))} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition">→</button>
          <button onClick={() => { setViewDate(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(null); }} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 rounded-lg transition">Today</button>
        </div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-800">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
            <div key={d} className="py-2 text-center text-xs font-medium text-gray-500">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({length: firstDay}).map((_,i) => <div key={`empty-${i}`} className="min-h-16 border-r border-b border-gray-800 bg-gray-950/30"/>)}
          {Array.from({length: daysInMonth}).map((_,i) => {
            const day = i+1;
            const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            const hasRegs = regsByDay[day]?.length > 0;
            const isSelected = selectedDay === day;
            const regsHere = regsByDay[day] || [];
            const minDays = regsHere.length > 0 ? Math.min(...regsHere.map(r => daysUntil(r.deadline))) : null;
            return (
              <div key={day} onClick={() => setSelectedDay(isSelected ? null : day)}
                className={`min-h-16 border-r border-b border-gray-800 p-1.5 cursor-pointer transition ${isSelected ? "bg-indigo-950/50" : hasRegs ? "hover:bg-gray-800/50" : "hover:bg-gray-800/20"}`}>
                <div className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${isToday ? "bg-indigo-500 text-white" : "text-gray-400"}`}>{day}</div>
                {regsHere.slice(0,2).map(r => (
                  <div key={r.id} className="text-xs px-1 py-0.5 rounded truncate mb-0.5" style={{backgroundColor: urgencyColor(daysUntil(r.deadline))+"22", color: urgencyColor(daysUntil(r.deadline))}}>
                    {r.name.substring(0,18)}…
                  </div>
                ))}
                {regsHere.length > 2 && <div className="text-xs text-gray-500">+{regsHere.length-2} more</div>}
              </div>
            );
          })}
        </div>
      </div>
      {selectedDay && selectedRegs.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="font-semibold text-white mb-3">{months[month]} {selectedDay}, {year} — {selectedRegs.length} deadline{selectedRegs.length!==1?"s":""}</h3>
          <div className="space-y-2">
            {selectedRegs.map(r => (
              <div key={r.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-800 last:border-0">
                <div>
                  <div className="font-medium text-white text-sm">{r.name}</div>
                  <div className="text-xs text-gray-500">{r.reference} · {r.region} · {r.domain}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge color={scopeBadge(scopeMap[r.id]||"Pending")} small>{scopeMap[r.id]||"Pending"}</Badge>
                  <div className="text-xs" style={{color:urgencyColor(daysUntil(r.deadline))}}>
                    {daysUntil(r.deadline) === 0 ? "Today" : daysUntil(r.deadline) < 0 ? `${Math.abs(daysUntil(r.deadline))}d past` : `${daysUntil(r.deadline)}d remaining`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(() => storage.get(SESSION_KEY, false));
  const [view, setView] = useState("dashboard");
  const [scopeMap, setScopeMap] = useState(() => storage.get(SCOPE_KEY, {}));
  const [analysisMap, setAnalysisMap] = useState(() => storage.get(ANALYSIS_KEY, {}));
  const [deletedIds, setDeletedIds] = useState(() => storage.get("delphi_deleted", []));
  const [isAdmin, setIsAdmin] = useState(() => storage.get("delphi_admin", false));
  const [showAdminToggle, setShowAdminToggle] = useState(false);

  // Merge base regulations with any custom additions, minus deleted
  const allRegs = useMemo(() => {
    const deletedSet = new Set(deletedIds);
    return REGULATIONS.filter(r => !deletedSet.has(r.id));
  }, [deletedIds]);

  const inScopeCount = useMemo(() => Object.values(scopeMap).filter(v => v === "In Scope").length, [scopeMap]);

  const login = () => { setAuthed(true); storage.set(SESSION_KEY, true); };
  const logout = () => { setAuthed(false); storage.set(SESSION_KEY, false); };

  const setScopeFor = useCallback((id, val) => {
    setScopeMap(prev => { const n = {...prev, [id]: val}; storage.set(SCOPE_KEY, n); return n; });
  }, []);

  const onAnalysisComplete = useCallback((id, data) => {
    setAnalysisMap(prev => { const n = {...prev, [id]: data}; storage.set(ANALYSIS_KEY, n); return n; });
  }, []);

  const onDelete = useCallback((id) => {
    setDeletedIds(prev => { const n = [...prev, id]; storage.set("delphi_deleted", n); return n; });
  }, []);

  if (!authed) return <Login onLogin={login}/>;

  const viewProps = { allRegs, scopeMap, analysisMap };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Sidebar active={view} onNav={setView} onLogout={logout} totalRegs={allRegs.length} inScope={inScopeCount}/>
      <main className="ml-60 min-h-screen">
        <div className="max-w-6xl mx-auto p-6">
          {/* Admin mode toggle */}
          <div className="flex justify-end mb-4">
            <button onClick={() => { const v = !isAdmin; setIsAdmin(v); storage.set("delphi_admin",v); }}
              className={`text-xs px-3 py-1.5 rounded-lg border transition ${isAdmin ? "border-red-700 bg-red-950/40 text-red-300" : "border-gray-700 bg-gray-800 text-gray-500 hover:text-gray-300"}`}>
              {isAdmin ? "🔐 Admin Mode ON" : "Admin Mode"}
            </button>
          </div>
          {view === "dashboard" && <Dashboard {...viewProps}/>}
          {view === "inventory" && <Inventory {...viewProps} onScopeChange={setScopeFor} onDelete={onDelete} isAdmin={isAdmin}/>}
          {view === "analyze" && <Analyze {...viewProps} onScopeChange={setScopeFor} onAnalysisComplete={onAnalysisComplete}/>}
          {view === "controls" && <Controls {...viewProps}/>}
          {view === "timeline" && <Timeline {...viewProps}/>}
          {view === "calendar" && <Calendar {...viewProps}/>}
        </div>
      </main>
    </div>
  );
}
