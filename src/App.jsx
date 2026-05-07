import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { REGULATIONS, CONTROLS_LIBRARY, DOMAINS, REGIONS, MARSH_ENTITIES } from "./regulatoryData";

const PROXY_URL = "https://delphi-proxy.vercel.app/api/claude";
const SESSION_KEY = "delphi_auth";
const SCOPE_KEY = "delphi_scope";
const ANALYSIS_KEY = "delphi_analyses";
const JSONBIN_KEY = "$2a$10$nY52ddUvcB.nOkkqL2Rz5.FLU7LeIE4hyH7O1tOJ7SoHvU7di65Xi";
const JSONBIN_BIN = "69f39261856a6821898fd552";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN}`;
const JH = { "Content-Type": "application/json", "X-Master-Key": JSONBIN_KEY };

const storage = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

async function jbGet() {
  try { const r = await fetch(JSONBIN_URL + "/latest", { headers: JH, cache: "no-store" }); const d = await r.json(); return d.record || {}; } catch { return {}; }
}
async function jbSet(key, value) {
  try { const rec = await jbGet(); const up = { ...rec, [key]: value }; await fetch(JSONBIN_URL, { method: "PUT", headers: JH, body: JSON.stringify(up) }); } catch {}
}

const C = {
  bg: "#080a0f", panel: "#0f1117", panel2: "#161b26", border: "#1c2333",
  text: "#e8edf5", muted: "#5a6880", accent: "#6366f1", accentHover: "#818cf8",
  green: "#10b981", greenBg: "rgba(16,185,129,0.1)", greenBorder: "rgba(16,185,129,0.25)",
  red: "#ef4444", redBg: "rgba(239,68,68,0.1)", redBorder: "rgba(239,68,68,0.25)",
  amber: "#f59e0b", amberBg: "rgba(245,158,11,0.1)", amberBorder: "rgba(245,158,11,0.25)",
  blue: "#3b82f6", blueBg: "rgba(59,130,246,0.1)", blueBorder: "rgba(59,130,246,0.25)",
  indigo: "#6366f1", indigoBg: "rgba(99,102,241,0.1)", indigoBorder: "rgba(99,102,241,0.25)",
  purple: "#a855f7", purpleBg: "rgba(168,85,247,0.1)", purpleBorder: "rgba(168,85,247,0.25)",
};

const formatDeadline = (iso) => { if (!iso) return null; return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
const daysUntil = (iso) => { if (!iso) return null; const n = new Date(); n.setHours(0, 0, 0, 0); return Math.round((new Date(iso + "T00:00:00") - n) / 86400000); };
const urgencyColor = (d) => { if (d === null) return C.muted; if (d < 0) return C.red; if (d <= 90) return C.amber; if (d <= 180) return C.blue; return C.green; };
const scopeStyle = (s) => ({ "In Scope": { bg: C.greenBg, border: C.greenBorder, color: C.green }, "Out of Scope": { bg: C.redBg, border: C.redBorder, color: C.red }, Pending: { bg: C.amberBg, border: C.amberBorder, color: C.amber } }[s] || { bg: "rgba(90,104,128,0.1)", border: "rgba(90,104,128,0.3)", color: C.muted });
const statusStyle = (s) => ({ "In Force": { bg: C.greenBg, border: C.greenBorder, color: C.green }, Proposed: { bg: C.amberBg, border: C.amberBorder, color: C.amber }, Analyzed: { bg: C.indigoBg, border: C.indigoBorder, color: C.indigo }, Repealed: { bg: C.redBg, border: C.redBorder, color: C.red } }[s] || { bg: "rgba(90,104,128,0.1)", border: "rgba(90,104,128,0.3)", color: C.muted });
const riskColor = r => ({ High: C.red, Medium: C.amber, Low: C.green }[r] || C.muted);

function Badge({ text, style: s = {} }) {
  return (<span style={{ display: "inline-flex", alignItems: "center", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20, border: "1px solid", backgroundColor: s.bg || "rgba(90,104,128,0.1)", borderColor: s.border || "rgba(90,104,128,0.3)", color: s.color || C.muted, whiteSpace: "nowrap" }}>{text}</span>);
}

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "⊞" },
  { id: "inventory", label: "Regulation Inventory", icon: "≡" },
  { id: "analyze", label: "Analyze", icon: "⚡" },
  { id: "controls", label: "Controls Library", icon: "✓" },
  { id: "timeline", label: "Timeline", icon: "→" },
  { id: "calendar", label: "Calendar", icon: "▦" },
];

const G = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#080a0f;color:#e8edf5;font-family:'Inter',system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased;}
input,select,button,textarea{font-family:inherit;font-size:14px;}
::-webkit-scrollbar{width:6px;height:6px;}
::-webkit-scrollbar-thumb{background:#1c2333;border-radius:6px;}
::-webkit-scrollbar-track{background:transparent;}
@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 0.8s linear infinite;}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.fadeIn{animation:fadeIn 0.25s ease}
table{border-collapse:collapse;width:100%;}
tr:hover td{background:rgba(255,255,255,0.015);}
`;

function Login({ onLogin }) {
  const [pw, setPw] = useState(""); const [err, setErr] = useState("");
  const go = () => pw === "Regscan" ? onLogin() : setErr("Incorrect password.");
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{G}</style>
      <div style={{ width: "100%", maxWidth: 520 }}>
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <div style={{ fontSize: 48, fontWeight: 900, color: C.text, letterSpacing: -2, marginBottom: 12, lineHeight: 1 }}>
            <span style={{ color: C.accent }}>D</span>ELPHI
          </div>
          <div style={{ fontSize: 24, color: C.muted, fontWeight: 500, lineHeight: 1.35 }}>Document Extraction for Legal/Policy<br/>Harmonization &amp; Implementation</div>
        </div>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 36 }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 11, color: C.muted, marginBottom: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Access Code</label>
            <input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && go()} style={{ width: "100%", background: C.panel2, border: `1px solid ${err ? C.red : C.border}`, color: C.text, borderRadius: 10, padding: "12px 16px", fontSize: 15, outline: "none", transition: "border-color 0.2s" }} placeholder="Enter access code" autoFocus />
            {err && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
          </div>
          <button onClick={go} style={{ width: "100%", background: C.accent, border: "none", color: "#fff", fontWeight: 700, padding: "13px", borderRadius: 10, fontSize: 15, cursor: "pointer", letterSpacing: 0.3 }}>Access DELPHI</button>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ active, onNav, onLogout, totalRegs, inScope }) {
  return (
    <div style={{ position: "fixed", inset: "0 auto 0 0", width: 248, background: C.panel, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", zIndex: 40, overflowY: "auto" }}>
      <div style={{ padding: "24px 20px 20px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: C.text, letterSpacing: -0.5 }}>
          <span style={{ color: C.accent }}>D</span>ELPHI
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>Document Extraction for Legal/<br/>Policy Harmonization &amp; Implementation</div>
      </div>
      <nav style={{ flex: 1, padding: "14px 10px" }}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => onNav(n.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 14, fontWeight: active === n.id ? 600 : 500, textAlign: "left", marginBottom: 3, background: active === n.id ? C.accent : "transparent", color: active === n.id ? "#fff" : C.muted, transition: "all 0.15s" }}>
            <span style={{ fontSize: 15, width: 20, textAlign: "center", flexShrink: 0 }}>{n.icon}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.label}</span>
          </button>
        ))}
      </nav>
      <div style={{ padding: "14px 18px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13, color: C.muted }}>
          <span>Regulations</span><span style={{ color: C.text, fontWeight: 600 }}>{totalRegs}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, fontSize: 13, color: C.muted }}>
          <span>In Scope</span><span style={{ color: C.green, fontWeight: 600 }}>{inScope}</span>
        </div>
        <button onClick={onLogout} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 13, cursor: "pointer" }}>Sign out</button>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  const col = { indigo: C.indigo, emerald: C.green, amber: C.amber, red: C.red, blue: C.blue }[color] || C.indigo;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderTop: `2px solid ${col}`, borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ fontSize: 30, fontWeight: 800, color: col, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 14, color: C.text, fontWeight: 600, marginTop: 6 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── World Heatmap ──────────────────────────────────────────────────────────────
const COUNTRY_COORDS = {
  "United States": [37, -95], "Germany": [51, 10], "France": [46, 2], "United Kingdom": [54, -2],
  "Japan": [36, 138], "China": [35, 105], "India": [20, 77], "Australia": [-25, 134],
  "Canada": [56, -96], "Brazil": [-10, -55], "South Africa": [-29, 25], "Nigeria": [9, 8],
  "Singapore": [1.3, 103.8], "Hong Kong": [22.3, 114.2], "UAE": [24, 54], "Saudi Arabia": [24, 45],
  "Ireland": [53, -8], "Netherlands": [52, 5], "Switzerland": [47, 8], "Italy": [42, 12],
  "Spain": [40, -4], "Sweden": [60, 15], "Norway": [60, 8], "Denmark": [56, 10],
  "Belgium": [50, 4], "Austria": [47, 14], "Poland": [52, 20], "Czech Republic": [50, 15],
  "Mexico": [23, -102], "Argentina": [-34, -64], "Chile": [-33, -71], "Colombia": [4, -72],
  "South Korea": [37, 128], "Taiwan": [24, 121], "Indonesia": [-5, 120], "Malaysia": [3, 112],
  "Thailand": [15, 101], "Philippines": [13, 122], "New Zealand": [-41, 174],
  "Israel": [31, 35], "Turkey": [39, 35], "Egypt": [27, 30], "Kenya": [-1, 37],
  "Ghana": [8, -2], "Morocco": [32, -5], "Global": [20, 0],
};

