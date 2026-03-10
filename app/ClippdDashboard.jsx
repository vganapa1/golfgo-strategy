'use client';
import { useState } from "react";

// ─── All data parsed directly from clippd_extracted.json ────────────────────
// IMPORTANT: ClippD records from player's own perspective.
// For LEFT-HANDED Nolan: ClippD "left" miss = ball goes RIGHT in real world.
const DATA = {
  player: { name: "Nolan Forsman", handicap: "Pro", hand: "Left", rounds: 20 },

  approach: {
    sq: 91, sg: -0.48, gir: 72,
    miss_left: 16,   // ClippD "left" = real-world RIGHT for lefty
    miss_right: 6,
    miss_short: 6,
    miss_long: 1,
    proximity: "30'0\"",
    tour_proximity: "31'5\"",
    best_zones: [
      { range: "120-140", sq: 97, prox: "22'11\"" },
      { range: "100-120", sq: 95, prox: "27'0\""  },
      { range: "200-220", sq: 95, prox: "40'1\""  },
    ],
    avoid: { range: "75-100", sq: 83, prox: "23'0\"" },
  },

  // 3x3 grid: row 0 = back of green, row 2 = front. col 0 = left, col 2 = right (ClippD POV)
  heatmaps: {
    "50-100":  { grid: [[75,89,95],[105,97,78],[87,70,90]]   },
    "100-140": { grid: [[66,104,65],[108,70,114],[94,126,90]] },
    "140-180": { grid: [[85,98,81],[92,92,90],[98,85,94]]    },
    "180+":    { grid: [[91,95,98],[63,87,123],[73,100,92]]  },
  },

  ott: {
    overall_sq: 104,
    categories: [
      { label: "Par 4  0-350",   sq: 105 },
      { label: "Par 4 350-400",  sq: 108 },
      { label: "Par 4 400-450",  sq: 105 },
      { label: "Par 4 450+",     sq: 102 },
      { label: "Par 5 500-550",  sq: 103 },
      { label: "Par 5 550+",     sq: 105 },
    ],
  },

  arg: {
    pq: 100, tour_pq: 111, importance: 15,
    focus: { label: "ARG Fairway", importance: "8%", opp: "High", sq: 90 },
    lies: [
      { label: "Fairway", icon: "green", updown: "57%", sg: -0.31 },
      { label: "Rough",   icon: "tan",   updown: "63%", sg: +0.09 },
      { label: "Sand",    icon: "sand",  updown: "57%", sg: +0.16 },
    ],
  },

  putting: {
    pq: 98, tour_pq: 104, sg: -0.07, sq: 99, importance: 26,
    birdie_conv: 28, tour_birdie_conv: 30,
    one_putt_pct: 38, three_putt_pct: 3,
    putts_per_round: 29.1, putts_per_gir: 1.78,
    dist_made: "67'10\"",
    one_putts: 108, two_putts: 170, three_putts: 8, total: 472,
    focus: { label: "PUTT 3-8 ft", importance: "7%", opp: "Med", sq: 92, down: true },
    profiles: {
      "3-8 ft": [
        { label: "Speed Control",  bias: "Aggressive",  pct: 95 },
        { label: "Straight Putts", bias: "Left Bias",   pct: 30 },
        { label: "L to R Putts",   bias: "Right Bias",  pct: 65 },
        { label: "R to L Putts",   bias: "Right Bias",  pct: 58 },
      ],
      "8-15 ft": [
        { label: "Speed Control",  bias: "Aggressive", pct: 88 },
        { label: "Straight Putts", bias: "No Bias",    pct: 50 },
        { label: "L to R Putts",   bias: "Left Bias",  pct: 28 },
        { label: "R to L Putts",   bias: "Right Bias", pct: 65 },
      ],
      "15-35 ft": [
        { label: "Speed Control",  bias: "Neutral",     pct: 45 },
        { label: "Straight Putts", bias: "Slight Left", pct: 42 },
        { label: "L to R Putts",   bias: "Left Bias",   pct: 25 },
        { label: "R to L Putts",   bias: "Right Bias",  pct: 68 },
      ],
    },
  },
};

