import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { REGULATIONS, CONTROLS_LIBRARY, DOMAINS, REGIONS, MARSH_ENTITIES } from "./regulatoryData";

const PROXY_URL = "https://delphi-proxy.vercel.app/api/claude";
const MODEL = "claude-sonnet-4-6"; // Update this when Anthropic releases new models
const SESSION_KEY = "delphi_auth";
const SCOPE_KEY = "delphi_scope";
const ANALYSIS_KEY = "delphi_analyses";
const URLS_KEY = "delphi_urls";
const INGESTED_KEY = "delphi_ingested"; // regulations ingested from URL scans
const JSONBIN_KEY = "$2a$10$nY52ddUvcB.nOkkqL2Rz5.FLU7LeIE4hyH7O1tOJ7SoHvU7di65Xi";
const JSONBIN_BIN = "69f39261856a6821898fd552";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN}`;
const JH = { "Content-Type": "application/json", "X-Master-Key": JSONBIN_KEY };

const storage = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Apply saved theme to document immediately (before React renders) to prevent flash
(function() {
  const savedTheme = storage.get("delphi_theme", "dark");
  const bg = savedTheme === "light" ? "#f0f4f8" : "#070910";
  document.documentElement.style.background = bg;
  document.body.style.background = bg;
  if (savedTheme === "light") {
    // Also update pre-load screen colors for light theme
    const preLoad = document.getElementById("pre-load");
    if (preLoad) {
      preLoad.style.background = "#f0f4f8";
      const title = preLoad.querySelector(".pre-title");
      if (title) title.style.color = "#0f172a";
      const sub = preLoad.querySelector(".pre-sub");
      if (sub) sub.style.color = "#475569";
    }
  }
})();

async function jbGet() {
  try { const r = await fetch(JSONBIN_URL + "/latest", { headers: JH, cache: "no-store" }); const d = await r.json(); return d.record || {}; } catch { return {}; }
}
async function jbSet(key, value) {
  try { const rec = await jbGet(); const up = { ...rec, [key]: value }; await fetch(JSONBIN_URL, { method: "PUT", headers: JH, body: JSON.stringify(up) }); } catch {}
}

const DARK_THEME = {
  bg: "#070910", panel: "#0e1118", panel2: "#151a24", border: "#232d3f",
  text: "#ffffff", muted: "#b8c5d6", accent: "#818cf8", accentHover: "#a5b4fc",
  green: "#34d399", greenBg: "rgba(52,211,153,0.1)", greenBorder: "rgba(52,211,153,0.3)",
  red: "#f87171", redBg: "rgba(248,113,113,0.1)", redBorder: "rgba(248,113,113,0.3)",
  amber: "#fbbf24", amberBg: "rgba(251,191,36,0.1)", amberBorder: "rgba(251,191,36,0.3)",
  blue: "#60a5fa", blueBg: "rgba(96,165,250,0.1)", blueBorder: "rgba(96,165,250,0.3)",
  indigo: "#818cf8", indigoBg: "rgba(129,140,248,0.1)", indigoBorder: "rgba(129,140,248,0.3)",
  purple: "#c084fc", purpleBg: "rgba(192,132,252,0.1)", purpleBorder: "rgba(192,132,252,0.3)",
};

const LIGHT_THEME = {
  bg: "#f0f4f8", panel: "#ffffff", panel2: "#f5f7fa", border: "#dde3ed",
  text: "#0f172a", muted: "#475569", accent: "#4f46e5", accentHover: "#6366f1",
  green: "#059669", greenBg: "rgba(5,150,105,0.08)", greenBorder: "rgba(5,150,105,0.25)",
  red: "#dc2626", redBg: "rgba(220,38,38,0.08)", redBorder: "rgba(220,38,38,0.25)",
  amber: "#d97706", amberBg: "rgba(217,119,6,0.08)", amberBorder: "rgba(217,119,6,0.25)",
  blue: "#2563eb", blueBg: "rgba(37,99,235,0.08)", blueBorder: "rgba(37,99,235,0.25)",
  indigo: "#4f46e5", indigoBg: "rgba(79,70,229,0.08)", indigoBorder: "rgba(79,70,229,0.25)",
  purple: "#7c3aed", purpleBg: "rgba(124,58,237,0.08)", purpleBorder: "rgba(124,58,237,0.25)",
};

// C is set dynamically - initialized to dark, updated when theme changes
let C = { ...DARK_THEME };

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

const getGlobalStyles = (theme) => `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{background:${theme === "light" ? "#f0f4f8" : "#070910"};color:${theme === "light" ? "#0f172a" : "#ffffff"};font-family:'Inter',system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased;}
input,select,button,textarea{font-family:inherit;font-size:14px;}
::-webkit-scrollbar{width:6px;height:6px;}
::-webkit-scrollbar-thumb{background:${theme === "light" ? "#cbd5e1" : "#1c2333"};border-radius:6px;}
::-webkit-scrollbar-track{background:transparent;}
@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 0.8s linear infinite;}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.fadeIn{animation:fadeIn 0.25s ease}
table{border-collapse:collapse;width:100%;}
tr:hover td{background:${theme === "light" ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.015)"};}
`;
const G = getGlobalStyles("dark"); // default, will be overridden by App

function Login({ onLogin, theme, toggleTheme }) {
  C = theme === "light" ? { ...LIGHT_THEME } : { ...DARK_THEME };
  // Update HTML background to match theme (prevents flash on reload)
  useEffect(() => {
    document.documentElement.style.background = theme === "light" ? "#f0f4f8" : "#070910";
    document.body.style.background = theme === "light" ? "#f0f4f8" : "#070910";
  }, [theme]);
  const [pw, setPw] = useState(""); const [err, setErr] = useState("");
  const go = () => pw === "Regscan" ? onLogin() : setErr("Incorrect password.");
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative" }}>
      {toggleTheme && <button onClick={toggleTheme} style={{ position: "absolute", top: 20, right: 20, fontSize: 20, padding: "6px 10px", borderRadius: 9, cursor: "pointer", border: `1px solid ${C.border}`, background: C.panel, color: C.text }} title="Toggle theme">{theme === "dark" ? "☀️" : "🌙"}</button>}
      <style>{getGlobalStyles(theme || "dark")}</style>
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

function WorldHeatmap({ allRegs, scopeMap, theme }) {
  const svgRef = useRef(null);
  const [geoData, setGeoData] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 960, h: 500 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(null);

  const isDark = theme !== "light";

  const countryData = useMemo(() => {
    const map = {};
    allRegs.forEach(r => {
      (REGION_COUNTRIES[r.region] || []).forEach(c => {
        if (!map[c]) map[c] = { total: 0, inScope: 0 };
        map[c].total++;
        if ((scopeMap[r.id] || "Pending") === "In Scope") map[c].inScope++;
      });
    });
    return map;
  }, [allRegs, scopeMap]);

  const maxCount = useMemo(() => Math.max(1, ...Object.values(countryData).map(d => d.total)), [countryData]);

  const ISO3MAP = useMemo(() => ({
    "840":"USA","276":"DEU","250":"FRA","826":"GBR","392":"JPN","156":"CHN",
    "356":"IND","036":"AUS","124":"CAN","076":"BRA","710":"ZAF","566":"NGA",
    "702":"SGP","344":"HKG","784":"ARE","682":"SAU","372":"IRL","528":"NLD",
    "756":"CHE","380":"ITA","724":"ESP","752":"SWE","578":"NOR","208":"DNK",
    "056":"BEL","040":"AUT","616":"POL","203":"CZE","484":"MEX","032":"ARG",
    "152":"CHL","170":"COL","410":"KOR","158":"TWN","360":"IDN","458":"MYS",
    "764":"THA","608":"PHL","554":"NZL","376":"ISR","792":"TUR","818":"EGY",
    "404":"KEN","288":"GHA","504":"MAR",
  }), []);

  // Load topojson once
  useEffect(() => {
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then(r => r.json()).then(setGeoData).catch(() => {});
  }, []);

  // Convert topojson to SVG path strings
  const svgPaths = useMemo(() => {
    if (!geoData?.objects?.countries?.geometries || !geoData.arcs) return [];
    const { scale: [kx, ky], translate: [tx, ty] } = geoData.transform;
    const W = 960, H = 500;

    // Decode all arcs to [x,y] mercator coords
    const decodedArcs = geoData.arcs.map(arc => {
      let ax = 0, ay = 0;
      return arc.map(([dx, dy]) => {
        ax += dx; ay += dy;
        const lon = ax * kx + tx;
        const lat = ay * ky + ty;
        // Mercator projection
        const x = (lon + 180) * (W / 360);
        const latR = (lat * Math.PI) / 180;
        const mercN = Math.log(Math.tan(Math.PI / 4 + latR / 2));
        const y = Math.max(0, Math.min(H, H / 2 - (W * mercN) / (2 * Math.PI)));
        return [x, y];
      });
    });

    // Build path string from ring - M once at start, L everywhere else
    const ringToPath = (ring) => {
      const allPts = [];
      ring.forEach(arcIdx => {
        const pts = arcIdx < 0 ? [...decodedArcs[~arcIdx]].reverse() : decodedArcs[arcIdx];
        // Skip first point of each arc after the first (it's the same as the last of the previous)
        pts.forEach((pt, i) => {
          if (allPts.length === 0 || i > 0) allPts.push(pt);
        });
      });
      if (allPts.length === 0) return "";
      return "M" + allPts.map(([x, y]) => x.toFixed(1) + "," + y.toFixed(1)).join("L") + "Z";
    };

    return geoData.objects.countries.geometries.map(geom => {
      const numId = String(geom.id ?? "").padStart(3, "0");
      const iso3 = ISO3MAP[numId] || "";
      const data = countryData[Object.entries(ISO3_TO_NAME).find(([k]) => k === iso3)?.[1]] || null;
      const intensity = data ? Math.min(1, data.total / maxCount) : 0;

      let fill;
      if (isDark) {
        if (!data) fill = "#111c2e";
        else {
          // Teal gradient dark: deep navy → bright teal
          const r = Math.round(8 + intensity * 4);
          const g = Math.round(30 + intensity * 178);
          const b = Math.round(50 + intensity * 138);
          fill = `rgb(${r},${g},${b})`;
        }
      } else {
        if (!data) fill = "#cdd9e8";
        else {
          // Teal gradient light: pale blue → vivid teal
          const r = Math.round(180 - intensity * 140);
          const g = Math.round(210 - intensity * 30);
          const b = Math.round(220 - intensity * 60);
          fill = `rgb(${r},${g},${b})`;
        }
      }

      const stroke = isDark
        ? (data ? "rgba(0,220,180,0.18)" : "rgba(255,255,255,0.04)")
        : (data ? "rgba(0,120,100,0.2)" : "rgba(100,130,160,0.15)");

      const rings = geom.type === "Polygon" ? geom.arcs
        : geom.type === "MultiPolygon" ? geom.arcs.flat() : [];

      const d = rings.map(ring => ringToPath(ring)).join(" ");
      return { d, fill, stroke, iso3, name: ISO3_TO_NAME[iso3] || "", data };
    });
  }, [geoData, countryData, maxCount, isDark, ISO3MAP]);

  // Zoom/pan handlers
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width * viewBox.w + viewBox.x;
    const my = (e.clientY - rect.top) / rect.height * viewBox.h + viewBox.y;
    const factor = e.deltaY < 0 ? 0.8 : 1.25;
    setViewBox(v => {
      const nw = Math.max(200, Math.min(960, v.w * factor));
      const nh = Math.max(104, Math.min(500, v.h * factor));
      return { x: mx - (mx - v.x) * (nw / v.w), y: my - (my - v.y) * (nh / v.h), w: nw, h: nh };
    });
  }, [viewBox]);

  const handleMouseDown = useCallback((e) => {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, vb: { ...viewBox } };
  }, [viewBox]);

  const handleMouseMove = useCallback((e) => {
    if (dragging && dragStart.current) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = (e.clientX - dragStart.current.x) / rect.width * dragStart.current.vb.w;
      const dy = (e.clientY - dragStart.current.y) / rect.height * dragStart.current.vb.h;
      setViewBox({ ...dragStart.current.vb, x: dragStart.current.vb.x - dx, y: dragStart.current.vb.y - dy });
    }
  }, [dragging]);

  const handleMouseUp = useCallback(() => setDragging(false), []);
  const handleKey = useCallback((e) => {
    if (e.key === "Escape") setViewBox({ x: 0, y: 0, w: 960, h: 500 });
    if (e.key === "+" || e.key === "=") setViewBox(v => ({ x: v.x + v.w*0.1, y: v.y + v.h*0.1, w: v.w*0.8, h: v.h*0.8 }));
    if (e.key === "-") setViewBox(v => { const nw=Math.min(960,v.w*1.25); const nh=Math.min(500,v.h*1.25); return { x: v.x-(nw-v.w)/2, y: v.y-(nh-v.h)/2, w: nw, h: nh }; });
  }, []);

  const ocean = isDark ? "#0a0f1a" : "#d6e4f0";
  const gridColor = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)";
  const vbStr = `${viewBox.x.toFixed(1)} ${viewBox.y.toFixed(1)} ${viewBox.w.toFixed(1)} ${viewBox.h.toFixed(1)}`;

  return (
    <div style={{ background: isDark ? "#0d1520" : "#e8f0f7", border: `2px solid ${C.border}`, borderRadius: 16, overflow: "hidden", marginTop: 20, boxShadow: isDark ? "0 4px 32px rgba(0,0,0,0.5)" : "0 4px 24px rgba(0,0,0,0.1)" }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>Global Regulatory Landscape</div>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { label: "+", action: () => setViewBox(v => ({ x: v.x+v.w*0.1, y: v.y+v.h*0.1, w: v.w*0.8, h: v.h*0.8 })) },
            { label: "−", action: () => setViewBox(v => { const nw=Math.min(960,v.w*1.25); const nh=Math.min(500,v.h*1.25); return { x: v.x-(nw-v.w)/2, y: v.y-(nh-v.h)/2, w: nw, h: nh }; }) },
            { label: "⊡", action: () => setViewBox({ x: 0, y: 0, w: 960, h: 500 }) },
          ].map(({ label, action }) => (
            <button key={label} onClick={action} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", color: C.text, fontSize: label === "⊡" ? 13 : 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ position: "relative" }}
        onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        <svg
          ref={svgRef}
          viewBox={vbStr}
          width="100%" height={480}
          style={{ display: "block", cursor: dragging ? "grabbing" : "grab", background: ocean, userSelect: "none" }}
          onWheel={handleWheel} onMouseDown={handleMouseDown}
          onKeyDown={handleKey} tabIndex={0}
        >
          {/* Ocean grid lines */}
          {[-60,-30,0,30,60].map(lat => {
            const latR = (lat * Math.PI) / 180;
            const mercN = Math.log(Math.tan(Math.PI/4 + latR/2));
            const y = 500/2 - (960 * mercN) / (2 * Math.PI);
            return <line key={lat} x1={0} y1={y} x2={960} y2={y} stroke={gridColor} strokeWidth={0.5} />;
          })}
          {[-150,-120,-90,-60,-30,0,30,60,90,120,150].map(lon => {
            const x = (lon + 180) * (960/360);
            return <line key={lon} x1={x} y1={0} x2={x} y2={500} stroke={gridColor} strokeWidth={0.5} />;
          })}
          {/* Country fills */}
          {svgPaths.map((p, i) => p.d ? (
            <path key={i} d={p.d} fill={p.fill} stroke={p.stroke} strokeWidth={0.3}
              style={{ cursor: p.data ? "pointer" : "default", transition: "fill 0.15s" }}
              onMouseEnter={e => p.name && setTooltip({ name: p.name, x: e.clientX, y: e.clientY, data: p.data })}
              onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
              onMouseLeave={() => setTooltip(null)}
            />
          ) : null)}
        </svg>

        {/* Loading overlay */}
        {!geoData && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: ocean, color: C.muted, fontSize: 13 }}>
            <span className="spin" style={{ display: "inline-block", width: 16, height: 16, border: `2px solid ${C.accent}`, borderTopColor: "transparent", borderRadius: "50%", marginRight: 8 }} />Loading map...
          </div>
        )}

        {/* Legend */}
        <div style={{ position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", textAlign: "center", pointerEvents: "none" }}>
          <div style={{ fontSize: 10, color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5 }}>Regulations Tracked</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)" }}>0</span>
            <div style={{ width: 180, height: 7, borderRadius: 4, background: isDark ? "linear-gradient(to right,#0a1525,#0a4a3a,#00c896)" : "linear-gradient(to right,#c8d9e8,#40b090,#00a878)" }} />
            <span style={{ fontSize: 11, color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)" }}>40+</span>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{ position: "fixed", left: tooltip.x + 14, top: tooltip.y - 12, background: isDark ? "#0f1a2e" : "#ffffff", border: `1px solid ${isDark ? "rgba(0,200,150,0.25)" : "rgba(0,150,100,0.25)"}`, borderRadius: 10, padding: "10px 16px", fontSize: 13, pointerEvents: "none", zIndex: 9999, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", minWidth: 170 }}>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 6, fontSize: 14 }}>{tooltip.name}</div>
          {tooltip.data ? (
            <>
              <div style={{ color: C.muted }}>Regulations: <span style={{ color: isDark ? "#00c896" : "#009970", fontWeight: 600 }}>{tooltip.data.total}</span></div>
              <div style={{ color: C.muted }}>In Scope: <span style={{ color: C.green, fontWeight: 600 }}>{tooltip.data.inScope}</span></div>
              <div style={{ color: C.muted }}>Coverage: <span style={{ color: C.text, fontWeight: 600 }}>{Math.round(tooltip.data.inScope / tooltip.data.total * 100)}%</span></div>
            </>
          ) : <div style={{ color: C.muted, fontStyle: "italic" }}>No regulations mapped</div>}
        </div>
      )}
    </div>
  );
}


function TopControlsChart({ allRegs, scopeMap }) {
  const inScopeIds = useMemo(() => new Set(Object.entries(scopeMap).filter(([,v]) => v === "In Scope").map(([k]) => k)), [scopeMap]);
  const controlFreq = useMemo(() => {
    const counts = {};
    CONTROLS_LIBRARY.forEach(ctrl => {
      const inScopeCount = ctrl.regulations.filter(rId => inScopeIds.has(rId)).length;
      if (inScopeCount > 0) counts[ctrl.title] = { count: inScopeCount, category: ctrl.category, id: ctrl.controlId };
    });
    return Object.entries(counts).sort((a,b) => b[1].count - a[1].count).slice(0, 12);
  }, [inScopeIds]);

  const maxFreq = controlFreq[0]?.[1]?.count || 1;
  const catColors = { "Data Privacy": C.indigo, "Financial Crime": C.amber, "Cyber Security": C.blue, "Capital Markets": C.green, "ESG": "#34d399", "Insurance": "#a78bfa", "Operations": "#f87171", "Governance": "#60a5fa" };

  if (inScopeIds.size === 0) return null;

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 24px", marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>Most Frequently Mandated Controls</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Controls required by the most in-scope regulations</div>
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>{controlFreq.length} controls shown</div>
      </div>
      {controlFreq.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "24px 0" }}>No in-scope regulations — set scope in the Inventory tab</div>
      ) : (
        <div>
          {controlFreq.map(([title, { count, category }]) => {
            const col = catColors[category] || C.accent;
            const pct = (count / maxFreq) * 100;
            return (
              <div key={title} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>{title}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: col, background: `${col}18`, border: `1px solid ${col}30`, borderRadius: 4, padding: "1px 7px", fontWeight: 600 }}>{category}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text, minWidth: 20, textAlign: "right" }}>{count}</span>
                    </div>
                  </div>
                  <div style={{ height: 7, background: C.panel2, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(to right, ${col}aa, ${col})`, borderRadius: 4, transition: "width 0.6s ease" }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