const REGION_COUNTRIES = {
  EU: ["Germany", "France", "Ireland", "Netherlands", "Italy", "Spain", "Sweden", "Belgium", "Austria", "Poland"],
  US: ["United States"], UK: ["United Kingdom"], Global: ["Global"],
  APAC: ["Japan", "China", "Australia", "Singapore", "Hong Kong", "South Korea", "India", "Indonesia", "Malaysia"],
  Canada: ["Canada"], LATAM: ["Brazil", "Mexico", "Argentina", "Colombia", "Chile"],
  "Middle East": ["UAE", "Saudi Arabia", "Israel", "Turkey", "Egypt"],
  Africa: ["South Africa", "Nigeria", "Kenya", "Ghana", "Morocco"],
};


// Country ISO3 to name mapping for tooltip
const ISO3_TO_NAME = {
  "USA":"United States","DEU":"Germany","FRA":"France","GBR":"United Kingdom",
  "JPN":"Japan","CHN":"China","IND":"India","AUS":"Australia","CAN":"Canada",
  "BRA":"Brazil","ZAF":"South Africa","NGA":"Nigeria","SGP":"Singapore",
  "HKG":"Hong Kong","ARE":"UAE","SAU":"Saudi Arabia","IRL":"Ireland",
  "NLD":"Netherlands","CHE":"Switzerland","ITA":"Italy","ESP":"Spain",
  "SWE":"Sweden","NOR":"Norway","DNK":"Denmark","BEL":"Belgium","AUT":"Austria",
  "POL":"Poland","CZE":"Czech Republic","MEX":"Mexico","ARG":"Argentina",
  "CHL":"Chile","COL":"Colombia","KOR":"South Korea","TWN":"Taiwan",
  "IDN":"Indonesia","MYS":"Malaysia","THA":"Thailand","PHL":"Philippines",
  "NZL":"New Zealand","ISR":"Israel","TUR":"Turkey","EGY":"Egypt",
  "KEN":"Kenya","GHA":"Ghana","MAR":"Morocco",
};

function WorldHeatmap({ allRegs, scopeMap }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [tooltip, setTooltip] = useState(null);
  const [geoData, setGeoData] = useState(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(null);
  const transformRef = useRef(transform);
  useEffect(() => { transformRef.current = transform; }, [transform]);

  const countryData = useMemo(() => {
    const map = {};
    allRegs.forEach(r => {
      const countries = REGION_COUNTRIES[r.region] || [];
      countries.forEach(c => {
        if (!map[c]) map[c] = { total: 0, inScope: 0 };
        map[c].total++;
        if ((scopeMap[r.id] || "Pending") === "In Scope") map[c].inScope++;
      });
    });
    return map;
  }, [allRegs, scopeMap]);

  const maxCount = useMemo(() => Math.max(1, ...Object.values(countryData).map(d => d.total)), [countryData]);

  // Build iso3 -> data lookup
  const dataByIso3 = useMemo(() => {
    const m = {};
    Object.entries(countryData).forEach(([name, data]) => {
      // reverse lookup: find iso3 from ISO3_TO_NAME
      const iso3 = Object.entries(ISO3_TO_NAME).find(([,n]) => n === name)?.[0];
      if (iso3) m[iso3] = { ...data, name };
    });
    return m;
  }, [countryData]);

  // Load world topojson
  useEffect(() => {
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then(r => r.json()).then(setGeoData).catch(() => {});
  }, []);

  const W = 960, H = 500;

  // Mercator projection
  const project = useCallback(([lng, lat]) => {
    const x = (lng + 180) * (W / 360);
    const latRad = (lat * Math.PI) / 180;
    const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    const y = H / 2 - (W * mercN) / (2 * Math.PI);
    return [x, Math.max(0, Math.min(H, y))];
  }, []);

  const ISO3MAP = {"840":"USA","276":"DEU","250":"FRA","826":"GBR","392":"JPN","156":"CHN",
    "356":"IND","036":"AUS","124":"CAN","076":"BRA","710":"ZAF","566":"NGA","702":"SGP",
    "344":"HKG","784":"ARE","682":"SAU","372":"IRL","528":"NLD","756":"CHE","380":"ITA",
    "724":"ESP","752":"SWE","578":"NOR","208":"DNK","056":"BEL","040":"AUT","616":"POL",
    "203":"CZE","484":"MEX","032":"ARG","152":"CHL","170":"COL","410":"KOR","158":"TWN",
    "360":"IDN","458":"MYS","764":"THA","608":"PHL","554":"NZL","376":"ISR","792":"TUR",
    "818":"EGY","404":"KEN","288":"GHA","504":"MAR"};

  // Draw topojson features on canvas
  const drawTopoFeatures = useCallback((ctx, topo) => {
    if (!topo?.objects?.countries?.geometries || !topo.arcs || !topo.transform) return;
    const kx = topo.transform.scale[0];
    const ky = topo.transform.scale[1];
    const tx = topo.transform.translate[0];
    const ty = topo.transform.translate[1];

    // Pre-decode all arcs into projected [x,y] arrays
    const projectedArcs = topo.arcs.map(arc => {
      let ax = 0, ay = 0;
      return arc.map(([dx, dy]) => {
        ax += dx; ay += dy;
        return project([ax * kx + tx, ay * ky + ty]);
      });
    });

    topo.objects.countries.geometries.forEach(geom => {
      const numId = String(geom.id ?? "").padStart(3, "0");
      const iso3 = ISO3MAP[numId] || "";
      const data = dataByIso3[iso3];

      let fill, stroke;
      if (data) {
        const intensity = Math.min(1, data.total / maxCount);
        const r = Math.round(8 + intensity * 4);
        const g = Math.round(30 + intensity * 170);
        const b = Math.round(48 + intensity * 130);
        fill = `rgb(${r},${g},${b})`;
        stroke = "rgba(0,200,160,0.25)";
      } else {
        fill = "#111c2e";
        stroke = "#1a2a3e";
      }

      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.35;

      const drawRing = (ring) => {
        let first = true;
        ring.forEach(arcIdx => {
          const pts = arcIdx < 0 ? [...projectedArcs[~arcIdx]].reverse() : projectedArcs[arcIdx];
          pts.forEach(([x, y], i) => {
            if (first && i === 0) { ctx.moveTo(x, y); first = false; }
            else ctx.lineTo(x, y);
          });
        });
      };

      if (geom.type === "Polygon") {
        geom.arcs.forEach(ring => { ctx.beginPath(); drawRing(ring); ctx.closePath(); ctx.fill(); ctx.stroke(); });
      } else if (geom.type === "MultiPolygon") {
        geom.arcs.forEach(polygon => {
          polygon.forEach(ring => { ctx.beginPath(); drawRing(ring); ctx.closePath(); ctx.fill(); ctx.stroke(); });
        });
      }
    });
  }, [geoData, dataByIso3, maxCount, project]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0a0f1a";
    ctx.fillRect(0, 0, W, H);
    // Grid lines
    ctx.strokeStyle = "#161e2e"; ctx.lineWidth = 0.5;
    [-60,-30,0,30,60].forEach(lat => {
      const [,y] = project([0, lat]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    });
    [-150,-120,-90,-60,-30,0,30,60,90,120,150].forEach(lng => {
      const [x] = project([lng, 0]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    });
    if (geoData) drawTopoFeatures(ctx, geoData);
  }, [geoData, drawTopoFeatures, project]);

  const getCountryAtPoint = useCallback((clientX, clientY) => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const t = transformRef.current;
    const cx = (clientX - rect.left - t.x) / t.scale;
    const cy = (clientY - rect.top - t.y) / t.scale;
    // Find closest country centroid
    const centroids = {
      "USA":[37,-95],"DEU":[51,10],"FRA":[46,2],"GBR":[54,-2],"JPN":[36,138],
      "CHN":[35,105],"IND":[20,77],"AUS":[-25,134],"CAN":[56,-96],"BRA":[-10,-55],
      "ZAF":[-29,25],"NGA":[9,8],"SGP":[1.3,103.8],"HKG":[22.3,114.2],"ARE":[24,54],
      "SAU":[24,45],"IRL":[53,-8],"NLD":[52,5],"CHE":[47,8],"ITA":[42,12],
      "ESP":[40,-4],"SWE":[60,15],"NOR":[60,8],"DNK":[56,10],"BEL":[50,4],
      "AUT":[47,14],"POL":[52,20],"CZE":[50,15],"MEX":[23,-102],"ARG":[-34,-64],
      "CHL":[-33,-71],"COL":[4,-72],"KOR":[37,128],"TWN":[24,121],"IDN":[-5,120],
      "MYS":[3,112],"THA":[15,101],"PHL":[13,122],"NZL":[-41,174],"ISR":[31,35],
      "TUR":[39,35],"EGY":[27,30],"KEN":[-1,37],"GHA":[8,-2],"MAR":[32,-5],
    };
    let closest = null, minDist = 40;
    Object.entries(centroids).forEach(([iso3, [lat, lng]]) => {
      const [px, py] = project([lng, lat]);
      const d = Math.hypot(cx - px, cy - py);
      if (d < minDist) { minDist = d; closest = iso3; }
    });
    return closest;
  }, [project]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setTransform(t => ({ ...t, scale: Math.max(0.6, Math.min(8, t.scale * (e.deltaY < 0 ? 1.2 : 0.85))) }));
  }, []);
  const handleMouseDown = useCallback((e) => {
    setDragging(true);
    dragStart.current = { x: e.clientX - transformRef.current.x, y: e.clientY - transformRef.current.y };
  }, []);
  const handleMouseMove = useCallback((e) => {
    if (dragging && dragStart.current) setTransform(t => ({ ...t, x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y }));
    const iso3 = getCountryAtPoint(e.clientX, e.clientY);
    if (iso3) {
      const data = dataByIso3[iso3];
      setTooltip({ name: ISO3_TO_NAME[iso3] || iso3, x: e.clientX, y: e.clientY, data: data || null });
    } else setTooltip(null);
  }, [dragging, getCountryAtPoint, dataByIso3]);
  const handleMouseUp = useCallback(() => setDragging(false), []);
  const handleKey = useCallback((e) => {
    if (e.key === "Escape") setTransform({ x: 0, y: 0, scale: 1 });
    if (e.key === "+" || e.key === "=") setTransform(t => ({ ...t, scale: Math.min(8, t.scale * 1.3) }));
    if (e.key === "-") setTransform(t => ({ ...t, scale: Math.max(0.6, t.scale * 0.8) }));
  }, []);

  return (
    <div style={{ background: "#0d1520", border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginTop: 20 }}>
      <div style={{ padding: "18px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: C.text, letterSpacing: -0.3 }}>Global Regulatory Landscape</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[{z:"+",fn:()=>setTransform(t=>({...t,scale:Math.min(8,t.scale*1.3)}))},
            {z:"−",fn:()=>setTransform(t=>({...t,scale:Math.max(0.6,t.scale*0.8)}))},
            {z:"⊡",fn:()=>setTransform({x:0,y:0,scale:1})}
          ].map(({z,fn})=>(
            <button key={z} onClick={fn} style={{width:36,height:36,borderRadius:9,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.08)",color:C.text,fontSize:z==="⊡"?14:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{z}</button>
          ))}
        </div>
      </div>
      <div ref={containerRef} style={{position:"relative",height:480,overflow:"hidden",cursor:dragging?"grabbing":"grab",touchAction:"pan-y",background:"#0a0f1a"}}
        onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp} onMouseLeave={()=>{handleMouseUp();setTooltip(null);}}
        onKeyDown={handleKey} tabIndex={0}>
        <canvas ref={canvasRef} width={W} height={H}
          style={{position:"absolute",transform:`translate(${transform.x}px,${transform.y}px) scale(${transform.scale})`,transformOrigin:"0 0",transition:dragging?"none":"transform 0.08s"}}/>
        {!geoData && <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",color:C.muted,fontSize:13}}>Loading map...</div>}
        <div style={{position:"absolute",bottom:20,left:"50%",transform:"translateX(-50%)",textAlign:"center"}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.35)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:6}}>Regulations Tracked</div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:11,color:"rgba(255,255,255,0.35)"}}>0</span>
            <div style={{width:200,height:8,borderRadius:4,background:"linear-gradient(to right, #0a1525, #0a4a3a, #00c896)"}}/>
            <span style={{fontSize:11,color:"rgba(255,255,255,0.35)"}}>40+</span>
          </div>
        </div>
        <div style={{position:"absolute",top:14,left:14,fontSize:11,color:"rgba(255,255,255,0.3)"}}>+/− zoom · drag to pan · Esc reset</div>
      </div>
      {tooltip && (
        <div style={{position:"fixed",left:tooltip.x+14,top:tooltip.y-12,background:"#0f1a2e",border:"1px solid rgba(0,200,150,0.2)",borderRadius:10,padding:"10px 16px",fontSize:13,pointerEvents:"none",zIndex:9999,boxShadow:"0 10px 30px rgba(0,0,0,0.7)",minWidth:170}}>
          <div style={{fontWeight:700,color:"#fff",marginBottom:6,fontSize:14}}>{tooltip.name}</div>
          {tooltip.data ? <>
            <div style={{color:"rgba(255,255,255,0.5)"}}>Regulations: <span style={{color:"#00c896",fontWeight:600}}>{tooltip.data.total}</span></div>
            <div style={{color:"rgba(255,255,255,0.5)"}}>In Scope: <span style={{color:"#10b981",fontWeight:600}}>{tooltip.data.inScope}</span></div>
            <div style={{color:"rgba(255,255,255,0.5)"}}>Coverage: <span style={{color:"#fff",fontWeight:600}}>{Math.round(tooltip.data.inScope/tooltip.data.total*100)}%</span></div>
          </> : <div style={{color:"rgba(255,255,255,0.4)",fontStyle:"italic"}}>No regulations mapped</div>}
        </div>
      )}
    </div>
  );
}