// ─── Color helpers ────────────────────────────────────────────────────────────
function sqGrade(v) {
  if (v >= 105) return { text: "#4ade80", glow: "rgba(74,222,128,0.2)",   label: "Elite"      };
  if (v >= 100) return { text: "#86efac", glow: "rgba(134,239,172,0.14)", label: "Above Avg"  };
  if (v >= 93)  return { text: "#fbbf24", glow: "rgba(251,191,36,0.18)",  label: "Average"    };
  return              { text: "#f87171", glow: "rgba(248,113,113,0.18)", label: "Below Avg"  };
}
function sgColor(v) { return v > 0.05 ? "#4ade80" : v > -0.1 ? "#fbbf24" : "#f87171"; }

function cellColor(v, min, max) {
  const t = (v - min) / (max - min);
  if (t >= 0.65) return { bg: `rgba(16,185,129,${0.08 + t * 0.42})`, fg: "#6ee7b7", bd: "rgba(16,185,129,0.4)"  };
  if (t >= 0.35) return { bg: `rgba(250,204,21,${0.05 + t * 0.16})`, fg: "#fde68a", bd: "rgba(250,204,21,0.25)" };
  return              { bg: `rgba(239,68,68,${0.05 + (1-t)*0.28})`, fg: "#fca5a5", bd: "rgba(239,68,68,0.38)"  };
}

function biasColor(bias) {
  if (bias.includes("Aggressive")) return "#f87171";
  if (bias.includes("Left"))       return "#fbbf24";
  if (bias.includes("Right"))      return "#60a5fa";
  return "#9ca3af";
}

// ─── Shared atoms ─────────────────────────────────────────────────────────────
function Divider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 10px" }}>
      <div style={{ height: 1, width: 10, background: "#2a4a35" }} />
      <span style={{ fontSize: 13, color: "#6dab82", letterSpacing: "0.18em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ height: 1, flex: 1, background: "rgba(42,74,53,0.35)" }} />
    </div>
  );
}