function Dashboard({ allRegs, scopeMap, analysisMap, theme }) {
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
        <StatCard label="Jurisdictions" value={jurisdictionCount} sub="Regulatory regions" color="indigo" />
        <StatCard label="Countries" value={countryCount} sub="Nations covered" color="indigo" />
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
      <WorldHeatmap allRegs={allRegs} scopeMap={scopeMap} theme={theme} />
      <TopControlsChart allRegs={allRegs} scopeMap={scopeMap} />
    </div>
  );
}

function Inventory({ allRegs, scopeMap, onScopeChange, analysisMap, onDelete, isAdmin, onAnalyzeClick, ingestedRegs, onUpdateIngested, onClearChanges }) {
  const [search, setSearch] = useState(""); const [domain, setDomain] = useState("All"); const [region, setRegion] = useState("All"); const [scope, setScope] = useState("All"); const [page, setPage] = useState(1); const [delConfirm, setDelConfirm] = useState(null); const PER = 20;
  const [sortField, setSortField] = useState("name"); const [sortDir, setSortDir] = useState("asc");
  const toggleSort = (field) => { if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(field); setSortDir("asc"); } };
  const [editingReg, setEditingReg] = useState(null); const [editFields, setEditFields] = useState({});
  const filtered = useMemo(() => { let list = [...allRegs]; if (search) { const q = search.toLowerCase(); list = list.filter(r => r.name.toLowerCase().includes(q) || r.reference.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || (r.tags || []).some(t => t.toLowerCase().includes(q))); } if (domain !== "All") list = list.filter(r => r.domain === domain); if (region !== "All") list = list.filter(r => r.region === region); if (scope !== "All") list = list.filter(r => (scopeMap[r.id] || "Pending") === scope); list.sort((a,b) => { let av = a[sortField]||""; let bv = b[sortField]||""; if (sortField==="deadline") { av=av||"9999"; bv=bv||"9999"; } return sortDir==="asc" ? av.localeCompare(bv) : bv.localeCompare(av); }); return list; }, [allRegs, search, domain, region, scope, scopeMap, sortField, sortDir]);
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
                <th style={{ ...th, width: 90, cursor:"pointer" }} onClick={()=>toggleSort("id")}>ID {sortField==="id"?(sortDir==="asc"?"↑":"↓"):"⇅"}</th>
                <th style={{ ...th, cursor:"pointer" }} onClick={()=>toggleSort("name")}>Regulation {sortField==="name"?(sortDir==="asc"?"↑":"↓"):"⇅"}</th>
                <th style={{ ...th, width: 90, cursor:"pointer" }} onClick={()=>toggleSort("region")}>Region {sortField==="region"?(sortDir==="asc"?"↑":"↓"):"⇅"}</th>
                <th style={{ ...th, width: 140, cursor:"pointer" }} onClick={()=>toggleSort("domain")}>Domain {sortField==="domain"?(sortDir==="asc"?"↑":"↓"):"⇅"}</th>
                <th style={{ ...th, width: 100 }}>Status</th>
                <th style={{ ...th, width: 110 }}>Scope</th>
                <th style={{ ...th, width: 140, cursor:"pointer" }} onClick={()=>toggleSort("deadline")}>Deadline {sortField==="deadline"?(sortDir==="asc"?"↑":"↓"):"⇅"}</th>
                <th style={{ ...th, width: 200 }}>Set Scope</th>
                <th style={{ ...th, width: 110 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(r => {
                const rs = analysisMap[r.id] ? "Analyzed" : r.status; const cs = scopeMap[r.id] || "Pending"; const days = daysUntil(r.deadline);
                return (<tr key={r.id}>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 12, color: C.muted }}>{r.id}</td>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ fontWeight: 600, color: C.text, fontSize: 14, maxWidth: 300 }}>{r.name}</div>
                          {r.isIngested && <span style={{ fontSize: 10, color: C.indigo, background: C.indigoBg, border: `1px solid ${C.indigoBorder}`, borderRadius: 4, padding: "1px 6px", flexShrink: 0 }}>ingested</span>}
                          {r.hasChanges && (
                            <span title="Changes detected — re-analysis recommended" style={{ fontSize: 10, color: C.amber, background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 4, padding: "1px 6px", flexShrink: 0, cursor: "default" }}>⚠ updated</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{r.reference}</div>
                        {r.isIngested && r.sourceTitle && (
                          <div style={{ fontSize: 11, color: C.indigo, marginTop: 2 }}>↗ {r.sourceTitle}</div>
                        )}
                      </div>
                      {r.isIngested && onUpdateIngested && (
                        <button onClick={() => { setEditingReg(r); setEditFields({ deadline: r.deadline || "", summary: r.summary || "", effectiveDate: r.effectiveDate || "" }); }} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer", flexShrink: 0 }} title="Edit regulation details">✎</button>
                      )}
                    </div>
                  </td>
                  <td style={{ ...td, fontSize: 13 }}>{r.region}</td>
                  <td style={td}><Badge text={r.domain} /></td>
                  <td style={td}><Badge text={rs} style={statusStyle(rs)} /></td>
                  <td style={td}><Badge text={cs} style={scopeStyle(cs)} /></td>
                  <td style={{ ...td, fontSize: 13, whiteSpace: "nowrap" }}>{r.deadline ? <span style={{ color: urgencyColor(days) }}>{formatDeadline(r.deadline)}{days !== null && days >= 0 && <span style={{ color: C.muted, marginLeft: 4 }}>({days}d)</span>}</span> : <span style={{ color: C.border }}>—</span>}</td>
                  <td style={td}><div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <select value={cs} onChange={e => onScopeChange(r.id, e.target.value)} style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 7, padding: "5px 10px", fontSize: 13, cursor: "pointer", outline: "none" }}><option>Pending</option><option>In Scope</option><option>Out of Scope</option></select>
                    {isAdmin && <button onClick={() => confirmDel(r.id)} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: `1px solid ${delConfirm === r.id ? C.red : C.border}`, background: delConfirm === r.id ? C.redBg : "transparent", color: delConfirm === r.id ? C.red : C.muted, cursor: "pointer" }}>{delConfirm === r.id ? "Confirm" : "✕"}</button>}
                  </div></td>
                  <td style={td}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <button onClick={() => onAnalyzeClick(r.id)} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 7, border: `1px solid ${analysisMap[r.id] ? C.indigoBorder : C.border}`, background: analysisMap[r.id] ? C.indigoBg : "transparent", color: analysisMap[r.id] ? C.indigo : C.muted, cursor: "pointer", whiteSpace: "nowrap" }}>⚡ {analysisMap[r.id] ? "View Analysis" : "Analyze"}</button>
                      {r.hasChanges && analysisMap[r.id] && (
                        <button onClick={() => { if (onClearChanges) onClearChanges(r.id); onAnalyzeClick(r.id); }} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.amberBorder}`, background: C.amberBg, color: C.amber, cursor: "pointer", whiteSpace: "nowrap" }}>↻ Re-analyze</button>
                      )}
                    </div>
                  </td>
                </tr>);
              })}
              {paged.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: C.muted, padding: "56px 0" }}>No regulations match your filters</td></tr>}
            </tbody>
          </table>
        </div>
              {/* Edit Ingested Regulation Modal */}
      {editingReg && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setEditingReg(null)}>
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: 540, maxWidth: "90vw" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 4 }}>Edit Regulation</div>
            <div style={{ fontSize: 13, color: C.indigo, marginBottom: 18 }}>{editingReg.name}</div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Deadline (YYYY-MM-DD)</label>
              <input value={editFields.deadline} onChange={e => setEditFields(f => ({ ...f, deadline: e.target.value }))} placeholder="2025-12-31" style={{ width: "100%", background: C.panel2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "10px 14px", fontSize: 14, outline: "none" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Effective Date (YYYY-MM-DD)</label>
              <input value={editFields.effectiveDate} onChange={e => setEditFields(f => ({ ...f, effectiveDate: e.target.value }))} placeholder="2024-01-01" style={{ width: "100%", background: C.panel2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "10px 14px", fontSize: 14, outline: "none" }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Summary / Key Changes</label>
              <textarea value={editFields.summary} onChange={e => setEditFields(f => ({ ...f, summary: e.target.value }))} rows={4} style={{ width: "100%", background: C.panel2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "10px 14px", fontSize: 14, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setEditingReg(null)} style={{ padding: "9px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 14, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => { onUpdateIngested(editingReg.id, editFields); setEditingReg(null); }} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
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

function Analyze({ allRegs, scopeMap, onScopeChange, analysisMap, onAnalysisComplete, initialRegId, onAnalyzeDone, savedUrls: externalUrls, onSaveUrls, ingestedRegs, onIngest, onUpdateIngested }) {
  const [selected, setSelected] = useState(initialRegId || "");
  const [searchQ, setSearchQ] = useState(""); const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState(null);
  // File upload state
  const [uploadedFile, setUploadedFile] = useState(null);
  const [fileContent, setFileContent] = useState("");
  const [fileResult, setFileResult] = useState(null); // current file's analysis result
  const [viewingFileResult, setViewingFileResult] = useState(null); // for "View Analysis" navigation
  // URL management state - always backed by remote store via onSaveUrls
  const [localUrls, setLocalUrls] = useState(externalUrls || storage.get("delphi_urls", []));
  // Keep local copy in sync when external changes (e.g. after remote sync)
  useEffect(() => { if (externalUrls) setLocalUrls(externalUrls); }, [externalUrls]);
  const urls = localUrls;
  const setUrls = (newList) => {
    setLocalUrls(newList);
    if (onSaveUrls) onSaveUrls(newList); // persists to JSONBin + localStorage
    else storage.set("delphi_urls", newList);
  };
  const [newUrl, setNewUrl] = useState(""); const [newTitle, setNewTitle] = useState(""); const [editingUrl, setEditingUrl] = useState(null); const [editVal, setEditVal] = useState(""); const [editTitleVal, setEditTitleVal] = useState("");
  const [collapsedUrls, setCollapsedUrls] = useState({});
  const toggleCollapse = (id) => setCollapsedUrls(p => ({ ...p, [id]: !p[id] }));
  const [crawling, setCrawling] = useState(null);
  const [urlResults, setUrlResults] = useState(() => {
    // Restore persisted scan results from saved URLs
    const init = {};
    (externalUrls || storage.get("delphi_urls", [])).forEach(u => {
      if (u.scanResult) init[u.id] = u.scanResult;
    });
    return init;
  });
  const [activeTab, setActiveTab] = useState("regulation"); // regulation | file | url | bulk
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, current: "", errors: [] });
  const [bulkFilter, setBulkFilter] = useState("All"); // All | In Scope | Pending | Not Analyzed

  const reg = allRegs.find(r => r.id === selected);
  // When viewing a file/url result on regulation tab, show that result
  useEffect(() => {
    if (activeTab !== "regulation") setViewingFileResult(null);
  }, [activeTab]);
  useEffect(() => { if (initialRegId) { setSelected(initialRegId); setActiveTab("regulation"); if (onAnalyzeDone) onAnalyzeDone(); } }, [initialRegId]);
  useEffect(() => { setResult(selected && analysisMap[selected] ? analysisMap[selected] : null); }, [selected, analysisMap]);
  const filteredRegs = useMemo(() => { if (!searchQ) return allRegs; const q = searchQ.toLowerCase(); return allRegs.filter(r => r.name.toLowerCase().includes(q) || r.reference.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)); }, [allRegs, searchQ]);
  const selectReg = (id) => { setSelected(id); setSearchQ(""); setShowDropdown(false); };
  const inScopeIds = useMemo(() => new Set(Object.entries(scopeMap).filter(([, v]) => v === "In Scope").map(([k]) => k)), [scopeMap]);

  const saveUrls = (newList) => setUrls(newList);
  const addUrl = () => {
    if (!newUrl.trim()) return;
    const u = newUrl.trim().startsWith("http") ? newUrl.trim() : "https://" + newUrl.trim();
    const title = newTitle.trim() || u;
    saveUrls([...urls, { id: Date.now(), url: u, label: u, title, added: new Date().toISOString() }]);
    setNewUrl(""); setNewTitle("");
  };
  const deleteUrl = (id) => {
    setUrlResults(prev => { const n = {...prev}; delete n[id]; return n; });
    saveUrls(urls.filter(u => u.id !== id));
  };
  const startEdit = (u) => { setEditingUrl(u.id); setEditVal(u.label || u.url); setEditTitleVal(u.title || u.label || u.url); };
  const saveEdit = (id) => { saveUrls(urls.map(u => u.id === id ? { ...u, label: editVal, title: editTitleVal } : u)); setEditingUrl(null); };

  const crawlUrl = async (urlObj) => {
    setCrawling(urlObj.id);
    // Update URL entry to show scanning status (persisted)
    const updatedWithStatus = urls.map(u => u.id === urlObj.id ? { ...u, scanStatus: "scanning", lastScanned: new Date().toISOString() } : u);
    setUrls(updatedWithStatus);
    setUrlResults(prev => ({ ...prev, [urlObj.id]: { type: "loading", summary: "Step 1/3: Fetching page and identifying regulations..." } }));

    try {
      // Step 1: Scan the root URL and find regulations + hyperlinks
      const step1Res = await fetch(PROXY_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL, max_tokens: 4000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: `You are a regulatory compliance analyst. Search for and analyze: ${urlObj.url}

TASK:
1. Fetch and read the content at this URL
2. Identify all regulations, laws, directives, or compliance requirements mentioned
3. Find all hyperlinks on the page that point to specific regulation documents (look for links containing words like: regulation, directive, law, act, rule, compliance, guidance, circular, notice)
4. For each regulation found directly on the page OR linked from the page, extract full details

Return ONLY this JSON (no markdown):
{"type":"regulation|site","siteDescription":"what this page is about","regulations":[{"name":"Full name","reference":"Official citation","jurisdiction":"Country/region","domain":"e.g. Data Privacy","summary":"Key obligations in 2-3 sentences","effectiveDate":"YYYY-MM-DD or empty","deadline":"YYYY-MM-DD or empty","sourceUrl":"direct URL to this specific regulation if found"}],"regulationLinks":["url1","url2","url3"]}

regulationLinks should contain up to 10 URLs from the page that likely lead to specific regulation documents. Always populate regulations with whatever you find directly on the page first.` }]
        })
      });
      const d1 = await step1Res.json();
      const t1 = (d1.content || []).filter(b => b.type === "text").map(b => b.text).join("").replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/,"").trim();
      let parsed1;
      try { parsed1 = JSON.parse(t1); } catch { const m = t1.match(/\{[\s\S]*\}/); try { parsed1 = m ? JSON.parse(m[0]) : null; } catch { parsed1 = null; } }

      if (!parsed1) {
        setUrlResults(prev => ({ ...prev, [urlObj.id]: { type: "error", summary: "Could not parse response. Try a more specific regulation URL." } }));
        setCrawling(null); return;
      }

      // Show initial results immediately
      setUrlResults(prev => ({ ...prev, [urlObj.id]: { ...parsed1, crawling: true, summary: `Found ${parsed1.regulations?.length || 0} regulations. Crawling ${parsed1.regulationLinks?.length || 0} linked pages...` } }));

      // Step 2: Deep crawl linked regulation pages
      const links = (parsed1.regulationLinks || []).slice(0, 6); // max 6 deep links
      let allRegsFound = [...(parsed1.regulations || [])];

      if (links.length > 0) {
        setUrlResults(prev => ({ ...prev, [urlObj.id]: { ...parsed1, crawling: true, summary: `Step 2/3: Deep crawling ${links.length} regulation links...` } }));

        const deepRes = await fetch(PROXY_URL, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL, max_tokens: 4000,
            tools: [{ type: "web_search_20250305", name: "web_search" }],
            messages: [{ role: "user", content: `You are a regulatory compliance analyst. I need you to fetch and analyze each of these regulation URLs and extract full compliance details from each one:

${links.map((l, i) => `${i + 1}. ${l}`).join("\\n")}

For each URL, fetch the content and extract the regulation details. Return ONLY this JSON:
{"regulations":[{"name":"Full regulation name","reference":"Official citation","jurisdiction":"Country/region","domain":"Regulatory domain","summary":"Key obligations 2-3 sentences","effectiveDate":"YYYY-MM-DD or empty","deadline":"YYYY-MM-DD or empty","sourceUrl":"the URL you fetched"}]}

Include ALL regulations found across all URLs. Deduplicate if the same regulation appears in multiple links.` }]
          })
        });

        const d2 = await deepRes.json();
        const t2 = (d2.content || []).filter(b => b.type === "text").map(b => b.text).join("").replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/,"").trim();
        let parsed2;
        try { parsed2 = JSON.parse(t2); } catch { const m = t2.match(/\{[\s\S]*\}/); try { parsed2 = m ? JSON.parse(m[0]) : null; } catch { parsed2 = null; } }
        if (parsed2?.regulations?.length > 0) {
          // Merge, deduplicate by reference
          const existing = new Set(allRegsFound.map(r => r.reference));
          parsed2.regulations.forEach(r => { if (!existing.has(r.reference)) { allRegsFound.push(r); existing.add(r.reference); } });
        }
      }

      // Step 3: Final result
      const finalResult = {
        type: parsed1.type,
        siteDescription: parsed1.siteDescription,
        regulations: allRegsFound,
        regulationLinks: links,
        crawledAt: new Date().toISOString(),
        crawling: false,
      };

      setUrlResults(prev => ({ ...prev, [urlObj.id]: finalResult }));

      // Persist scan results alongside the URL
      const finalUrls = urls.map(u => u.id === urlObj.id
        ? { ...u, scanStatus: "done", lastScanned: new Date().toISOString(), scanResult: finalResult }
        : u
      );
      setUrls(finalUrls);

    } catch (e) {
      setUrlResults(prev => ({ ...prev, [urlObj.id]: { type: "error", summary: e.message } }));
      const errUrls = urls.map(u => u.id === urlObj.id ? { ...u, scanStatus: "error" } : u);
      setUrls(errUrls);
    }
    setCrawling(null);
  };


  // Run full analysis on a regulation found via URL scan
  const analyzeScannedReg = async (scannedReg, regKey) => {
    setActiveTab("regulation");
    setResult(null);
    setLoading(true); setError("");
    try {
      const fakeReg = {
        name: scannedReg.name, reference: scannedReg.reference,
        region: scannedReg.jurisdiction, domain: scannedReg.domain || "Compliance",
        summary: scannedReg.summary, effectiveDate: scannedReg.effectiveDate || "",
        deadline: scannedReg.deadline || "", marshEntities: [],
      };
      const thisRegControls = CONTROLS_LIBRARY.filter(c => c.regulations.includes(selected));
      const otherControls = CONTROLS_LIBRARY.filter(c => !c.regulations.includes(selected) && c.regulations.some(rId => inScopeIds.has(rId)));
      const prompt = `You are a regulatory compliance expert. Respond with ONLY a valid JSON object - no markdown, no backticks, no text outside JSON. No newlines inside string values.

Regulation: ${fakeReg.name} (${fakeReg.reference}) | ${fakeReg.region} | ${fakeReg.domain}
Summary: ${fakeReg.summary}
Marsh entities in scope: Unknown - assess based on regulation content and jurisdiction

Controls ALREADY MAPPED: ${thisRegControls.map(c => c.title).join(", ") || "None"}
Controls from other in-scope regulations: ${otherControls.map(c => c.title).join(", ") || "None"}

Return this exact JSON (string values max 25 words, reasons max 10 words):
{"executiveSummary":"2 sentence summary","businessRisk":"High","riskRationale":"one sentence","keyObligations":["obligation 1","obligation 2","obligation 3"],"marshScope":[{"entity":"Marsh (Parent)","inScope":true,"reason":"short reason"},{"entity":"Marsh Risk","inScope":true,"reason":"short reason"},{"entity":"Guy Carpenter / Marsh Re","inScope":false,"reason":"short reason"},{"entity":"Mercer","inScope":false,"reason":"short reason"},{"entity":"Oliver Wyman","inScope":false,"reason":"short reason"},{"entity":"Marsh Securities LLC","inScope":false,"reason":"short reason"},{"entity":"Marsh Securities Limited (UK)","inScope":false,"reason":"short reason"},{"entity":"Marsh Securities Ireland","inScope":false,"reason":"short reason"},{"entity":"Marsh MMA Securities LLC","inScope":false,"reason":"short reason"},{"entity":"Marsh MMA Asset Management LLC","inScope":false,"reason":"short reason"},{"entity":"Victor Insurance","inScope":false,"reason":"short reason"},{"entity":"McGriff Insurance Services","inScope":false,"reason":"short reason"}],"allControls":[{"title":"name","description":"what to do","priority":"Immediate","isNew":true}],"gapAnalysis":"one paragraph","deadlineRisk":"one sentence or empty string","recommendedActions":["action 1","action 2","action 3"]}

Rules: businessRisk=High/Medium/Low. priority=Immediate/Short-term/Ongoing. allControls=ALL controls needed. marshScope must have all 12 entities. Output ONLY raw JSON.`;

      const res = await fetch(PROXY_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }) });
      const data = await res.json();
      const raw = data.content?.[0]?.text || "";
      const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      let parsed;
      try { parsed = JSON.parse(text); }
      catch { const m = text.match(/\{[\s\S]*\}/); try { parsed = JSON.parse(m?.[0]); } catch { parsed = { executiveSummary: "Parse error — retry.", businessRisk: "Medium", riskRationale: "", keyObligations: [], newControls: [], gapAnalysis: "", deadlineRisk: "", recommendedActions: [] }; } }
      // Store in analysisMap if we have a regKey
      if (regKey) onAnalysisComplete(regKey, parsed);
      setActiveTab("url"); // stay on URL tab to show result
      setResult(null); // clear main result so we don't show it below
      // Update URL results to show analysis for this reg
      setUrlResults(prev => {
        const updated = { ...prev };
        // Find which URL this reg belongs to and mark it analyzed
        Object.keys(updated).forEach(uid => {
          const res = updated[uid];
          if (res?.regulations) {
            updated[uid] = { ...res, regulations: res.regulations.map(r => {
              const rk = "URL:" + (r.reference || r.name).replace(/[^a-zA-Z0-9]/g, "_").substring(0, 40);
              return rk === regKey ? { ...r, _analyzed: true } : r;
            })};
          }
        });
        return updated;
      });
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
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

  const runBulkAnalysis = async () => {
    if (bulkSelected.size === 0 || bulkRunning) return;
    setBulkRunning(true);
    const ids = [...bulkSelected];
    setBulkProgress({ done: 0, total: ids.length, current: "", errors: [] });
    for (let i = 0; i < ids.length; i++) {
      const regId = ids[i];
      const reg = allRegs.find(r => r.id === regId);
      if (!reg) continue;
      setBulkProgress(p => ({ ...p, current: reg.name, done: i }));
      try {
        const thisRegControls = CONTROLS_LIBRARY.filter(c => c.regulations.includes(regId));
        const otherControls = CONTROLS_LIBRARY.filter(c => !c.regulations.includes(regId) && c.regulations.some(rId => inScopeIds.has(rId)));
        const prompt = `You are a regulatory compliance expert. Respond with ONLY a valid JSON object - no markdown, no backticks, no text outside JSON. No newlines inside string values.

Regulation: ${reg.name} (${reg.reference}) | ${reg.region} | ${reg.domain} | Effective: ${reg.effectiveDate} | Deadline: ${reg.deadline||"N/A"}
Summary: ${reg.summary}
Marsh entities in scope: ${(reg.marshEntities||[]).join(", ")||"Unknown"}

Controls ALREADY MAPPED to this regulation: ${thisRegControls.map(c=>c.title).join(", ")||"None"}
Controls from other in-scope regulations: ${otherControls.map(c=>c.title).join(", ")||"None"}

Return this exact JSON (string values max 25 words, reasons max 10 words):
{"executiveSummary":"2 sentence summary","businessRisk":"High","riskRationale":"one sentence","keyObligations":["obligation 1","obligation 2","obligation 3"],"marshScope":[{"entity":"Marsh (Parent)","inScope":true,"reason":"short reason"},{"entity":"Marsh Risk","inScope":true,"reason":"short reason"},{"entity":"Guy Carpenter / Marsh Re","inScope":false,"reason":"short reason"},{"entity":"Mercer","inScope":false,"reason":"short reason"},{"entity":"Oliver Wyman","inScope":false,"reason":"short reason"},{"entity":"Marsh Securities LLC","inScope":false,"reason":"short reason"},{"entity":"Marsh Securities Limited (UK)","inScope":false,"reason":"short reason"},{"entity":"Marsh Securities Ireland","inScope":false,"reason":"short reason"},{"entity":"Marsh MMA Securities LLC","inScope":false,"reason":"short reason"},{"entity":"Marsh MMA Asset Management LLC","inScope":false,"reason":"short reason"},{"entity":"Victor Insurance","inScope":false,"reason":"short reason"},{"entity":"McGriff Insurance Services","inScope":false,"reason":"short reason"}],"allControls":[{"title":"name","description":"what to do","priority":"Immediate","isNew":true}],"gapAnalysis":"one paragraph","deadlineRisk":"one sentence or empty string","recommendedActions":["action 1","action 2","action 3"]}

Rules: businessRisk=High/Medium/Low. priority=Immediate/Short-term/Ongoing. allControls=ALL controls needed. marshScope must have all 12 entities. Output ONLY raw JSON.`;

        const res = await fetch(PROXY_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }) });
        const data = await res.json();
        const raw = data.content?.[0]?.text || "";
        const text = raw.replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/,"").trim();
        let parsed;
        try { parsed = JSON.parse(text); }
        catch { const m = text.match(/\{[\s\S]*\}/); try { parsed = JSON.parse(m?.[0]); } catch { parsed = null; } }
        if (parsed) onAnalysisComplete(regId, parsed);
        else setBulkProgress(p => ({ ...p, errors: [...p.errors, reg.name] }));
      } catch (e) {
        setBulkProgress(p => ({ ...p, errors: [...p.errors, reg.name] }));
      }
      setBulkProgress(p => ({ ...p, done: i + 1 }));
      // Small delay between requests to avoid rate limiting
      if (i < ids.length - 1) await new Promise(r => setTimeout(r, 800));
    }
    setBulkProgress(p => ({ ...p, current: "", done: ids.length }));
    setBulkRunning(false);
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
          // Shorter prompt for PDF - the document content is in the file itself
          const pdfPrompt = prompt.replace("See attached document", "the attached PDF document");
          messages = [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }, { type: "text", text: pdfPrompt }] }];
        } else {
          // For text files: truncate content to leave room for response
          const truncated = fileContent.substring(0, 4000);
          const docPrompt = prompt.replace("See attached document", `Document excerpt (first 4000 chars):\n${truncated}`);
          messages = [{ role: "user", content: docPrompt }];
        }
      } else if (reg) {
        const prompt = buildPrompt(reg);
        messages = [{ role: "user", content: prompt }];
      } else { setError("Please select a regulation or upload a file."); setLoading(false); return; }

      const res = await fetch(PROXY_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages }) });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const raw = data.content?.[0]?.text || "";
      const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      let parsed;
      try { parsed = JSON.parse(text); }
      catch {
        try {
          let jsonStr = text;
          const start = jsonStr.indexOf("{");
          if (start === -1) throw new Error("No JSON");
          jsonStr = jsonStr.substring(start);
          // Fix trailing commas
          jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");
          // Fix unescaped newlines inside strings
          jsonStr = jsonStr.replace(/([^\\])\n/g, "$1 ");
          // If truncated, close open structures
          const opens = (jsonStr.match(/\{/g)||[]).length - (jsonStr.match(/\}/g)||[]).length;
          const openArr = (jsonStr.match(/\[/g)||[]).length - (jsonStr.match(/\]/g)||[]).length;
          if (opens > 0 || openArr > 0) {
            // Close any dangling string value
            const lastChar = jsonStr.trimEnd().slice(-1);
            if (lastChar !== '"' && lastChar !== ']' && lastChar !== '}') jsonStr += '"';
            for (let i = 0; i < openArr; i++) jsonStr += "]";
            for (let i = 0; i < opens; i++) jsonStr += "}";
          }
          parsed = JSON.parse(jsonStr);
        } catch {
          parsed = {
            executiveSummary: "The document was analyzed but the response was too large to fully parse. The document may be too long — try uploading a shorter excerpt.",
            businessRisk: "Medium", riskRationale: "Response was truncated.",
            keyObligations: text.length > 100 ? [text.substring(0, 600) + "..."] : ["No content returned"],
            allControls: [], gapAnalysis: "Re-run with a shorter document or paste key sections.", deadlineRisk: "", recommendedActions: ["Upload a shorter excerpt of the regulation (first 5 pages)"]
          };
        }
      }
      if (selected) onAnalysisComplete(selected, parsed);
      else if (activeTab === "file" && uploadedFile) {
        // Store file analysis keyed by a stable file key
        const fileKey = "FILE:" + uploadedFile.name.replace(/[^a-zA-Z0-9]/g, "_");
        onAnalysisComplete(fileKey, parsed);
        setFileResult(parsed);
      }
      setResult(parsed);
    } catch (e) { setError(e.message || "Analysis failed"); }
    finally { setLoading(false); }
  };


  // Shared regulation info + marsh scope panel
  const RegInfoPanel = ({ regData, regKey, currentScope, onScopeChg, analysisResult }) => {
    if (!regData) return null;
    const marshScope = MARSH_ENTITIES.map(e => ({ entity: e, inScope: (regData.marshEntities || []).includes(e) }));
    const days = daysUntil(regData.deadline);
    return (
      <div>
        {/* Regulation details card */}
        <div style={{ background: C.panel2, borderRadius: 10, padding: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 700, color: C.text, fontSize: 15 }}>{regData.name}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                {[regData.reference, regData.region, regData.domain].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {regData.status && <Badge text={analysisResult ? "Analyzed" : regData.status} style={statusStyle(analysisResult ? "Analyzed" : regData.status)} />}
              <Badge text={currentScope} style={scopeStyle(currentScope)} />
            </div>
          </div>
          {regData.summary && <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 10 }}>{regData.summary}</p>}
          {regData.deadline && (
            <div style={{ fontSize: 13, color: urgencyColor(days), marginBottom: 10 }}>
              Deadline: {formatDeadline(regData.deadline)} ({days} days)
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: C.muted }}>Scope:</span>
            <select value={currentScope} onChange={e => onScopeChg(regKey, e.target.value)}
              style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text, borderRadius: 7, padding: "5px 10px", fontSize: 13, cursor: "pointer", outline: "none" }}>
              <option>Pending</option><option>In Scope</option><option>Out of Scope</option>
            </select>
          </div>
        </div>
        {/* Marsh Entity Scope */}
        <div style={{ background: C.panel2, borderRadius: 10, padding: 16, marginBottom: 14, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>◈ Marsh Entity Scope</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>Based on regulation's tagged entities. Run analysis for AI rationale.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.green, fontWeight: 700, marginBottom: 8 }}>
                ● In Scope ({marshScope.filter(e => e.inScope).length})
              </div>
              {marshScope.filter(e => e.inScope).map(e => {
                const ai = analysisResult?.marshScope?.find(x => x.entity === e.entity);
                return (
                  <div key={e.entity} style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderLeft: `3px solid ${C.green}`, borderRadius: 8, padding: "9px 12px", marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{e.entity}</div>
                    {ai?.reason && <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{ai.reason}</div>}
                  </div>
                );
              })}
              {marshScope.filter(e => e.inScope).length === 0 && <div style={{ fontSize: 13, color: C.muted, fontStyle: "italic" }}>None tagged</div>}
            </div>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, fontWeight: 700, marginBottom: 8 }}>
                ○ Out of Scope ({marshScope.filter(e => !e.inScope).length})
              </div>
              {marshScope.filter(e => !e.inScope).map(e => {
                const ai = analysisResult?.marshScope?.find(x => x.entity === e.entity);
                return (
                  <div key={e.entity} style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", marginBottom: 6, opacity: 0.65 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{e.entity}</div>
                    {ai?.reason && <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{ai.reason}</div>}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 8, fontStyle: "italic" }}>Always validate with legal counsel.</div>
        </div>
      </div>
    );
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
        <TabBtn id="bulk" label={`Bulk Analyze${bulkSelected.size > 0 ? ` (${bulkSelected.size})` : ""}`} icon="⚡" />
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
          {reg && <RegInfoPanel regData={reg} regKey={selected} currentScope={scopeMap[selected]||"Pending"} onScopeChg={onScopeChange} analysisResult={result} />}
          <button onClick={analyze} disabled={!canAnalyze || loading} style={{ display: "flex", alignItems: "center", gap: 8, background: C.accent, border: "none", color: "#fff", fontWeight: 700, padding: "11px 24px", borderRadius: 9, fontSize: 15, cursor: canAnalyze && !loading ? "pointer" : "not-allowed", opacity: !canAnalyze || loading ? 0.5 : 1 }}>
            {loading ? <><span className="spin" style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%" }} />Analyzing...</> : "⚡ Run Analysis"}
          </button>
          {error && <div style={{ marginTop: 12, background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.red, borderRadius: 9, padding: 14, fontSize: 14 }}>{error}</div>}
        </div>
      )}

      {/* File Upload tab */}
      {activeTab === "file" && (() => {
        const fileKey = uploadedFile ? "FILE:" + uploadedFile.name.replace(/[^a-zA-Z0-9]/g, "_") : null;
        const existingAnalysis = fileKey ? analysisMap[fileKey] : null;
        const fileScope = fileKey ? (scopeMap[fileKey] || "Pending") : "Pending";
        return (
          <div>
            <div style={card}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>Upload Regulation Document</div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>Upload a PDF or text file containing a regulation. DELPHI will extract and analyze its compliance obligations.</div>
              <label style={{ display: "block", cursor: "pointer" }}>
                <div style={{ border: `2px dashed ${uploadedFile ? C.indigoBorder : C.border}`, borderRadius: 12, padding: "32px 24px", textAlign: "center", background: uploadedFile ? C.indigoBg : C.panel2, transition: "all 0.2s" }}>
                  {uploadedFile ? (
                    <div>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.indigo }}>{uploadedFile.name}</div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{(uploadedFile.size / 1024).toFixed(1)} KB · {uploadedFile.type || "text"}</div>
                      {existingAnalysis
                        ? <div style={{ fontSize: 12, color: C.green, marginTop: 6 }}>✓ Previously analyzed</div>
                        : <div style={{ fontSize: 12, color: C.green, marginTop: 6 }}>✓ Ready to analyze</div>}
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
              {uploadedFile && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                  <button onClick={() => { setUploadedFile(null); setFileContent(""); setResult(null); setFileResult(null); }} style={{ fontSize: 12, color: C.muted, background: "transparent", border: "none", cursor: "pointer" }}>× Remove</button>
                </div>
              )}
              {uploadedFile && fileKey && (() => {
                const fakeReg = { name: uploadedFile.name.replace(/\.[^.]+$/, ""), reference: "", region: "", domain: "", summary: "Uploaded document — run analysis to extract details.", marshEntities: [], deadline: null, status: existingAnalysis ? "Analyzed" : "Pending" };
                return <RegInfoPanel regData={fakeReg} regKey={fileKey} currentScope={fileScope} onScopeChg={onScopeChange} analysisResult={existingAnalysis} />;
              })()}
              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                {existingAnalysis ? (
                  <button onClick={() => { setResult(existingAnalysis); setViewingFileResult(uploadedFile?.name); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, background: C.indigoBg, border: `1px solid ${C.indigoBorder}`, color: C.indigo, fontWeight: 700, padding: "11px 24px", borderRadius: 9, fontSize: 14, cursor: "pointer" }}>
                    👁 View Analysis
                  </button>
                ) : null}
                <button onClick={analyze} disabled={!uploadedFile || loading}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: C.accent, border: "none", color: "#fff", fontWeight: 700, padding: "11px 24px", borderRadius: 9, fontSize: 15, cursor: uploadedFile && !loading ? "pointer" : "not-allowed", opacity: !uploadedFile || loading ? 0.5 : 1 }}>
                  {loading ? <><span className="spin" style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%" }} />Analyzing...</> : existingAnalysis ? "↻ Re-analyze" : "⚡ Analyze Document"}
                </button>
              </div>
              {error && <div style={{ marginTop: 12, background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.red, borderRadius: 9, padding: 14, fontSize: 14 }}>{error}</div>}
            </div>
          </div>
        );
      })()}

      {/* URL Management tab */}
      {activeTab === "bulk" && (
        <div>
          {/* Bulk Analysis Header */}
          <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>Bulk Regulation Analysis</div>
              <div style={{ fontSize: 13, color: C.muted }}>Select multiple regulations and run AI analysis on all of them. Analysis runs sequentially to avoid rate limits.</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <select value={bulkFilter} onChange={e => setBulkFilter(e.target.value)} style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer", outline: "none" }}>
                <option value="All">All Regulations</option>
                <option value="In Scope">In Scope Only</option>
                <option value="Pending">Pending Scope</option>
                <option value="Not Analyzed">Not Yet Analyzed</option>
                <option value="Analyzed">Already Analyzed</option>
              </select>
              <button onClick={() => {
                const filtered = allRegs.filter(r => {
                  if (bulkFilter === "In Scope") return (scopeMap[r.id]||"Pending") === "In Scope";
                  if (bulkFilter === "Pending") return (scopeMap[r.id]||"Pending") === "Pending";
                  if (bulkFilter === "Not Analyzed") return !analysisMap[r.id];
                  if (bulkFilter === "Analyzed") return !!analysisMap[r.id];
                  return true;
                });
                setBulkSelected(new Set(filtered.map(r => r.id)));
              }} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel2, color: C.text, fontSize: 13, cursor: "pointer" }}>Select All</button>
              <button onClick={() => setBulkSelected(new Set())} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel2, color: C.muted, fontSize: 13, cursor: "pointer" }}>Clear</button>
              <button onClick={runBulkAnalysis} disabled={bulkSelected.size === 0 || bulkRunning}
                style={{ padding: "9px 20px", background: bulkSelected.size > 0 && !bulkRunning ? C.accent : C.panel2, border: "none", color: bulkSelected.size > 0 && !bulkRunning ? "#fff" : C.muted, borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: bulkSelected.size > 0 && !bulkRunning ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>
                {bulkRunning ? `Analyzing ${bulkProgress.done}/${bulkProgress.total}...` : `⚡ Analyze ${bulkSelected.size > 0 ? `(${bulkSelected.size})` : ""}`}
              </button>
            </div>
          </div>

          {/* Progress bar */}
          {(bulkRunning || bulkProgress.done > 0) && (
            <div style={{ ...card, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                  {bulkRunning ? `Analyzing: ${bulkProgress.current}` : bulkProgress.errors.length === 0 ? `✓ Complete — ${bulkProgress.done} regulations analyzed` : `Complete — ${bulkProgress.done - bulkProgress.errors.length}/${bulkProgress.done} succeeded`}
                </div>
                <div style={{ fontSize: 13, color: C.muted }}>{bulkProgress.done}/{bulkProgress.total}</div>
              </div>
              <div style={{ height: 8, background: C.panel2, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", background: bulkProgress.errors.length > 0 ? C.amber : C.green, borderRadius: 4, width: `${bulkProgress.total > 0 ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%`, transition: "width 0.4s ease" }} />
              </div>
              {bulkProgress.errors.length > 0 && (
                <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>Failed: {bulkProgress.errors.join(", ")}</div>
              )}
            </div>
          )}

          {/* Regulation checklist */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
            {allRegs.filter(r => {
              if (bulkFilter === "In Scope") return (scopeMap[r.id]||"Pending") === "In Scope";
              if (bulkFilter === "Pending") return (scopeMap[r.id]||"Pending") === "Pending";
              if (bulkFilter === "Not Analyzed") return !analysisMap[r.id];
              if (bulkFilter === "Analyzed") return !!analysisMap[r.id];
              return true;
            }).map((r, i, arr) => {
              const isChecked = bulkSelected.has(r.id);
              const isAnalyzed = !!analysisMap[r.id];
              const cs = scopeMap[r.id] || "Pending";
              return (
                <div key={r.id} onClick={() => {
                  if (bulkRunning) return;
                  setBulkSelected(prev => { const n = new Set(prev); isChecked ? n.delete(r.id) : n.add(r.id); return n; });
                }} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none", cursor: bulkRunning ? "default" : "pointer", background: isChecked ? "rgba(129,140,248,0.06)" : "transparent", transition: "background 0.1s" }}>
                  <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${isChecked ? C.accent : C.border}`, background: isChecked ? C.accent : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {isChecked && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{r.reference} · {r.region} · {r.domain}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <Badge text={cs} style={scopeStyle(cs)} />
                    {isAnalyzed
                      ? <Badge text="Analyzed" style={statusStyle("Analyzed")} />
                      : <Badge text="Not Analyzed" style={{ bg: "rgba(90,104,128,0.1)", border: "rgba(90,104,128,0.3)", color: C.muted }} />
                    }
                    {bulkRunning && bulkProgress.current === r.name && (
                      <span className="spin" style={{ display: "inline-block", width: 14, height: 14, border: `2px solid ${C.accent}`, borderTopColor: "transparent", borderRadius: "50%", marginLeft: 4 }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

            {activeTab === "url" && (
        <div>
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>Add Regulatory URL</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Add regulatory websites or specific regulation URLs. DELPHI will deep-crawl the page and linked regulation documents to identify and ingest regulations.</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Title (e.g. SEC Regulatory Guidance)" style={{ ...inp, width: 280, flexShrink: 0 }} />
              <input value={newUrl} onChange={e => setNewUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && addUrl()} placeholder="https://..." style={{ ...inp, flex: 1 }} />
              <button onClick={addUrl} style={{ padding: "11px 20px", background: C.accent, border: "none", color: "#fff", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>+ Add</button>
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
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <input value={editTitleVal} onChange={e => setEditTitleVal(e.target.value)} placeholder="Title" style={{ ...inp, fontSize: 13 }} />
                          <input value={editVal} onChange={e => setEditVal(e.target.value)} placeholder="URL" style={{ ...inp, fontSize: 13 }} />
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => saveEdit(u.id)} style={{ padding: "8px 14px", background: C.green, border: "none", color: "#fff", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>Save</button>
                            <button onClick={() => setEditingUrl(null)} style={{ padding: "8px 14px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 7, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{u.title || u.label || u.url}</div>
                          <div style={{ fontSize: 12, color: C.indigo, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 3 }}>{u.url}</div>
                          <div style={{ display: "flex", gap: 12, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, color: C.muted }}>Added {new Date(u.added).toLocaleDateString()}</span>
                            {u.lastScanned && <span style={{ fontSize: 11, color: C.muted }}>· Scanned {new Date(u.lastScanned).toLocaleDateString()}</span>}
                            {u.scanResult?.regulations?.length > 0 && <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>· {u.scanResult.regulations.length} regulations found</span>}
                            {u.scanResult?.regulations?.filter(r => ingestedRegs?.some(ir => ir.source === u.url && ir.name.toLowerCase() === r.name.toLowerCase())).length > 0 && (
                              <span style={{ fontSize: 11, color: C.indigo }}>· {u.scanResult.regulations.filter(r => ingestedRegs?.some(ir => ir.source === u.url && ir.name.toLowerCase() === r.name.toLowerCase())).length} ingested</span>
                            )}
                          </div>
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
                      {(res.type === "loading" || res.crawling) ? (
                        <div style={{ color: C.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="spin" style={{ display: "inline-block", width: 12, height: 12, border: `2px solid ${C.accent}`, borderTopColor: "transparent", borderRadius: "50%" }}/>
                          {res.summary || "Scanning..."}
                        </div>
                      ) : res.type === "error" ? (
                        <div style={{ color: C.red, fontSize: 13 }}>Scan error: {res.summary}</div>
                      ) : (
                        <>
                          {/* Summary header with collapse toggle */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: collapsedUrls[u.id] ? 0 : 10, cursor: "pointer" }} onClick={() => toggleCollapse(u.id)}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontSize: 14, color: C.muted }}>{collapsedUrls[u.id] ? "▶" : "▼"}</span>
                              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                                {res.type === "regulation" ? "📋 Regulation Document" : "🌐 Regulatory Site"} — {res.regulations?.length || 0} regulation(s) found
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              {res.crawledAt && <div style={{ fontSize: 11, color: C.muted }}>Scanned {new Date(res.crawledAt).toLocaleString()}</div>}
                              {/* Ingest all button */}
                              {res.regulations?.length > 0 && (
                                <button onClick={(e) => {
                                  e.stopPropagation();
                                  res.regulations.forEach(r => onIngest && onIngest(r, u.url, u.title || u.url));
                                }} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.greenBorder}`, background: C.greenBg, color: C.green, cursor: "pointer", whiteSpace: "nowrap" }}>
                                  ↓ Ingest All
                                </button>
                              )}
                            </div>
                          </div>
                          {!collapsedUrls[u.id] && (
                            <>
                              {res.regulationLinks?.length > 0 && <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Deep crawled {res.regulationLinks.length} linked pages.</div>}
                              {res.siteDescription && <div style={{ fontSize: 13, color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>{res.siteDescription}</div>}
                              {res.regulations?.map((r, i) => {
                                const alreadyIngested = ingestedRegs?.some(ir => ir.source === u.url && ir.name.toLowerCase() === r.name.toLowerCase());
                                const alreadyInMaster = allRegs.some(mr => mr.name.toLowerCase() === r.name.toLowerCase() || (r.reference && mr.reference?.toLowerCase() === r.reference.toLowerCase()));
                                const regKey = "URL:" + (r.reference || r.name).replace(/[^a-zA-Z0-9]/g, "_").substring(0, 40);
                                const regAnalysis = analysisMap[regKey];
                                const regScope = scopeMap[regKey] || "Pending";
                                return (
                                  <div key={i} style={{ background: C.panel, border: `1px solid ${alreadyIngested ? C.greenBorder : C.border}`, borderLeft: `3px solid ${alreadyIngested ? C.green : regAnalysis ? C.indigo : C.border}`, borderRadius: 9, padding: "12px 14px", marginBottom: 8 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{r.name}</div>
                                          {regAnalysis && <Badge text="Analyzed" style={statusStyle("Analyzed")} />}
                                        </div>
                                        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{r.reference}{r.jurisdiction ? ` · ${r.jurisdiction}` : ""}{r.domain ? ` · ${r.domain}` : ""}</div>
                                      </div>
                                      <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
                                        {/* Scope selector */}
                                        <select value={regScope} onChange={e => onScopeChange(regKey, e.target.value)}
                                          style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 7, padding: "4px 8px", fontSize: 12, cursor: "pointer", outline: "none" }}>
                                          <option>Pending</option><option>In Scope</option><option>Out of Scope</option>
                                        </select>
                                        <Badge text={regScope} style={scopeStyle(regScope)} />
                                        {alreadyIngested ? (
                                          <span style={{ fontSize: 11, color: C.green, fontWeight: 600, padding: "4px 8px", borderRadius: 6, background: C.greenBg, border: `1px solid ${C.greenBorder}` }}>✓ Ingested</span>
                                        ) : alreadyInMaster ? (
                                          <span style={{ fontSize: 11, color: C.muted, padding: "4px 8px", borderRadius: 6, background: C.panel2, border: `1px solid ${C.border}` }}>In Inventory</span>
                                        ) : (
                                          <button onClick={() => onIngest && onIngest(r, u.url, u.title || u.url)} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.greenBorder}`, background: C.greenBg, color: C.green, cursor: "pointer", whiteSpace: "nowrap" }}>↓ Ingest</button>
                                        )}
                                        {regAnalysis ? (
                                          <button onClick={() => {
                                            // Navigate to analyze tab with this result shown
                                            setActiveTab("regulation");
                                            setResult(regAnalysis);
                                            setSelected("");
                                            setViewingFileResult(r.name);
                                          }} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.indigoBorder}`, background: C.indigoBg, color: C.indigo, cursor: "pointer", whiteSpace: "nowrap" }}>👁 View Analysis</button>
                                        ) : (
                                          <button onClick={() => {
                                            const enriched = { ...r, id: regKey, marshEntities: [] };
                                            analyzeScannedReg(enriched, regKey);
                                          }} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.indigoBorder}`, background: C.indigoBg, color: C.indigo, cursor: "pointer", whiteSpace: "nowrap" }}>⚡ Analyze</button>
                                        )}
                                      </div>
                                    </div>
                                    <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{r.summary}</div>
                                    {r.deadline && <div style={{ fontSize: 12, color: C.amber, marginTop: 6 }}>⚠ Deadline: {r.deadline}</div>}
                                    {r.sourceUrl && <div style={{ fontSize: 11, color: C.indigo, marginTop: 4 }}><a href={r.sourceUrl} target="_blank" rel="noreferrer" style={{ color: C.indigo }}>↗ Source document</a></div>}
                                  </div>
                                );
                              })}
                            </>
                          )}
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
          {viewingFileResult && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "10px 16px", background: C.indigoBg, border: `1px solid ${C.indigoBorder}`, borderRadius: 10 }}>
              <span style={{ fontSize: 13, color: C.indigo, fontWeight: 600 }}>Analysis: {viewingFileResult}</span>
              <button onClick={() => { setResult(null); setViewingFileResult(null); }} style={{ marginLeft: "auto", fontSize: 12, color: C.muted, background: "transparent", border: "none", cursor: "pointer" }}>✕ Close</button>
            </div>
          )}
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
  const [theme, setTheme] = useState(() => storage.get("delphi_theme", "dark"));
  // Keep C in sync with theme - must happen before render
  C = theme === "light" ? { ...LIGHT_THEME } : { ...DARK_THEME };
  // Update HTML background to match theme (prevents flash on reload)
  useEffect(() => {
    document.documentElement.style.background = theme === "light" ? "#f0f4f8" : "#070910";
    document.body.style.background = theme === "light" ? "#f0f4f8" : "#070910";
  }, [theme]);
  const G = getGlobalStyles(theme);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    storage.set("delphi_theme", next);
    document.documentElement.style.background = next === "light" ? "#f0f4f8" : "#070910";
    document.body.style.background = next === "light" ? "#f0f4f8" : "#070910";
  };
  const [authed, setAuthed] = useState(() => storage.get(SESSION_KEY, false));

  // Signal to index.html that React has mounted - removes the pre-load splash
  useEffect(() => {
    if (typeof window.__delphiReady === "function") {
      window.__delphiReady();
    }
  }, []);
  const [view, setView] = useState("dashboard");
  const [scopeMap, setScopeMap] = useState(() => storage.get(SCOPE_KEY, {}));
  const [analysisMap, setAnalysisMap] = useState(() => storage.get(ANALYSIS_KEY, {}));
  const [deletedIds, setDeletedIds] = useState(() => storage.get("delphi_deleted", []));
  const [deletedControlIds, setDeletedControlIds] = useState(() => storage.get("delphi_deleted_controls", []));
  const [isAdmin, setIsAdmin] = useState(() => storage.get("delphi_admin", false));
  const [analyzeRegId, setAnalyzeRegId] = useState(null);
  const [savedUrls, setSavedUrls] = useState(() => storage.get(URLS_KEY, []));
  const [ingestedRegs, setIngestedRegs] = useState(() => storage.get(INGESTED_KEY, []));

  const savePersistentUrls = useCallback((newList) => {
    setSavedUrls(newList);
    storage.set(URLS_KEY, newList);
    jbSet(URLS_KEY, newList);
  }, []);

  const saveIngestedRegs = useCallback((newList) => {
    setIngestedRegs(newList);
    storage.set(INGESTED_KEY, newList);
    jbSet(INGESTED_KEY, newList);
  }, []);

  // Ingest a regulation from URL scan - adds to ingested list, no duplicates
  const ingestRegulation = useCallback((reg, sourceUrl, sourceTitle) => {
    setIngestedRegs(prev => {
      // Check for duplicates by reference or name
      const isDupe = prev.some(r =>
        (r.reference && reg.reference && r.reference.toLowerCase() === reg.reference.toLowerCase()) ||
        r.name.toLowerCase() === reg.name.toLowerCase()
      );
      if (isDupe) return prev;
      const newReg = {
        ...reg,
        id: `ING-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,
        source: sourceUrl,
        sourceTitle: sourceTitle || sourceUrl,
        ingestedAt: new Date().toISOString(),
        hasChanges: false,
        lastUpdated: new Date().toISOString(),
        isIngested: true,
      };
      const updated = [...prev, newReg];
      storage.set(INGESTED_KEY, updated);
      jbSet(INGESTED_KEY, updated);
      return updated;
    });
  }, []);

  const updateIngestedReg = useCallback((id, updates) => {
    setIngestedRegs(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, ...updates, lastUpdated: new Date().toISOString(), hasChanges: true } : r);
      storage.set(INGESTED_KEY, updated);
      jbSet(INGESTED_KEY, updated);
      return updated;
    });
  }, []);

  const clearChangesFlag = useCallback((id) => {
    setIngestedRegs(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, hasChanges: false } : r);
      storage.set(INGESTED_KEY, updated);
      jbSet(INGESTED_KEY, updated);
      return updated;
    });
  }, []);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  // Apply remote data to state, only update if actually changed
  const applyRemoteData = useCallback((rec) => {
    if (!rec) return;
    if (rec.delphi_scope && Object.keys(rec.delphi_scope).length > 0) {
      setScopeMap(p => JSON.stringify(p) !== JSON.stringify(rec.delphi_scope) ? { ...rec.delphi_scope } : p);
      storage.set(SCOPE_KEY, rec.delphi_scope);
    }
    if (rec.delphi_analyses && Object.keys(rec.delphi_analyses).length > 0) {
      setAnalysisMap(p => JSON.stringify(p) !== JSON.stringify(rec.delphi_analyses) ? { ...rec.delphi_analyses } : p);
      storage.set(ANALYSIS_KEY, rec.delphi_analyses);
    }
    if (rec.delphi_urls?.length > 0) {
      setSavedUrls(p => JSON.stringify(p) !== JSON.stringify(rec.delphi_urls) ? rec.delphi_urls : p);
      storage.set(URLS_KEY, rec.delphi_urls);
    }
    if (rec.delphi_ingested?.length > 0) {
      setIngestedRegs(p => JSON.stringify(p) !== JSON.stringify(rec.delphi_ingested) ? rec.delphi_ingested : p);
      storage.set(INGESTED_KEY, rec.delphi_ingested);
    }
    setLastSync(new Date());
  }, []);

  // On mount: load localStorage immediately (instant), then fetch remote and start polling
  useEffect(() => {
    // Step 1: Show local data instantly (no loading screen)
    const localScope = storage.get(SCOPE_KEY, {});
    const localAnalyses = storage.get(ANALYSIS_KEY, {});
    const localUrls = storage.get(URLS_KEY, []);
    const localIngested = storage.get(INGESTED_KEY, []);
    if (Object.keys(localScope).length > 0) setScopeMap(localScope);
    if (Object.keys(localAnalyses).length > 0) setAnalysisMap(localAnalyses);
    if (localUrls.length > 0) setSavedUrls(localUrls);
    if (localIngested.length > 0) setIngestedRegs(localIngested);

    // Step 2: Fetch remote immediately and migrate if needed
    const initialFetch = async () => {
      try {
        const rec = await jbGet();
        applyRemoteData(rec);
        // Migrate local-only data to remote if remote is empty
        if (!rec.delphi_scope && Object.keys(localScope).length > 0) jbSet(SCOPE_KEY, localScope);
        if (!rec.delphi_analyses && Object.keys(localAnalyses).length > 0) jbSet(ANALYSIS_KEY, localAnalyses);
        if (!rec.delphi_urls?.length && localUrls.length > 0) jbSet(URLS_KEY, localUrls);
        if (!rec.delphi_ingested?.length && localIngested.length > 0) jbSet(INGESTED_KEY, localIngested);
      } catch (e) { console.error("Initial sync failed", e); }
    };
    initialFetch();

    // Step 3: Poll every 15 seconds for cross-device live sync
    const interval = setInterval(async () => {
      try { applyRemoteData(await jbGet()); } catch {}
    }, 15000);

    return () => clearInterval(interval);
  }, [applyRemoteData]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const rec = await jbGet();
      if (rec.delphi_scope && Object.keys(rec.delphi_scope).length > 0) { setScopeMap({ ...rec.delphi_scope }); storage.set(SCOPE_KEY, rec.delphi_scope); }
      if (rec.delphi_analyses && Object.keys(rec.delphi_analyses).length > 0) { setAnalysisMap({ ...rec.delphi_analyses }); storage.set(ANALYSIS_KEY, rec.delphi_analyses); }
      if (rec.delphi_urls?.length > 0) { setSavedUrls(rec.delphi_urls); storage.set(URLS_KEY, rec.delphi_urls); }
      if (rec.delphi_ingested?.length > 0) { setIngestedRegs(rec.delphi_ingested); storage.set(INGESTED_KEY, rec.delphi_ingested); }
        if (rec.delphi_urls) { setSavedUrls(rec.delphi_urls); storage.set(URLS_KEY, rec.delphi_urls); }
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

  if (!authed) return <Login onLogin={login} theme={theme} toggleTheme={toggleTheme} />;

  const allRegsWithIngested = useMemo(() => {
    // Merge ingested regs that don't already exist in master list
    const masterIds = new Set(allRegs.map(r => r.id));
    const masterNames = new Set(allRegs.map(r => r.name.toLowerCase()));
    const newOnes = ingestedRegs.filter(r => !masterIds.has(r.id) && !masterNames.has(r.name.toLowerCase()));
    return [...allRegs, ...newOnes];
  }, [allRegs, ingestedRegs]);
  const vp = { allRegs: allRegsWithIngested, scopeMap, analysisMap, theme };
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
      <style>{G}</style>
      <Sidebar active={view} onNav={setView} onLogout={logout} totalRegs={allRegs.length} inScope={inScopeCount} />
      <main style={{ marginLeft: 248, minHeight: "100vh" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "28px 36px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginBottom: 22, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.green, display: "inline-block", boxShadow: `0 0 6px ${C.green}` }} title="Auto-syncing every 15 seconds" />
              {lastSync && <span style={{ fontSize: 12, color: C.muted }}>Synced {lastSync.toLocaleTimeString()}</span>}
            </div>
            <button onClick={syncNow} disabled={syncing} style={{ fontSize: 13, padding: "7px 16px", borderRadius: 8, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: syncing ? C.muted : C.accent, opacity: syncing ? 0.6 : 1 }}>{syncing ? "Syncing..." : "↻ Sync Now"}</button>
            <button onClick={toggleTheme} style={{ fontSize: 18, padding: "5px 10px", borderRadius: 8, cursor: "pointer", border: `1px solid ${C.border}`, background: C.panel2, color: C.text, lineHeight: 1 }} title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>{theme === "dark" ? "☀️" : "🌙"}</button>
            <button onClick={() => { const v = !isAdmin; setIsAdmin(v); storage.set("delphi_admin", v); }} style={{ fontSize: 13, padding: "7px 16px", borderRadius: 8, cursor: "pointer", border: `1px solid ${isAdmin ? C.redBorder : C.border}`, background: isAdmin ? C.redBg : "transparent", color: isAdmin ? C.red : C.muted }}>{isAdmin ? "Admin Mode ON" : "Admin Mode"}</button>
          </div>
          {view === "dashboard" && <Dashboard {...vp} />}
          {view === "inventory" && <Inventory {...vp} onScopeChange={setScopeFor} onDelete={onDelete} isAdmin={isAdmin} onAnalyzeClick={(id) => { setAnalyzeRegId(id); setView("analyze"); }} ingestedRegs={ingestedRegs} onUpdateIngested={updateIngestedReg} onClearChanges={clearChangesFlag} />}
          {view === "analyze" && <Analyze {...vp} onScopeChange={setScopeFor} onAnalysisComplete={onAnalysisComplete} initialRegId={analyzeRegId} onAnalyzeDone={() => setAnalyzeRegId(null)} savedUrls={savedUrls} onSaveUrls={savePersistentUrls} ingestedRegs={ingestedRegs} onIngest={ingestRegulation} onUpdateIngested={updateIngestedReg} />}
          {view === "controls" && <Controls {...vp} isAdmin={isAdmin} onDeleteControl={onDeleteControl} deletedControlIds={deletedControlIds} />}
          {view === "timeline" && <Timeline {...vp} />}
          {view === "calendar" && <Calendar {...vp} />}
        </div>
      </main>
    </div>
  );
}