function Dashboard({ allRegs, scopeMap, analysisMap }) {
  const byScope = useMemo(() => { const c = { "In Scope": 0, "Out of Scope": 0, Pending: 0 }; allRegs.forEach(r => { const s = scopeMap[r.id] || "Pending"; if (s in c) c[s]++; }); return c; }, [allRegs, scopeMap]);
  const analyzed = Object.keys(analysisMap).length;
  const upcoming = useMemo(() => allRegs.filter(r => { if (!r.deadline) return false; const d = daysUntil(r.deadline); return d !== null && d >= 0 && d <= 180; }).sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).slice(0, 8), [allRegs]);
  const byDomain = useMemo(() => { const m = {}; allRegs.forEach(r => { if (!m[r.domain]) m[r.domain] = { total: 0, inScope: 0 }; m[r.domain].total++; if ((scopeMap[r.id] || "Pending") === "In Scope") m[r.domain].inScope++; }); return Object.entries(m).sort((a, b) => b[1].total - a[1].total); }, [allRegs, scopeMap]);
  const byRegion = useMemo(() => { const m = {}; allRegs.forEach(r => { m[r.region] = (m[r.region] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [allRegs]);
  const jurisdictionCount = useMemo(() => new Set(allRegs.map(r => r.region)).size, [allRegs]);
  const countryCount = useMemo(() => new Set(allRegs.flatMap(r => REGION_COUNTRIES[r.region] || [r.region])).size, [allRegs]);
  return (
    <div className="fadeIn">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text }}>Compliance Posture Dashboard</h1>
        <p style={{ fontSize: 15, color: C.muted, marginTop: 6 }}>Global regulatory inventory overview for Marsh entities</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
        <StatCard label="Total Regulations" value={allRegs.length} sub={`${analyzed} analyzed`} color="indigo" />
        <StatCard label="Jurisdictions" value={jurisdictionCount} sub="Regulatory regions" color="blue" />
        <StatCard label="Countries" value={countryCount} sub="Nations covered" color="emerald" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>Regulations by Domain</div>
          {byDomain.map(([dom, { total, inScope }]) => (
            <div key={dom} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: C.muted, width: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{dom}</div>
              <div style={{ flex: 1, background: C.panel2, borderRadius: 4, height: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", background: C.accent, borderRadius: 4, width: `${(total / allRegs.length) * 100}%` }} />
              </div>
              <div style={{ fontSize: 13, color: C.text, width: 28, textAlign: "right", fontWeight: 600 }}>{total}</div>
              <div style={{ fontSize: 12, color: C.green, width: 80, textAlign: "right" }}>{inScope} in scope</div>
            </div>
          ))}
        </div>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>Upcoming Deadlines (180 days)</div>
          {upcoming.length === 0 && <div style={{ fontSize: 13, color: C.muted, textAlign: "center", padding: "20px 0" }}>No deadlines in next 180 days</div>}
          {upcoming.map(r => { const days = daysUntil(r.deadline); return (<div key={r.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${C.border}` }}><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div><div style={{ fontSize: 12, color: C.muted }}>{r.region} · {r.domain}</div></div><div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: urgencyColor(days) }}>{formatDeadline(r.deadline)}</div><div style={{ fontSize: 11, color: C.muted }}>{days === 0 ? "Today" : `${days}d`}</div></div></div>); })}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 8 }}>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>Regulations by Region</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {byRegion.map(([reg, cnt]) => (<div key={reg} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><span style={{ color: C.muted, flex: 1 }}>{reg}</span><span style={{ color: C.text, fontWeight: 600 }}>{cnt}</span></div>))}
          </div>
        </div>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>Scope Status</div>
          {Object.entries(byScope).map(([s, cnt]) => { const pct = allRegs.length ? ((cnt / allRegs.length) * 100).toFixed(0) : 0; const col = { "In Scope": C.green, "Out of Scope": C.red, Pending: C.amber }[s]; return (<div key={s} style={{ marginBottom: 14 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}><span style={{ color: C.muted }}>{s}</span><span style={{ color: C.text, fontWeight: 600 }}>{cnt} ({pct}%)</span></div><div style={{ height: 8, background: C.panel2, borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", background: col, borderRadius: 4, width: `${pct}%`, transition: "width 0.5s ease" }} /></div></div>); })}
        </div>
      </div>
      <WorldHeatmap allRegs={allRegs} scopeMap={scopeMap} />
    </div>
  );
}

function Inventory({ allRegs, scopeMap, onScopeChange, analysisMap, onDelete, isAdmin, onAnalyzeClick }) {
  const [search, setSearch] = useState(""); const [domain, setDomain] = useState("All"); const [region, setRegion] = useState("All"); const [scope, setScope] = useState("All"); const [page, setPage] = useState(1); const [delConfirm, setDelConfirm] = useState(null); const PER = 20;
  const filtered = useMemo(() => { let list = [...allRegs]; if (search) { const q = search.toLowerCase(); list = list.filter(r => r.name.toLowerCase().includes(q) || r.reference.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || (r.tags || []).some(t => t.toLowerCase().includes(q))); } if (domain !== "All") list = list.filter(r => r.domain === domain); if (region !== "All") list = list.filter(r => r.region === region); if (scope !== "All") list = list.filter(r => (scopeMap[r.id] || "Pending") === scope); return list; }, [allRegs, search, domain, region, scope, scopeMap]);
  const pages = Math.ceil(filtered.length / PER); const paged = filtered.slice((page - 1) * PER, page * PER);
  const inp = { background: C.panel2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "10px 14px", fontSize: 14, outline: "none" };
  const th = { padding: "13px 14px", fontSize: 12, fontWeight: 700, color: C.muted, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.05em" };
  const td = { padding: "13px 14px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top" };
  const confirmDel = (id) => { if (delConfirm === id) { onDelete(id); setDelConfirm(null); } else { setDelConfirm(id); setTimeout(() => setDelConfirm(null), 3000); } };
  return (
    <div className="fadeIn">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text }}>Regulation Inventory</h1>
          <p style={{ fontSize: 14, color: C.muted, marginTop: 5 }}>{filtered.length} regulations {filtered.length !== allRegs.length && `(${allRegs.length} total)`}</p>
        </div>
        {isAdmin && <Badge text="Admin Mode" style={{ bg: C.indigoBg, border: C.indigoBorder, color: C.indigo }} />}
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search regulations, references, tags..." style={{ ...inp, flex: 1, minWidth: 200 }} />
        <select value={domain} onChange={e => { setDomain(e.target.value); setPage(1); }} style={{ ...inp, cursor: "pointer" }}><option>All</option>{DOMAINS.map(d => <option key={d}>{d}</option>)}</select>
        <select value={region} onChange={e => { setRegion(e.target.value); setPage(1); }} style={{ ...inp, cursor: "pointer" }}><option>All</option>{["EU", "US", "UK", "APAC", "Global", "Canada", "LATAM", "Middle East", "Africa"].map(r => <option key={r}>{r}</option>)}</select>
        <select value={scope} onChange={e => { setScope(e.target.value); setPage(1); }} style={{ ...inp, cursor: "pointer" }}><option>All</option><option>In Scope</option><option>Out of Scope</option><option>Pending</option></select>
      </div>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead style={{ background: C.panel2 }}>
              <tr>
                <th style={{ ...th, width: 90 }}>ID</th><th style={th}>Regulation</th><th style={{ ...th, width: 80 }}>Region</th>
                <th style={{ ...th, width: 140 }}>Domain</th><th style={{ ...th, width: 100 }}>Status</th><th style={{ ...th, width: 110 }}>Scope</th>
                <th style={{ ...th, width: 140 }}>Deadline</th><th style={{ ...th, width: 200 }}>Set Scope</th><th style={{ ...th, width: 110 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(r => {
                const rs = analysisMap[r.id] ? "Analyzed" : r.status; const cs = scopeMap[r.id] || "Pending"; const days = daysUntil(r.deadline);
                return (<tr key={r.id}>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 12, color: C.muted }}>{r.id}</td>
                  <td style={td}><div style={{ fontWeight: 600, color: C.text, fontSize: 14, maxWidth: 320 }}>{r.name}</div><div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{r.reference}</div></td>
                  <td style={{ ...td, fontSize: 13 }}>{r.region}</td>
                  <td style={td}><Badge text={r.domain} /></td>
                  <td style={td}><Badge text={rs} style={statusStyle(rs)} /></td>
                  <td style={td}><Badge text={cs} style={scopeStyle(cs)} /></td>
                  <td style={{ ...td, fontSize: 13, whiteSpace: "nowrap" }}>{r.deadline ? <span style={{ color: urgencyColor(days) }}>{formatDeadline(r.deadline)}{days !== null && days >= 0 && <span style={{ color: C.muted, marginLeft: 4 }}>({days}d)</span>}</span> : <span style={{ color: C.border }}>—</span>}</td>
                  <td style={td}><div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <select value={cs} onChange={e => onScopeChange(r.id, e.target.value)} style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 7, padding: "5px 10px", fontSize: 13, cursor: "pointer", outline: "none" }}><option>Pending</option><option>In Scope</option><option>Out of Scope</option></select>
                    {isAdmin && <button onClick={() => confirmDel(r.id)} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: `1px solid ${delConfirm === r.id ? C.red : C.border}`, background: delConfirm === r.id ? C.redBg : "transparent", color: delConfirm === r.id ? C.red : C.muted, cursor: "pointer" }}>{delConfirm === r.id ? "Confirm" : "✕"}</button>}
                  </div></td>
                  <td style={td}><button onClick={() => onAnalyzeClick(r.id)} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 7, border: `1px solid ${analysisMap[r.id] ? C.indigoBorder : C.border}`, background: analysisMap[r.id] ? C.indigoBg : "transparent", color: analysisMap[r.id] ? C.indigo : C.muted, cursor: "pointer", whiteSpace: "nowrap" }}>⚡ {analysisMap[r.id] ? "View Analysis" : "Analyze"}</button></td>
                </tr>);
              })}
              {paged.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: C.muted, padding: "56px 0" }}>No regulations match your filters</td></tr>}
            </tbody>
          </table>
        </div>
        {pages > 1 && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderTop: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 13, color: C.muted }}>Page {page} of {pages} — {filtered.length} results</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.panel2, color: C.text, fontSize: 13, cursor: "pointer", opacity: page === 1 ? 0.4 : 1 }}>Prev</button>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.panel2, color: C.text, fontSize: 13, cursor: "pointer", opacity: page === pages ? 0.4 : 1 }}>Next</button>
          </div>
        </div>}
      </div>
    </div>
  );
}

function Analyze({ allRegs, scopeMap, onScopeChange, analysisMap, onAnalysisComplete, initialRegId, onAnalyzeDone }) {
  const [selected, setSelected] = useState(initialRegId || "");
  const [searchQ, setSearchQ] = useState(""); const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState(null);
  // File upload state
  const [uploadedFile, setUploadedFile] = useState(null); const [fileContent, setFileContent] = useState("");
  // URL management state
  const [urls, setUrls] = useState(() => storage.get("delphi_urls", []));
  const [newUrl, setNewUrl] = useState(""); const [editingUrl, setEditingUrl] = useState(null); const [editVal, setEditVal] = useState("");
  const [crawling, setCrawling] = useState(null); const [urlResults, setUrlResults] = useState({});
  const [activeTab, setActiveTab] = useState("regulation"); // regulation | file | url

  const reg = allRegs.find(r => r.id === selected);
  useEffect(() => { if (initialRegId) { setSelected(initialRegId); setActiveTab("regulation"); if (onAnalyzeDone) onAnalyzeDone(); } }, [initialRegId]);
  useEffect(() => { setResult(selected && analysisMap[selected] ? analysisMap[selected] : null); }, [selected, analysisMap]);
  const filteredRegs = useMemo(() => { if (!searchQ) return allRegs; const q = searchQ.toLowerCase(); return allRegs.filter(r => r.name.toLowerCase().includes(q) || r.reference.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)); }, [allRegs, searchQ]);
  const selectReg = (id) => { setSelected(id); setSearchQ(""); setShowDropdown(false); };
  const inScopeIds = useMemo(() => new Set(Object.entries(scopeMap).filter(([, v]) => v === "In Scope").map(([k]) => k)), [scopeMap]);

  const saveUrls = (newList) => { setUrls(newList); storage.set("delphi_urls", newList); };
  const addUrl = () => {
    if (!newUrl.trim()) return;
    const u = newUrl.trim().startsWith("http") ? newUrl.trim() : "https://" + newUrl.trim();
    saveUrls([...urls, { id: Date.now(), url: u, label: u, added: new Date().toISOString() }]);
    setNewUrl("");
  };
  const deleteUrl = (id) => saveUrls(urls.filter(u => u.id !== id));
  const startEdit = (u) => { setEditingUrl(u.id); setEditVal(u.label); };
  const saveEdit = (id) => { saveUrls(urls.map(u => u.id === id ? { ...u, label: editVal } : u)); setEditingUrl(null); };

  const crawlUrl = async (urlObj) => {
    setCrawling(urlObj.id);
    try {
      const res = await fetch(PROXY_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5", max_tokens: 2000,
          messages: [{ role: "user", content: `Fetch and analyze this URL for regulatory content: ${urlObj.url}\n\nIdentify: 1) Is this a specific regulation or a regulatory site? 2) Key regulation names/references found. 3) Jurisdiction and domain. 4) Summary of obligations. Respond in JSON: {"type":"regulation|site","regulations":[{"name":"","reference":"","jurisdiction":"","summary":""}],"siteDescription":""}` }]
        })
      });
      const data = await res.json();
      const text = (data.content?.[0]?.text || "").replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      try { setUrlResults(prev => ({ ...prev, [urlObj.id]: JSON.parse(text) })); }
      catch { setUrlResults(prev => ({ ...prev, [urlObj.id]: { type: "error", summary: text.substring(0, 300) } })); }
    } catch (e) { setUrlResults(prev => ({ ...prev, [urlObj.id]: { type: "error", summary: e.message } })); }
    setCrawling(null);
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadedFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setFileContent(ev.target.result);
    if (file.type === "application/pdf") reader.readAsDataURL(file);
    else reader.readAsText(file);
  };

  const buildPrompt = (regData, summaryOverride) => {
    const thisRegControls = CONTROLS_LIBRARY.filter(c => c.regulations.includes(selected));
    const otherControls = CONTROLS_LIBRARY.filter(c => !c.regulations.includes(selected) && c.regulations.some(rId => inScopeIds.has(rId)));
    return `You are a regulatory compliance expert. Respond with ONLY a valid JSON object - no markdown, no backticks, no text outside JSON. No newlines inside string values.

Regulation: ${regData.name} | ${regData.region || "Unknown"} | ${regData.domain || "Unknown"}
Summary: ${summaryOverride || regData.summary || "See uploaded content"}
Marsh entities in scope: ${(regData.marshEntities || []).join(", ") || "Unknown - assess based on regulation content"}

Controls ALREADY MAPPED to this regulation: ${thisRegControls.map(c => c.title).join(", ") || "None"}
Controls from other in-scope regulations: ${otherControls.map(c => c.title).join(", ") || "None"}

Return this exact JSON (string values max 25 words, reasons max 10 words):
{"executiveSummary":"2 sentence summary","businessRisk":"High","riskRationale":"one sentence","keyObligations":["obligation 1","obligation 2","obligation 3"],"marshScope":[{"entity":"Marsh (Parent)","inScope":true,"reason":"short reason"},{"entity":"Marsh Risk","inScope":true,"reason":"short reason"},{"entity":"Guy Carpenter / Marsh Re","inScope":false,"reason":"short reason"},{"entity":"Mercer","inScope":false,"reason":"short reason"},{"entity":"Oliver Wyman","inScope":false,"reason":"short reason"},{"entity":"Marsh Securities LLC","inScope":false,"reason":"short reason"},{"entity":"Marsh Securities Limited (UK)","inScope":false,"reason":"short reason"},{"entity":"Marsh Securities Ireland","inScope":false,"reason":"short reason"},{"entity":"Marsh MMA Securities LLC","inScope":false,"reason":"short reason"},{"entity":"Marsh MMA Asset Management LLC","inScope":false,"reason":"short reason"},{"entity":"Victor Insurance","inScope":false,"reason":"short reason"},{"entity":"McGriff Insurance Services","inScope":false,"reason":"short reason"}],"allControls":[{"title":"name","description":"what to do","priority":"Immediate","isNew":true}],"gapAnalysis":"one paragraph","deadlineRisk":"one sentence or empty string","recommendedActions":["action 1","action 2","action 3"]}

Rules: businessRisk=High/Medium/Low. priority=Immediate/Short-term/Ongoing. allControls=ALL controls for this regulation (isNew:false if already mapped, isNew:true if new gap). marshScope must have all 12 entities. Output ONLY raw JSON.`;
  };

  const analyze = async () => {
    setLoading(true); setError(""); setResult(null);
    try {
      let messages;
      if (activeTab === "file" && uploadedFile && fileContent) {
        const isPdf = uploadedFile.type === "application/pdf";
        const regData = { name: uploadedFile.name.replace(/\.[^.]+$/, ""), region: "Unknown", domain: "Unknown", marshEntities: [], summary: "" };
        const prompt = buildPrompt(regData, "See attached document");
        if (isPdf) {
          const base64 = fileContent.split(",")[1];
          messages = [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }, { type: "text", text: prompt }] }];
        } else {
          messages = [{ role: "user", content: `${prompt}\n\nDocument content:\n${fileContent.substring(0, 8000)}` }];
        }
      } else if (reg) {
        const prompt = buildPrompt(reg);
        messages = [{ role: "user", content: prompt }];
      } else { setError("Please select a regulation or upload a file."); setLoading(false); return; }

      const res = await fetch(PROXY_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 4000, messages }) });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const raw = data.content?.[0]?.text || "";
      const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      let parsed;
      try { parsed = JSON.parse(text); }
      catch {
        try {
          const m = text.match(/\{[\s\S]*\}/);
          if (!m) throw new Error("No JSON");
          let j = m[0].replace(/,\s*([}\]])/g, '$1').replace(/([^\\])\n/g, '$1 ');
          parsed = JSON.parse(j);
        } catch {
          parsed = { executiveSummary: "Parse error — please retry.", businessRisk: "Medium", riskRationale: "See raw output.", keyObligations: [text.substring(0, 400)], newControls: [], gapAnalysis: "Re-run analysis.", deadlineRisk: "", recommendedActions: ["Retry analysis"] };
        }
      }
      if (selected) onAnalysisComplete(selected, parsed);
      setResult(parsed);
    } catch (e) { setError(e.message || "Analysis failed"); }
    finally { setLoading(false); }
  };

  const card = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, marginBottom: 16 };
  const inp = { background: C.panel2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "11px 14px", fontSize: 14, outline: "none" };
  const marshScopeFromReg = reg ? MARSH_ENTITIES.map(e => ({ entity: e, inScope: (reg.marshEntities || []).includes(e) })) : [];
  const canAnalyze = (activeTab === "regulation" && selected) || (activeTab === "file" && uploadedFile);

  const TabBtn = ({ id, label, icon }) => (
    <button onClick={() => setActiveTab(id)} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${activeTab === id ? C.indigoBorder : C.border}`, background: activeTab === id ? C.indigoBg : "transparent", color: activeTab === id ? C.indigo : C.muted, fontSize: 13, fontWeight: activeTab === id ? 600 : 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>{icon} {label}</button>
  );

  return (
    <div className="fadeIn">
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text }}>Analyze Regulation</h1>
        <p style={{ fontSize: 15, color: C.muted, marginTop: 6 }}>AI-powered compliance analysis · file upload · URL scanning</p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <TabBtn id="regulation" label="Select Regulation" icon="≡" />
        <TabBtn id="file" label="Upload File" icon="↑" />
        <TabBtn id="url" label="Manage URLs" icon="🔗" />
      </div>

      {/* Regulation tab */}
      {activeTab === "regulation" && (
        <div style={card}>
          <label style={{ display: "block", fontSize: 11, color: C.muted, marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Select Regulation</label>
          <div style={{ position: "relative", marginBottom: 16 }}>
            <input value={selected && !showDropdown ? (allRegs.find(r => r.id === selected)?.name || selected) : searchQ} onChange={e => { setSearchQ(e.target.value); setShowDropdown(true); if (!e.target.value) setSelected(""); }} onFocus={() => { setShowDropdown(true); if (selected) setSearchQ(""); }} onBlur={() => setTimeout(() => setShowDropdown(false), 200)} placeholder="Search by name, reference, or ID..." style={{ ...inp, width: "100%", paddingRight: 36 }} />
            <span onClick={() => { setSelected(""); setSearchQ(""); setShowDropdown(true); }} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: C.muted, fontSize: 16, userSelect: "none" }}>{selected ? "×" : "▾"}</span>
            {showDropdown && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, marginTop: 4, maxHeight: 300, overflowY: "auto", boxShadow: "0 12px 36px rgba(0,0,0,0.5)" }}>
                {filteredRegs.length === 0 && <div style={{ padding: "14px 16px", fontSize: 13, color: C.muted }}>No regulations found</div>}
                {filteredRegs.map(r => (
                  <div key={r.id} onMouseDown={() => selectReg(r.id)} style={{ padding: "11px 16px", cursor: "pointer", borderBottom: `1px solid ${C.border}`, background: selected === r.id ? C.indigoBg : "transparent" }} onMouseEnter={e => e.currentTarget.style.background = selected === r.id ? C.indigoBg : C.panel2} onMouseLeave={e => e.currentTarget.style.background = selected === r.id ? C.indigoBg : "transparent"}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontFamily: "monospace", fontSize: 11, color: C.muted, flexShrink: 0 }}>{r.id}</span><span style={{ fontSize: 14, color: C.text, fontWeight: selected === r.id ? 600 : 400 }}>{r.name}</span>{analysisMap[r.id] && <span style={{ marginLeft: "auto", fontSize: 11, color: C.indigo, flexShrink: 0 }}>● Analyzed</span>}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{r.reference} · {r.region} · {r.domain}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {reg && (
            <div style={{ background: C.panel2, borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                <div><div style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>{reg.name}</div><div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{reg.reference} · {reg.region} · {reg.domain}</div></div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}><Badge text={analysisMap[selected] ? "Analyzed" : reg.status} style={statusStyle(analysisMap[selected] ? "Analyzed" : reg.status)} /><Badge text={scopeMap[selected] || "Pending"} style={scopeStyle(scopeMap[selected] || "Pending")} /></div>
              </div>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 10 }}>{reg.summary}</p>
              {reg.deadline && <div style={{ fontSize: 13, color: urgencyColor(daysUntil(reg.deadline)), marginBottom: 10 }}>Deadline: {formatDeadline(reg.deadline)} ({daysUntil(reg.deadline)} days)</div>}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: C.muted }}>Scope:</span>
                <select value={scopeMap[selected] || "Pending"} onChange={e => onScopeChange(selected, e.target.value)} style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 7, padding: "5px 10px", fontSize: 13, cursor: "pointer", outline: "none" }}><option>Pending</option><option>In Scope</option><option>Out of Scope</option></select>
              </div>
            </div>
          )}
          {/* Marsh Entity Scope Panel */}
          {reg && (
            <div style={{ background: C.panel2, borderRadius: 10, padding: 16, marginBottom: 16, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>◈ Marsh Entity Scope</div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>Based on regulation's tagged entities. Run analysis for AI rationale.</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.green, fontWeight: 700, marginBottom: 8 }}>● In Scope ({marshScopeFromReg.filter(e => e.inScope).length})</div>
                  {marshScopeFromReg.filter(e => e.inScope).map(e => { const ai = result?.marshScope?.find(x => x.entity === e.entity); return (<div key={e.entity} style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderLeft: `3px solid ${C.green}`, borderRadius: 8, padding: "10px 13px", marginBottom: 7 }}><div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{e.entity}</div>{ai?.reason && <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{ai.reason}</div>}</div>); })}
                  {marshScopeFromReg.filter(e => e.inScope).length === 0 && <div style={{ fontSize: 13, color: C.muted, fontStyle: "italic" }}>None</div>}
                </div>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, fontWeight: 700, marginBottom: 8 }}>○ Out of Scope ({marshScopeFromReg.filter(e => !e.inScope).length})</div>
                  {marshScopeFromReg.filter(e => !e.inScope).map(e => { const ai = result?.marshScope?.find(x => x.entity === e.entity); return (<div key={e.entity} style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.border}`, borderRadius: 8, padding: "10px 13px", marginBottom: 7, opacity: 0.65 }}><div style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{e.entity}</div>{ai?.reason && <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{ai.reason}</div>}</div>); })}
                  {marshScopeFromReg.filter(e => !e.inScope).length === 0 && <div style={{ fontSize: 13, color: C.muted, fontStyle: "italic" }}>None</div>}
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 10, fontStyle: "italic" }}>Always validate with legal counsel.</div>
            </div>
          )}
          <button onClick={analyze} disabled={!canAnalyze || loading} style={{ display: "flex", alignItems: "center", gap: 8, background: C.accent, border: "none", color: "#fff", fontWeight: 700, padding: "11px 24px", borderRadius: 9, fontSize: 15, cursor: canAnalyze && !loading ? "pointer" : "not-allowed", opacity: !canAnalyze || loading ? 0.5 : 1 }}>
            {loading ? <><span className="spin" style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%" }} />Analyzing...</> : "⚡ Run Analysis"}
          </button>
          {error && <div style={{ marginTop: 12, background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.red, borderRadius: 9, padding: 14, fontSize: 14 }}>{error}</div>}
        </div>
      )}

      {/* File Upload tab */}
      {activeTab === "file" && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>Upload Regulation Document</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>Upload a PDF or text file containing a regulation. DELPHI will extract and analyze its compliance obligations.</div>
          <label style={{ display: "block", cursor: "pointer" }}>
            <div style={{ border: `2px dashed ${uploadedFile ? C.indigoBorder : C.border}`, borderRadius: 12, padding: "32px 24px", textAlign: "center", background: uploadedFile ? C.indigoBg : C.panel2, transition: "all 0.2s" }}>
              {uploadedFile ? (
                <div>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.indigo }}>{uploadedFile.name}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{(uploadedFile.size / 1024).toFixed(1)} KB · {uploadedFile.type || "text"}</div>
                  <div style={{ fontSize: 12, color: C.green, marginTop: 6 }}>✓ Ready to analyze</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>↑</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Drop a file or click to browse</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>PDF, TXT, DOCX supported</div>
                </div>
              )}
            </div>
            <input type="file" accept=".pdf,.txt,.doc,.docx" onChange={handleFile} style={{ display: "none" }} />
          </label>
          {uploadedFile && <button onClick={() => { setUploadedFile(null); setFileContent(""); }} style={{ marginTop: 10, fontSize: 12, color: C.muted, background: "transparent", border: "none", cursor: "pointer" }}>× Remove file</button>}
          <button onClick={analyze} disabled={!uploadedFile || loading} style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 8, background: C.accent, border: "none", color: "#fff", fontWeight: 700, padding: "11px 24px", borderRadius: 9, fontSize: 15, cursor: uploadedFile && !loading ? "pointer" : "not-allowed", opacity: !uploadedFile || loading ? 0.5 : 1 }}>
            {loading ? <><span className="spin" style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%" }} />Analyzing...</> : "⚡ Analyze Document"}
          </button>
          {error && <div style={{ marginTop: 12, background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.red, borderRadius: 9, padding: 14, fontSize: 14 }}>{error}</div>}
        </div>
      )}

      {/* URL Management tab */}
      {activeTab === "url" && (
        <div>
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>Add Regulatory URL</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Add URLs to regulatory documents or regulatory body websites. DELPHI will crawl and identify regulations to analyze.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <input value={newUrl} onChange={e => setNewUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && addUrl()} placeholder="https://eur-lex.europa.eu/..." style={{ ...inp, flex: 1 }} />
              <button onClick={addUrl} style={{ padding: "11px 20px", background: C.accent, border: "none", color: "#fff", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>+ Add URL</button>
            </div>
          </div>
          {urls.length === 0 ? (
            <div style={{ textAlign: "center", color: C.muted, padding: "40px 0", fontSize: 14 }}>No URLs added yet. Add a regulatory URL above to get started.</div>
          ) : (
            urls.map(u => {
              const res = urlResults[u.id];
              return (
                <div key={u.id} style={{ ...card, marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editingUrl === u.id ? (
                        <div style={{ display: "flex", gap: 8 }}>
                          <input value={editVal} onChange={e => setEditVal(e.target.value)} style={{ ...inp, flex: 1, fontSize: 13 }} />
                          <button onClick={() => saveEdit(u.id)} style={{ padding: "8px 14px", background: C.green, border: "none", color: "#fff", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>Save</button>
                          <button onClick={() => setEditingUrl(null)} style={{ padding: "8px 14px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 7, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.label !== u.url ? u.label : ""}</div>
                          <div style={{ fontSize: 12, color: C.indigo, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: u.label !== u.url ? 2 : 0 }}>{u.url}</div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Added {new Date(u.added).toLocaleDateString()}</div>
                        </>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => crawlUrl(u)} disabled={crawling === u.id} style={{ padding: "7px 14px", background: C.indigoBg, border: `1px solid ${C.indigoBorder}`, color: C.indigo, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: crawling === u.id ? "not-allowed" : "pointer", opacity: crawling === u.id ? 0.6 : 1 }}>{crawling === u.id ? "Scanning..." : "🔍 Scan"}</button>
                      <button onClick={() => startEdit(u)} style={{ padding: "7px 12px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 7, fontSize: 13, cursor: "pointer" }}>✎ Edit</button>
                      <button onClick={() => deleteUrl(u.id)} style={{ padding: "7px 12px", background: "transparent", border: `1px solid ${C.border}`, color: C.red, borderRadius: 7, fontSize: 13, cursor: "pointer" }}>✕</button>
                    </div>
                  </div>
                  {res && (
                    <div style={{ background: C.panel2, borderRadius: 9, padding: 14, marginTop: 8 }}>
                      {res.type === "error" ? (
                        <div style={{ color: C.red, fontSize: 13 }}>Scan error: {res.summary}</div>
                      ) : (
                        <>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>
                            {res.type === "regulation" ? "📋 Regulation Document" : "🌐 Regulatory Site"} — {res.regulations?.length || 0} regulation(s) identified
                          </div>
                          {res.siteDescription && <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>{res.siteDescription}</div>}
                          {res.regulations?.map((r, i) => (
                            <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 13px", marginBottom: 8 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.name}</div>
                              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{r.reference} · {r.jurisdiction}</div>
                              <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{r.summary}</div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Analysis Results */}
      {result && (
        <div className="fadeIn">
          <div style={{ ...card, borderLeft: `3px solid ${riskColor(result.businessRisk)}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, color: C.text, fontSize: 16 }}>Executive Summary</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: riskColor(result.businessRisk), background: `${riskColor(result.businessRisk)}18`, border: `1px solid ${riskColor(result.businessRisk)}40`, borderRadius: 8, padding: "4px 14px" }}>{result.businessRisk} Risk</div>
            </div>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.75 }}>{result.executiveSummary}</p>
            {result.riskRationale && <p style={{ fontSize: 13, color: C.muted, marginTop: 10, fontStyle: "italic", borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>{result.riskRationale}</p>}
          </div>
          <div style={card}>
            <div style={{ fontWeight: 700, color: C.text, fontSize: 15, marginBottom: 12 }}>Key Obligations</div>
            {result.keyObligations?.map((o, i) => <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, fontSize: 14, color: C.muted, alignItems: "flex-start" }}><span style={{ color: C.accent, flexShrink: 0, marginTop: 2 }}>▸</span>{o}</div>)}
          </div>
          <div style={card}>
            <div style={{ fontWeight: 700, color: C.text, fontSize: 15, marginBottom: 10 }}>Gap Analysis</div>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.75 }}>{result.gapAnalysis}</p>
          </div>
          {(result.allControls || result.newControls)?.length > 0 && (
            <div style={{ ...card, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>Controls ({(result.allControls || result.newControls).length})</div>
                <span style={{ fontSize: 12, color: C.indigo, background: C.indigoBg, border: `1px solid ${C.indigoBorder}`, borderRadius: 6, padding: "3px 10px" }}>{(result.allControls || result.newControls).filter(c => c.isNew !== false).length} new</span>
                <span style={{ fontSize: 12, color: C.muted, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 10px" }}>{(result.allControls || result.newControls).filter(c => c.isNew === false).length} existing</span>
              </div>
              {(result.allControls || result.newControls).map((c, i) => {
                const isNew = c.isNew !== false;
                const pc = { Immediate: C.red, "Short-term": C.amber, Ongoing: C.blue }[c.priority] || C.blue;
                return (
                  <div key={i} style={{ background: isNew ? C.indigoBg : "transparent", border: `1px solid ${isNew ? C.indigoBorder : C.border}`, borderLeft: `3px solid ${isNew ? C.indigo : C.border}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        {isNew && <span style={{ fontSize: 10, background: C.indigo, color: "#fff", borderRadius: 4, padding: "2px 6px", flexShrink: 0, fontWeight: 700 }}>NEW</span>}
                        <span style={{ fontWeight: 600, color: isNew ? C.accentHover : C.text, fontSize: 14 }}>{c.title}</span>
                      </div>
                      <Badge text={c.priority} style={{ bg: `${pc}22`, border: `${pc}44`, color: pc }} />
                    </div>
                    <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65 }}>{c.description}</p>
                  </div>
                );
              })}
            </div>
          )}
          {result.recommendedActions?.length > 0 && (
            <div style={card}>
              <div style={{ fontWeight: 700, color: C.text, fontSize: 15, marginBottom: 12 }}>Recommended Actions</div>
              {result.recommendedActions.map((a, i) => <div key={i} style={{ display: "flex", gap: 12, marginBottom: 8, fontSize: 14, color: C.muted, alignItems: "flex-start" }}><span style={{ fontFamily: "monospace", fontSize: 12, background: C.panel2, borderRadius: 5, padding: "2px 8px", flexShrink: 0, color: C.accent, fontWeight: 600 }}>{i + 1}</span>{a}</div>)}
            </div>
          )}
          {result.deadlineRisk && <div style={{ ...card, background: C.amberBg, border: `1px solid ${C.amberBorder}` }}><div style={{ display: "flex", gap: 10, fontSize: 14, color: C.amber, alignItems: "flex-start" }}><span style={{ flexShrink: 0 }}>⚠</span><span>{result.deadlineRisk}</span></div></div>}
        </div>
      )}
    </div>
  );
}

function Controls({ allRegs, scopeMap, isAdmin, onDeleteControl, deletedControlIds }) {
  const [cat, setCat] = useState("All"); const [search, setSearch] = useState(""); const [showAll, setShowAll] = useState(false); const [delCtrl, setDelCtrl] = useState(null);
  const confirmDelCtrl = (id) => { if (delCtrl === id) { onDeleteControl(id); setDelCtrl(null); } else { setDelCtrl(id); setTimeout(() => setDelCtrl(null), 3000); } };
  const inScopeIds = useMemo(() => new Set(Object.entries(scopeMap).filter(([, v]) => v === "In Scope").map(([k]) => k)), [scopeMap]);
  const categories = useMemo(() => ["All", ...new Set(CONTROLS_LIBRARY.map(c => c.category))], []);

  // Deduplicate controls - show each control once even if mapped to multiple in-scope regs
  const controls = useMemo(() => {
    let l = CONTROLS_LIBRARY.filter(c => !(deletedControlIds || []).includes(c.controlId));
    if (!showAll) l = l.filter(c => c.regulations.some(rId => inScopeIds.has(rId)));
    if (cat !== "All") l = l.filter(c => c.category === cat);
    if (search) { const q = search.toLowerCase(); l = l.filter(c => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)); }
    // Deduplicate by controlId
    const seen = new Set();
    return l.filter(c => { if (seen.has(c.controlId)) return false; seen.add(c.controlId); return true; });
  }, [inScopeIds, cat, search, showAll, deletedControlIds]);

  const card = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, marginBottom: 14 };
  const inp = { background: C.panel2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "10px 14px", fontSize: 14, outline: "none" };

  return (
    <div className="fadeIn">
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text }}>Controls Library</h1>
        <p style={{ fontSize: 15, color: C.muted, marginTop: 6 }}>{controls.length} controls {showAll ? "(all)" : "(in-scope)"} · no duplicates</p>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search controls..." style={{ ...inp, flex: 1, minWidth: 180 }} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ ...inp, cursor: "pointer" }}>{categories.map(c => <option key={c}>{c}</option>)}</select>
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: C.muted, cursor: "pointer", padding: "10px 14px", border: `1px solid ${C.border}`, borderRadius: 9, background: C.panel2, userSelect: "none" }}>
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} style={{ accentColor: C.accent }} />Show all controls
        </label>
      </div>
      {inScopeIds.size === 0 && !showAll && (
        <div style={{ background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 12, padding: 20, textAlign: "center", marginBottom: 18 }}>
          <div style={{ color: C.amber, fontSize: 14, fontWeight: 600 }}>No regulations are marked In Scope yet</div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Set regulations to In Scope in the Inventory tab</div>
        </div>
      )}
      {controls.map(ctrl => {
        const pc = { Immediate: C.red, "Short-term": C.amber, Ongoing: C.blue }[ctrl.priority] || C.blue;
        const inScopeRegs = ctrl.regulations.filter(rId => inScopeIds.has(rId));
        return (
          <div key={ctrl.controlId} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 12, color: C.muted }}>{ctrl.controlId}</span>
                  <Badge text={ctrl.priority} style={{ bg: `${pc}22`, border: `${pc}44`, color: pc }} />
                  {inScopeRegs.length > 0 && <Badge text={`${inScopeRegs.length} in-scope reg${inScopeRegs.length > 1 ? "s" : ""}`} style={{ bg: C.greenBg, border: C.greenBorder, color: C.green }} />}
                </div>
                <div style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>{ctrl.title}</div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexShrink: 0 }}>
                <Badge text={ctrl.category} />
                {isAdmin && <button onClick={() => confirmDelCtrl(ctrl.controlId)} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 7, border: `1px solid ${delCtrl === ctrl.controlId ? C.red : C.border}`, background: delCtrl === ctrl.controlId ? C.redBg : "transparent", color: delCtrl === ctrl.controlId ? C.red : C.muted, cursor: "pointer", flexShrink: 0 }}>{delCtrl === ctrl.controlId ? "Confirm" : "×"}</button>}
              </div>
            </div>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 10 }}>{ctrl.description}</p>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}><span style={{ color: C.text, fontWeight: 600 }}>Owner:</span> {ctrl.owner}</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}><span style={{ color: C.text, fontWeight: 600 }}>Testing:</span> {ctrl.testingCriteria}</div>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Required by:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ctrl.regulations.map(rId => {
                const iS = inScopeIds.has(rId);
                const nm = allRegs.find(r => r.id === rId)?.name || rId;
                return (<span key={rId} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 14, border: `1px solid ${iS ? C.greenBorder : C.border}`, background: iS ? C.greenBg : "transparent", color: iS ? C.green : C.muted }}>{rId}{iS ? " ✓" : ""} — {nm.substring(0, 28)}</span>);
              })}
            </div>
          </div>
        );
      })}
      {controls.length === 0 && (inScopeIds.size > 0 || showAll) && (
        <div style={{ textAlign: "center", color: C.muted, padding: "56px 0", fontSize: 14 }}>No controls match your filters</div>
      )}
    </div>
  );
}

function Timeline({ allRegs, scopeMap }) {
  const [filter, setFilter] = useState("All");
  const withDeadlines = useMemo(() => { let l = allRegs.filter(r => r.deadline); if (filter === "In Scope") l = l.filter(r => (scopeMap[r.id] || "Pending") === "In Scope"); if (filter === "Upcoming") l = l.filter(r => daysUntil(r.deadline) !== null && daysUntil(r.deadline) >= 0); return l.sort((a, b) => new Date(a.deadline) - new Date(b.deadline)); }, [allRegs, scopeMap, filter]);
  const grouped = useMemo(() => { const g = {}; withDeadlines.forEach(r => { const y = r.deadline.substring(0, 4); if (!g[y]) g[y] = []; g[y].push(r); }); return g; }, [withDeadlines]);
  const sel = { background: C.panel2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 14px", fontSize: 14, cursor: "pointer", outline: "none" };
  return (
    <div className="fadeIn">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 8 }}>
        <div><h1 style={{ fontSize: 26, fontWeight: 800, color: C.text }}>Regulatory Timeline</h1><p style={{ fontSize: 15, color: C.muted, marginTop: 6 }}>{withDeadlines.length} regulations with deadlines</p></div>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={sel}><option>All</option><option>In Scope</option><option>Upcoming</option></select>
      </div>
      {Object.keys(grouped).length === 0 && <div style={{ textAlign: "center", color: C.muted, padding: "64px 0" }}>No deadlines match your filter</div>}
      {Object.entries(grouped).sort().map(([year, regs]) => (
        <div key={year} style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.accent }}>{year}</div>
            <div style={{ height: 1, flex: 1, background: C.border }} />
            <span style={{ fontSize: 12, color: C.muted }}>{regs.length} deadline{regs.length !== 1 ? "s" : ""}</span>
          </div>
          <div style={{ paddingLeft: 22, position: "relative" }}>
            <div style={{ position: "absolute", left: 7, top: 10, bottom: 10, width: 1, background: C.border }} />
            {regs.map(r => { const days = daysUntil(r.deadline); const col = urgencyColor(days); const cs = scopeMap[r.id] || "Pending"; return (<div key={r.id} style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 18, marginBottom: 12 }}><div style={{ position: "absolute", left: -17, top: 16, width: 11, height: 11, borderRadius: "50%", border: `2px solid ${col}`, background: days !== null && days < 0 ? col : "transparent", flexShrink: 0 }} /><div style={{ flex: 1, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>{r.name}</div><div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{r.reference} · {r.region} · {r.domain}</div></div><div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ fontWeight: 700, fontSize: 13, color: col }}>{formatDeadline(r.deadline)}</div><div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{days < 0 ? `${Math.abs(days)}d past` : days === 0 ? "Today" : `${days}d`}</div><div style={{ marginTop: 6 }}><Badge text={cs} style={scopeStyle(cs)} /></div></div></div></div>); })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Calendar({ allRegs, scopeMap }) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(null); const [filter, setFilter] = useState("All");
  const month = viewDate.getMonth(); const year = viewDate.getFullYear();
  const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const withDeadlines = useMemo(() => { let l = allRegs.filter(r => r.deadline); if (filter === "In Scope") l = l.filter(r => (scopeMap[r.id] || "Pending") === "In Scope"); return l; }, [allRegs, scopeMap, filter]);
  const regsByDay = useMemo(() => { const m = {}; withDeadlines.forEach(r => { const d = new Date(r.deadline + "T00:00:00"); if (d.getMonth() === month && d.getFullYear() === year) { const day = d.getDate(); if (!m[day]) m[day] = []; m[day].push(r); } }); return m; }, [withDeadlines, month, year]);
  const sel = { background: C.panel2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 14px", fontSize: 14, cursor: "pointer", outline: "none" };
  const btn = { background: C.panel2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 14px", fontSize: 14, cursor: "pointer" };
  return (
    <div className="fadeIn">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 8 }}>
        <div><h1 style={{ fontSize: 26, fontWeight: 800, color: C.text }}>Regulatory Calendar</h1><p style={{ fontSize: 15, color: C.muted, marginTop: 6 }}>{MONTHS[month]} {year}</p></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={sel}><option>All</option><option>In Scope</option></select>
          <button onClick={() => setViewDate(new Date(year, month - 1, 1))} style={btn}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text, minWidth: 150, textAlign: "center" }}>{MONTHS[month]} {year}</span>
          <button onClick={() => setViewDate(new Date(year, month + 1, 1))} style={btn}>›</button>
          <button onClick={() => { setViewDate(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(null); }} style={{ ...btn, color: C.accent }}>Today</button>
        </div>
      </div>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: `1px solid ${C.border}` }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} style={{ padding: "10px 0", textAlign: "center", fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} style={{ minHeight: 80, borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: C.bg }} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1; const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            const regsHere = regsByDay[day] || []; const isSel = selectedDay === day;
            return (<div key={day} onClick={() => setSelectedDay(isSel ? null : day)} style={{ minHeight: 80, borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: 8, cursor: "pointer", background: isSel ? "rgba(99,102,241,0.08)" : "transparent", transition: "background 0.15s" }}>
              <div style={{ fontSize: 13, fontWeight: 700, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", marginBottom: 4, background: isToday ? C.accent : "transparent", color: isToday ? "#fff" : C.muted }}>{day}</div>
              {regsHere.slice(0, 2).map(r => { const col = urgencyColor(daysUntil(r.deadline)); return (<div key={r.id} style={{ fontSize: 11, padding: "2px 5px", borderRadius: 4, marginBottom: 2, background: `${col}20`, color: col, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{r.name.substring(0, 16)}</div>); })}
              {regsHere.length > 2 && <div style={{ fontSize: 11, color: C.muted }}>+{regsHere.length - 2} more</div>}
            </div>);
          })}
        </div>
      </div>
      {selectedDay && (regsByDay[selectedDay] || []).length > 0 && (
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginTop: 14 }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: 15, marginBottom: 14 }}>{MONTHS[month]} {selectedDay}, {year} — {(regsByDay[selectedDay] || []).length} deadline{(regsByDay[selectedDay] || []).length !== 1 ? "s" : ""}</div>
          {(regsByDay[selectedDay] || []).map(r => { const days = daysUntil(r.deadline); return (<div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${C.border}` }}><div><div style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>{r.name}</div><div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{r.reference} · {r.region}</div></div><div style={{ textAlign: "right", flexShrink: 0 }}><Badge text={scopeMap[r.id] || "Pending"} style={scopeStyle(scopeMap[r.id] || "Pending")} /><div style={{ fontSize: 12, marginTop: 6, color: urgencyColor(days) }}>{days === 0 ? "Today" : days < 0 ? `${Math.abs(days)}d past` : `${days}d`}</div></div></div>); })}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => storage.get(SESSION_KEY, false));
  const [view, setView] = useState("dashboard");
  const [scopeMap, setScopeMap] = useState(() => storage.get(SCOPE_KEY, {}));
  const [analysisMap, setAnalysisMap] = useState(() => storage.get(ANALYSIS_KEY, {}));
  const [deletedIds, setDeletedIds] = useState(() => storage.get("delphi_deleted", []));
  const [deletedControlIds, setDeletedControlIds] = useState(() => storage.get("delphi_deleted_controls", []));
  const [isAdmin, setIsAdmin] = useState(() => storage.get("delphi_admin", false));
  const [analyzeRegId, setAnalyzeRegId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  // Instant load from localStorage (no loading screen), then background sync from JSONBin
  useEffect(() => {
    (async () => {
      try {
        const rec = await jbGet();
        if (rec.delphi_scope && Object.keys(rec.delphi_scope).length > 0) {
          setScopeMap({ ...rec.delphi_scope });
          storage.set(SCOPE_KEY, rec.delphi_scope);
        }
        if (rec.delphi_analyses && Object.keys(rec.delphi_analyses).length > 0) {
          setAnalysisMap({ ...rec.delphi_analyses });
          storage.set(ANALYSIS_KEY, rec.delphi_analyses);
        } else {
          const local = storage.get(ANALYSIS_KEY, {});
          if (Object.keys(local).length > 0) jbSet("delphi_analyses", local);
        }
        if (!rec.delphi_scope) {
          const local = storage.get(SCOPE_KEY, {});
          if (Object.keys(local).length > 0) jbSet("delphi_scope", local);
        }
        setLastSync(new Date());
      } catch (e) { console.error("Background sync failed", e); }
    })();
  }, []);

  // Sync when switching tabs
  useEffect(() => {
    (async () => {
      try {
        const rec = await jbGet();
        if (rec.delphi_scope && Object.keys(rec.delphi_scope).length > 0) setScopeMap(p => JSON.stringify(p) !== JSON.stringify(rec.delphi_scope) ? { ...rec.delphi_scope } : p);
        if (rec.delphi_analyses && Object.keys(rec.delphi_analyses).length > 0) setAnalysisMap(p => JSON.stringify(p) !== JSON.stringify(rec.delphi_analyses) ? { ...rec.delphi_analyses } : p);
        setLastSync(new Date());
      } catch {}
    })();
  }, [view]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const rec = await jbGet();
      if (rec.delphi_scope && Object.keys(rec.delphi_scope).length > 0) { setScopeMap({ ...rec.delphi_scope }); storage.set(SCOPE_KEY, rec.delphi_scope); }
      if (rec.delphi_analyses && Object.keys(rec.delphi_analyses).length > 0) { setAnalysisMap({ ...rec.delphi_analyses }); storage.set(ANALYSIS_KEY, rec.delphi_analyses); }
      setLastSync(new Date());
    } catch { }
    setSyncing(false);
  };

  const allRegs = useMemo(() => { const d = new Set(deletedIds); return REGULATIONS.filter(r => !d.has(r.id)); }, [deletedIds]);
  const inScopeCount = useMemo(() => Object.values(scopeMap).filter(v => v === "In Scope").length, [scopeMap]);
  const login = () => { setAuthed(true); storage.set(SESSION_KEY, true); };
  const logout = () => { setAuthed(false); storage.set(SESSION_KEY, false); };
  const setScopeFor = useCallback((id, val) => { setScopeMap(prev => { const n = { ...prev, [id]: val }; jbSet("delphi_scope", n); storage.set(SCOPE_KEY, n); return n; }); }, []);
  const onAnalysisComplete = useCallback((id, data) => { setAnalysisMap(prev => { const n = { ...prev, [id]: data }; jbSet("delphi_analyses", n); storage.set(ANALYSIS_KEY, n); return n; }); }, []);
  const onDelete = useCallback((id) => { setDeletedIds(prev => { const n = [...prev, id]; storage.set("delphi_deleted", n); return n; }); }, []);
  const onDeleteControl = useCallback((id) => { setDeletedControlIds(prev => { const n = [...prev, id]; storage.set("delphi_deleted_controls", n); return n; }); }, []);

  if (!authed) return <Login onLogin={login} />;

  const vp = { allRegs, scopeMap, analysisMap };
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
      <style>{G}</style>
      <Sidebar active={view} onNav={setView} onLogout={logout} totalRegs={allRegs.length} inScope={inScopeCount} />
      <main style={{ marginLeft: 248, minHeight: "100vh" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "28px 36px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginBottom: 22, alignItems: "center" }}>
            {lastSync && <span style={{ fontSize: 12, color: C.muted }}>Synced {lastSync.toLocaleTimeString()}</span>}
            <button onClick={syncNow} disabled={syncing} style={{ fontSize: 13, padding: "7px 16px", borderRadius: 8, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: syncing ? C.muted : C.accent, opacity: syncing ? 0.6 : 1 }}>{syncing ? "Syncing..." : "↻ Sync"}</button>
            <button onClick={() => { const v = !isAdmin; setIsAdmin(v); storage.set("delphi_admin", v); }} style={{ fontSize: 13, padding: "7px 16px", borderRadius: 8, cursor: "pointer", border: `1px solid ${isAdmin ? C.redBorder : C.border}`, background: isAdmin ? C.redBg : "transparent", color: isAdmin ? C.red : C.muted }}>{isAdmin ? "Admin Mode ON" : "Admin Mode"}</button>
          </div>
          {view === "dashboard" && <Dashboard {...vp} />}
          {view === "inventory" && <Inventory {...vp} onScopeChange={setScopeFor} onDelete={onDelete} isAdmin={isAdmin} onAnalyzeClick={(id) => { setAnalyzeRegId(id); setView("analyze"); }} />}
          {view === "analyze" && <Analyze {...vp} onScopeChange={setScopeFor} onAnalysisComplete={onAnalysisComplete} initialRegId={analyzeRegId} onAnalyzeDone={() => setAnalyzeRegId(null)} />}
          {view === "controls" && <Controls {...vp} isAdmin={isAdmin} onDeleteControl={onDeleteControl} deletedControlIds={deletedControlIds} />}
          {view === "timeline" && <Timeline {...vp} />}
          {view === "calendar" && <Calendar {...vp} />}
        </div>
      </main>
    </div>
  );
}