function Tile({ label, value, sub, color, large }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: large ? "13px 15px" : "9px 11px" }}>
      <div style={{ fontSize: 13, color: "#6dab82", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: large ? 23 : 16, fontWeight: 700, color: color || "#e4e9e6", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Alert({ color, icon, title, children }) {
  const c = color === "red"
    ? { bg: "rgba(239,68,68,0.07)",    bd: "rgba(239,68,68,0.22)",    hd: "#f87171" }
    : { bg: "rgba(251,191,36,0.07)",   bd: "rgba(251,191,36,0.22)",   hd: "#fbbf24" };
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 13, color: c.hd, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>{icon} {title}</div>
      {children}
    </div>
  );
}

// ─── Heatmap grid ─────────────────────────────────────────────────────────────
function HeatGrid({ grid, compact }) {
  const flat = grid.flat();
  const min = Math.min(...flat), max = Math.max(...flat);
  const rowLabels = ["BACK", "MID", "FRONT"];
  const sz = compact ? 32 : 50;
  return (
    <div>
      <div style={{ display: "flex", gap: 3, paddingLeft: compact ? 27 : 34, marginBottom: 3 }}>
        {["L", "C", "R"].map(l => (
          <div key={l} style={{ width: sz, textAlign: "center", fontSize: 13, color: "#9ca3af" }}>{l}</div>
        ))}
      </div>
      {grid.map((row, ri) => (
        <div key={ri} style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 3 }}>
          <div style={{ width: compact ? 24 : 31, fontSize: 13, color: "#9ca3af", textAlign: "right", paddingRight: 3, letterSpacing: "0.04em" }}>
            {rowLabels[ri]}
          </div>
          {row.map((val, ci) => {
            const c = cellColor(val, min, max);
            return (
              <div key={ci}
                style={{ width: sz, height: compact ? 28 : 42, borderRadius: 6, background: c.bg, border: `1px solid ${c.bd}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: compact ? 11 : 15, fontWeight: 700, color: c.fg, transition: "transform 0.12s, box-shadow 0.12s", cursor: "default" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.boxShadow = `0 0 12px ${c.bd}`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
              >
                {val}
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, paddingLeft: compact ? 27 : 34 }}>
        <span style={{ fontSize: 13, color: "#4ade80" }}>best {max}</span>
        <span style={{ fontSize: 13, color: "#f87171" }}>worst {min}</span>
      </div>
    </div>
  );
}

// ─── OTT bars ─────────────────────────────────────────────────────────────────
function OTTBars({ cats }) {
  const min = 95, max = 112;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {cats.map(cat => {
        const g = sqGrade(cat.sq);
        const pct = ((cat.sq - min) / (max - min)) * 100;
        return (
          <div key={cat.label}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>{cat.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: g.text }}>{cat.sq}</span>
            </div>
            <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.max(0, pct)}%`, background: g.text, borderRadius: 3, boxShadow: `0 0 6px ${g.glow}`, transition: "width 0.7s cubic-bezier(0.34,1.56,0.64,1)" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── SVG Radar ────────────────────────────────────────────────────────────────
function Radar({ cats }) {
  const cx = 90, cy = 90, r = 66;
  const n = cats.length;
  const angles = cats.map((_, i) => (i / n) * Math.PI * 2 - Math.PI / 2);
  const vMin = 90, vMax = 112;
  const rings = [95, 100, 105, 110];

  function pt(angle, val) {
    const s = (val - vMin) / (vMax - vMin);
    return { x: cx + Math.cos(angle) * r * s, y: cy + Math.sin(angle) * r * s };
  }

  const ringPts = (v) => angles.map(a => { const p = pt(a, v); return `${p.x},${p.y}`; }).join(" ");
  const dataPts = cats.map((c, i) => pt(angles[i], c.sq));
  const poly = dataPts.map(p => `${p.x},${p.y}`).join(" ");

  return (
    <svg width={180} height={180} style={{ overflow: "visible" }}>
      {rings.map(v => <polygon key={v} points={ringPts(v)} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={1} />)}
      {angles.map((a, i) => { const p = pt(a, vMax); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />; })}
      {rings.map(v => { const p = pt(-Math.PI / 2, v); return <text key={v} x={p.x + 3} y={p.y - 2} fontSize={7} fill="#374151">{v}</text>; })}
      <polygon points={poly} fill="rgba(34,197,94,0.1)" stroke="#22c55e" strokeWidth={1.5} strokeLinejoin="round" />
      {dataPts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="#4ade80" stroke="#080e0b" strokeWidth={1.5} />)}
      {cats.map((cat, i) => {
        const labelR = r + 16;
        const lx = cx + Math.cos(angles[i]) * labelR;
        const ly = cy + Math.sin(angles[i]) * labelR;
        return <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={7} fill="#6b7280">{cat.label.split(" ").slice(-1)[0]}</text>;
      })}
    </svg>
  );
}

// ─── Miss donut ───────────────────────────────────────────────────────────────
function MissDonut({ left, right, short, long_ }) {
  const segs = [
    { label: "ClippD L (real R)", pct: left,  color: "#f87171" },
    { label: "Right (real L)",    pct: right, color: "#4ade80" },
    { label: "Short",             pct: short, color: "#fbbf24" },
    { label: "Long",              pct: long_, color: "#60a5fa" },
  ];
  const rOuter = 34, cx = 44, cy = 44, strokeW = 13;
  const circum = 2 * Math.PI * rOuter;
  const total = left + right + short + long_;
  let offset = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <svg width={88} height={88}>
        <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={strokeW} />
        {segs.map((s, i) => {
          const dash = (s.pct / total) * circum;
          const el = (
            <circle key={i} cx={cx} cy={cy} r={rOuter} fill="none"
              stroke={s.color} strokeWidth={strokeW} strokeOpacity={0.75}
              strokeDasharray={`${dash} ${circum - dash}`}
              strokeDashoffset={-offset}
              style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }}
            />
          );
          offset += dash;
          return el;
        })}
        <text x={cx} y={cy - 3} textAnchor="middle" fontSize={11} fill="#e4e9e6" fontWeight="700">{total}%</text>
        <text x={cx} y={cy + 9} textAnchor="middle" fontSize={7} fill="#4b7a5e">missed</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {segs.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "#9ca3af" }}>{s.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: s.color, marginLeft: "auto", paddingLeft: 10 }}>{s.pct}%</span>
          </div>
        ))}
        <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 2 }}>* LH player: ClippD POV is mirrored</div>
      </div>
    </div>
  );
}

// ─── Bias slider ──────────────────────────────────────────────────────────────
function BiasSlider({ label, bias, pct }) {
  const color = biasColor(bias);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>{label}</span>
        <span style={{ fontSize: 12, color, fontWeight: 600 }}>{bias}</span>
      </div>
      <div style={{ position: "relative", height: 7, background: "rgba(255,255,255,0.06)", borderRadius: 4 }}>
        <div style={{ position: "absolute", top: 0, left: "50%", height: "100%", width: 1, background: "rgba(255,255,255,0.1)" }} />
        <div style={{
          position: "absolute", top: 0, height: "100%", borderRadius: 4, opacity: 0.55,
          left: pct < 50 ? `${pct}%` : "50%",
          width: `${Math.abs(pct - 50)}%`,
          background: color,
        }} />
        <div style={{
          position: "absolute", top: "50%", left: `${pct}%`,
          transform: "translate(-50%, -50%)",
          width: 13, height: 13, borderRadius: "50%",
          background: color, border: "2px solid #080e0b",
          boxShadow: `0 0 8px ${color}70`,
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
        <span style={{ fontSize: 13, color: "#9ca3af" }}>Conservative / Left</span>
        <span style={{ fontSize: 13, color: "#9ca3af" }}>Aggressive / Right</span>
      </div>
    </div>
  );
}

// ─── Tabs config ──────────────────────────────────────────────────────────────
const TABS = [
  { key: "overview",  icon: "◈", label: "Overview"   },
  { key: "approach",  icon: "◎", label: "Approach"   },
  { key: "heatmaps",  icon: "▦", label: "Pin Maps"   },
  { key: "ott",       icon: "◐", label: "Off Tee"    },
  { key: "arg",       icon: "◑", label: "Short Game" },
  { key: "putting",   icon: "◉", label: "Putting"    },
];

// ─── Main export ──────────────────────────────────────────────────────────────
export default function ClippdDashboard({ onClose }) {
  const [tab, setTab]         = useState("overview");
  const [hmRange, setHmRange] = useState("100-140");
  const [pRange, setPRange]   = useState("3-8 ft");
  const d = DATA;

  return (
    <div style={{
      fontFamily: "'DM Mono','Fira Code','Courier New',monospace",
      background: "#080e0b",
      color: "#e4e9e6",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.07)",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Playfair+Display:ital,wght@0,700;1,400&display=swap');
        .cd-tab{padding:8px 14px;border-radius:6px;font-size:13px;cursor:pointer;border:1px solid transparent;transition:all 0.14s;background:transparent;color:#9ca3af;font-family:inherit;white-space:nowrap;display:flex;align-items:center;gap:5px;letter-spacing:0.02em}
        .cd-tab.on{background:rgba(34,197,94,0.1);border-color:rgba(34,197,94,0.25);color:#4ade80}
        .cd-tab:hover:not(.on){background:rgba(255,255,255,0.03);color:#c4cdd8}
        .cd-pill{padding:5px 11px;border-radius:4px;font-size:12px;cursor:pointer;border:1px solid rgba(255,255,255,0.12);background:transparent;color:#9ca3af;font-family:inherit;transition:all 0.13s}
        .cd-pill.on{background:rgba(34,197,94,0.09);border-color:rgba(34,197,94,0.28);color:#4ade80}
        .cd-pill:hover:not(.on){background:rgba(255,255,255,0.04);color:#c4cdd8}
        .cd-in{animation:cd_in 0.26s ease-out}
        @keyframes cd_in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        .cd-scroll::-webkit-scrollbar{width:3px}
        .cd-scroll::-webkit-scrollbar-thumb{background:#1a2e22;border-radius:2px}
      `}</style>

      {/* ── Header ── */}
      <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: "linear-gradient(135deg,#16a34a,#065f46)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📊</div>
          <div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, fontWeight: 700, color: "#f0fdf4", lineHeight: 1 }}>ClippD Analytics</div>
            <div style={{ fontSize: 13, color: "#6dab82", letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 2 }}>
              {d.player.name} · {d.player.handicap} · {d.player.hand}-Handed · Last {d.player.rounds} Rounds
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 13, color: "#9ca3af", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 4, padding: "3px 8px" }}>
            ⚠ ClippD L/R is mirrored for LH player
          </div>
          {onClose && (
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#6dab82", cursor: "pointer", fontSize: 15, padding: "2px 5px", fontFamily: "inherit" }}>✕</button>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: "flex", gap: 3, padding: "8px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", overflowX: "auto", flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.key} className={`cd-tab ${tab === t.key ? "on" : ""}`} onClick={() => setTab(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="cd-scroll cd-in" key={tab} style={{ flex: 1, overflowY: "auto", padding: 18 }}>

        {/* ══════ OVERVIEW ══════ */}
        {tab === "overview" && (
          <div>
            <Divider label="Performance Summary" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
              <Tile large label="SG: Approach" value={d.approach.sg} color={sgColor(d.approach.sg)} sub="primary leak" />
              <Tile large label="SG: Putting"  value={d.putting.sg}  color={sgColor(d.putting.sg)}  sub="vs field" />
              <Tile large label="App SQ"        value={d.approach.sq} color={sqGrade(d.approach.sq).text} sub={sqGrade(d.approach.sq).label} />
              <Tile large label="OTT Overall SQ" value={d.ott.overall_sq} color={sqGrade(d.ott.overall_sq).text} sub={sqGrade(d.ott.overall_sq).label} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
              <Tile label="GIR %"        value={`${d.approach.gir}%`} />
              <Tile label="1-Putt %"     value={`${d.putting.one_putt_pct}%`} color="#4ade80" />
              <Tile label="3-Putt %"     value={`${d.putting.three_putt_pct}%`} color="#4ade80" />
              <Tile label="Putts / GIR"  value={d.putting.putts_per_gir} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              {/* Proximity */}
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 14 }}>
                <Divider label="Approach Proximity" />
                {[
                  { label: "Nolan avg", val: d.approach.proximity,      color: "#4ade80" },
                  { label: "Tour T25",  val: d.approach.tour_proximity,  color: "#9ca3af" },
                ].map(r => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <span style={{ fontSize: 13, color: "#9ca3af" }}>{r.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: r.color }}>{r.val}</span>
                  </div>
                ))}
                <div style={{ marginTop: 8, fontSize: 12, color: "#4ade80" }}>Beats Tour T25 avg by ~1.5 ft</div>
              </div>

              {/* Putt volume */}
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 14 }}>
                <Divider label="Putt Volume · 20 Rds" />
                {[
                  { l: "1-Putts", n: d.putting.one_putts,   c: "#4ade80" },
                  { l: "2-Putts", n: d.putting.two_putts,   c: "#fbbf24" },
                  { l: "3-Putts", n: d.putting.three_putts, c: "#f87171" },
                ].map(r => (
                  <div key={r.l} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: "#9ca3af" }}>{r.l}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: r.c }}>{r.n}</span>
                    </div>
                    <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(r.n / d.putting.total) * 100}%`, background: r.c, borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Divider label="Priority Focus Areas" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Alert color="red" icon="⚠" title="ARG · Work On">
                <div style={{ fontSize: 12, color: "#fca5a5", fontWeight: 600 }}>{d.arg.focus.label}</div>
                <div style={{ display: "flex", gap: 14, marginTop: 7 }}>
                  {[["Importance", d.arg.focus.importance],["Opportunity", d.arg.focus.opp],["SQ Trend", d.arg.focus.sq]].map(([k,v]) => (
                    <div key={k}><div style={{ fontSize: 13, color: "#9ca3af" }}>{k}</div><div style={{ fontSize: 13, color: "#e4e9e6" }}>{v}</div></div>
                  ))}
                </div>
              </Alert>
              <Alert color="amber" icon="⚠" title="Putting · Work On">
                <div style={{ fontSize: 12, color: "#fde68a", fontWeight: 600 }}>{d.putting.focus.label}</div>
                <div style={{ display: "flex", gap: 14, marginTop: 7 }}>
                  {[["Importance", d.putting.focus.importance],["Opportunity", d.putting.focus.opp],["SQ Trend", `${d.putting.focus.sq} ↓`]].map(([k,v]) => (
                    <div key={k}><div style={{ fontSize: 13, color: "#9ca3af" }}>{k}</div><div style={{ fontSize: 13, color: "#e4e9e6" }}>{v}</div></div>
                  ))}
                </div>
              </Alert>
            </div>
          </div>
        )}

        {/* ══════ APPROACH ══════ */}
        {tab === "approach" && (
          <div>
            <Divider label="Approach Overall · Last 20 Rounds" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
              <Tile large label="Shot Quality"  value={d.approach.sq} color={sqGrade(d.approach.sq).text} sub={sqGrade(d.approach.sq).label} />
              <Tile large label="SG: Approach"  value={d.approach.sg} color={sgColor(d.approach.sg)} sub="vs field" />
              <Tile large label="GIR %"          value={`${d.approach.gir}%`} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 14 }}>
                <Divider label="Miss Distribution" />
                <MissDonut left={d.approach.miss_left} right={d.approach.miss_right} short={d.approach.miss_short} long_={d.approach.miss_long} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 14 }}>
                  <Divider label="Best Scoring Zones" />
                  {d.approach.best_zones.map((z, i) => {
                    const g = sqGrade(z.sq);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ width: 22, height: 22, borderRadius: 4, background: g.glow, border: `1px solid ${g.text}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: g.text, flexShrink: 0 }}>#{i+1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: "#e4e9e6", fontWeight: 600 }}>{z.range} yds</div>
                          <div style={{ fontSize: 12, color: "#6dab82" }}>prox: {z.prox}</div>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: g.text }}>{z.sq}</div>
                      </div>
                    );
                  })}
                </div>
                <Alert color="red" icon="✗" title="Avoid Zone">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#fca5a5", fontWeight: 600 }}>{d.approach.avoid.range} yds</div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>prox: {d.approach.avoid.prox}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#f87171" }}>{d.approach.avoid.sq}</div>
                      <div style={{ fontSize: 13, color: "#9ca3af" }}>SQ</div>
                    </div>
                  </div>
                </Alert>
              </div>
            </div>
          </div>
        )}

        {/* ══════ HEATMAPS ══════ */}
        {tab === "heatmaps" && (
          <div>
            <Divider label="Pin Location Heatmaps · Shot Quality" />
            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 12, lineHeight: 1.7 }}>
              Grid viewed from behind green — top = back, bottom = front. Higher SQ = better performance to that pin.
              <span style={{ color: "#fbbf24", marginLeft: 6 }}>⚠ LH Nolan: ClippD "L" = real-world right.</span>
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
              {Object.keys(d.heatmaps).map(r => (
                <button key={r} className={`cd-pill ${hmRange === r ? "on" : ""}`} onClick={() => setHmRange(r)}>{r} yds</button>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, alignItems: "start", marginBottom: 22 }}>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20 }} key={hmRange}>
                <div style={{ fontSize: 13, color: "#4ade80", fontWeight: 600, marginBottom: 14, fontFamily: "'Playfair Display',serif" }}>
                  {hmRange} yds · Pin Location Heatmap
                </div>
                <HeatGrid grid={d.heatmaps[hmRange].grid} />
              </div>

              {(() => {
                const flat = d.heatmaps[hmRange].grid.flat();
                const names = [["Back-L","Back-C","Back-R"],["Mid-L","Mid-C","Mid-R"],["Front-L","Front-C","Front-R"]];
                const cells = flat.map((v, i) => ({ v, name: names[Math.floor(i/3)][i%3] })).sort((a,b) => b.v - a.v);
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 13, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>Attack — Top 3</div>
                      {cells.slice(0,3).map((c,i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(34,197,94,0.08)" }}>
                          <span style={{ fontSize: 13, color: "#9ca3af" }}>{c.name}</span>
                          <span style={{ fontSize: 15, fontWeight: 800, color: "#4ade80" }}>{c.v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 13, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>Bail — Bottom 3</div>
                      {cells.slice(-3).reverse().map((c,i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(239,68,68,0.08)" }}>
                          <span style={{ fontSize: 13, color: "#9ca3af" }}>{c.name}</span>
                          <span style={{ fontSize: 15, fontWeight: 800, color: "#f87171" }}>{c.v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 13, color: "#6dab82", marginBottom: 3 }}>Range spread</div>
                      <div style={{ fontSize: 12, color: "#e4e9e6" }}>
                        {Math.min(...flat)} – {Math.max(...flat)} SQ
                        <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 6 }}>({Math.max(...flat) - Math.min(...flat)} pt gap)</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <Divider label="All Buckets" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
              {Object.entries(d.heatmaps).map(([range, hm]) => (
                <div key={range} onClick={() => setHmRange(range)}
                  style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${hmRange === range ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.06)"}`, borderRadius: 10, padding: 12, cursor: "pointer", transition: "border-color 0.2s" }}>
                  <HeatGrid grid={hm.grid} compact />
                  <div style={{ fontSize: 12, color: hmRange === range ? "#4ade80" : "#6b7280", textAlign: "center", marginTop: 6 }}>{range} yds</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════ OTT ══════ */}
        {tab === "ott" && (
          <div>
            <Divider label="Off The Tee DNA · Last 20 Rounds" />
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, alignItems: "start" }}>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 12, color: "#6dab82", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "center", marginBottom: 10 }}>Avg Shot Quality</div>
                <Radar cats={d.ott.categories} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Tile large label="Overall OTT SQ" value={d.ott.overall_sq} color={sqGrade(d.ott.overall_sq).text} sub="100 = field baseline" />
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 14 }}>
                  <Divider label="By Hole Category" />
                  <OTTBars cats={d.ott.categories} />
                </div>
                <div style={{ background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.12)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 13, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Insight</div>
                  <div style={{ fontSize: 13, color: "#d1fae5", lineHeight: 1.7 }}>
                    Peak on Par 4 350-400 yds (SQ 108). OTT is a net positive — strokes are not lost off the tee. Strategy: leverage this strength to engineer ideal approach windows.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════ ARG ══════ */}
        {tab === "arg" && (
          <div>
            <Divider label="Around the Green · Last 20 Rounds" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
              <Tile large label="Player Quality" value={d.arg.pq} color={sqGrade(d.arg.pq).text} sub={`Tour T25: ${d.arg.tour_pq}`} />
              <Tile large label="Importance" value={`${d.arg.importance}%`} sub="of overall scoring" />
              <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "13px 15px" }}>
                <div style={{ fontSize: 13, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Gap vs Tour T25</div>
                <div style={{ fontSize: 23, fontWeight: 800, color: "#f87171" }}>-{d.arg.tour_pq - d.arg.pq}</div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>PQ points below benchmark</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 14 }}>
                <Divider label="By Lie" />
                {d.arg.lies.map(lie => (
                  <div key={lie.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: lie.sg > 0 ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${lie.sg > 0 ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>
                      {lie.icon === "green" ? "🌿" : lie.icon === "tan" ? "🌾" : "🏖️"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: "#9ca3af" }}>{lie.label}</div>
                      <div style={{ fontSize: 12, color: "#6dab82" }}>Up & Down: <span style={{ color: "#e4e9e6" }}>{lie.updown}</span></div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: sgColor(lie.sg) }}>{lie.sg > 0 ? "+" : ""}{lie.sg.toFixed(2)}</div>
                      <div style={{ fontSize: 13, color: "#6dab82" }}>SG:ARG</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Alert color="red" icon="⚠" title="Focus Area">
                  <div style={{ fontSize: 12, color: "#fca5a5", fontWeight: 600, marginTop: 3 }}>{d.arg.focus.label}</div>
                  <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                    {[["Importance", d.arg.focus.importance],["Opportunity", d.arg.focus.opp],["SQ", d.arg.focus.sq]].map(([k,v]) => (
                      <div key={k}><div style={{ fontSize: 13, color: "#9ca3af" }}>{k}</div><div style={{ fontSize: 13, color: "#e4e9e6" }}>{v}</div></div>
                    ))}
                  </div>
                </Alert>
                <div style={{ background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.12)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 13, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Key Insight</div>
                  <div style={{ fontSize: 13, color: "#d1fae5", lineHeight: 1.7 }}>
                    Outperforms from <span style={{ color: "#4ade80" }}>rough (+0.09)</span> and <span style={{ color: "#4ade80" }}>sand (+0.16)</span> but loses from <span style={{ color: "#f87171" }}>fairway (-0.31)</span>. ARG Fairway = high-opportunity improvement area.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════ PUTTING ══════ */}
        {tab === "putting" && (
          <div>
            <Divider label="Putting · Last 20 Rounds" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
              <Tile large label="Player Quality" value={d.putting.pq} color={sqGrade(d.putting.pq).text} sub={`Tour T25: ${d.putting.tour_pq}`} />
              <Tile large label="SG: Putting"    value={d.putting.sg} color={sgColor(d.putting.sg)} />
              <Tile large label="1-Putt %"        value={`${d.putting.one_putt_pct}%`} color="#4ade80" />
              <Tile large label="3-Putt %"        value={`${d.putting.three_putt_pct}%`} color="#4ade80" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 14 }}>
                <Divider label="Stats" />
                {[
                  ["Putts / Round",    d.putting.putts_per_round, null],
                  ["Putts / GIR",      d.putting.putts_per_gir,   null],
                  ["Birdie Conv",      `${d.putting.birdie_conv}%`, `Tour: ${d.putting.tour_birdie_conv}%`],
                  ["Dist Made",        d.putting.dist_made,        "total 20 rds"],
                ].map(([label, val, sub]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <span style={{ fontSize: 13, color: "#9ca3af" }}>{label}</span>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#e4e9e6" }}>{val}</div>
                      {sub && <div style={{ fontSize: 13, color: "#9ca3af" }}>{sub}</div>}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Alert color="amber" icon="⚠" title="Priority Focus">
                  <div style={{ fontSize: 12, color: "#fde68a", fontWeight: 600, marginTop: 3 }}>{d.putting.focus.label}</div>
                  <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                    {[["Importance", d.putting.focus.importance],["Opportunity", d.putting.focus.opp],["SQ Trend", `${d.putting.focus.sq} ↓`]].map(([k,v]) => (
                      <div key={k}><div style={{ fontSize: 13, color: "#9ca3af" }}>{k}</div><div style={{ fontSize: 13, color: "#e4e9e6" }}>{v}</div></div>
                    ))}
                  </div>
                </Alert>
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: 12 }}>
                  <Divider label="Putt Breakdown" />
                  {[
                    { l: "1-Putts", n: d.putting.one_putts,   c: "#4ade80" },
                    { l: "2-Putts", n: d.putting.two_putts,   c: "#fbbf24" },
                    { l: "3-Putts", n: d.putting.three_putts, c: "#f87171" },
                  ].map(r => (
                    <div key={r.l} style={{ marginBottom: 7 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: r.c }}>{r.l}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: r.c }}>{r.n}</span>
                      </div>
                      <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(r.n / d.putting.total) * 100}%`, background: r.c, borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <Divider label="Putting Bias Profiles" />
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {Object.keys(d.putting.profiles).map(r => (
                <button key={r} className={`cd-pill ${pRange === r ? "on" : ""}`} onClick={() => setPRange(r)}>{r}</button>
              ))}
            </div>
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 16 }} key={pRange}>
              <div style={{ fontSize: 13, color: "#4ade80", marginBottom: 14, fontWeight: 600 }}>{pRange}</div>
              {d.putting.profiles[pRange].map(m => (
                <BiasSlider key={m.label} label={m.label} bias={m.bias} pct={m.pct} />
              ))}
              <div style={{ marginTop: 6, fontSize: 13, color: "#9ca3af", lineHeight: 1.6 }}>
                Slider center = neutral · Left = conservative/left bias · Right = aggressive/right bias
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
