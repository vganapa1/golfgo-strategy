'use client';
import { useState, useRef, useCallback, useEffect } from "react";
import ClippdDashboard from "./ClippdDashboard";

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

const GOAL_OPTIONS = ["eagle attempt","birdie","par protection","bogey avoidance","make cut"];

const HOLE_CATEGORIES = [
  { key: "par3_short",     label: "Par 3 · Short",     sub: "< 180 yds",     icon: "🎯" },
  { key: "par3_long",      label: "Par 3 · Long",      sub: "180+ yds",      icon: "🎯" },
  { key: "par4_short",     label: "Par 4 · Short",     sub: "< 380 yds",     icon: "🏌️" },
  { key: "par4_medium",    label: "Par 4 · Medium",    sub: "380–430 yds",   icon: "🏌️" },
  { key: "par4_long",      label: "Par 4 · Long",      sub: "430+ yds",      icon: "🏌️" },
  { key: "par5_reachable", label: "Par 5 · Reachable", sub: "Can go for it", icon: "⚡" },
  { key: "par5_standard",  label: "Par 5 · Standard",  sub: "Lay up hole",   icon: "📐" },
];

const DEFAULT_GAME_PLAN = {
  par3_short: "par protection", par3_long: "par protection",
  par4_short: "birdie", par4_medium: "birdie", par4_long: "par protection",
  par5_reachable: "eagle attempt", par5_standard: "birdie",
};

const GOAL_COLORS = {
  "eagle attempt":   { bg: "rgba(234,179,8,0.12)",  border: "rgba(234,179,8,0.35)",  text: "#fbbf24" },
  "birdie":          { bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.35)",  text: "#4ade80" },
  "par protection":  { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.35)", text: "#60a5fa" },
  "bogey avoidance": { bg: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.35)", text: "#c084fc" },
  "make cut":        { bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.35)",  text: "#f87171" },
};

function classifyHole(holeData, playerProfile) {
  const par   = holeData?.par;
  const yards = holeData?.yardages?.back || holeData?.yardages?.middle || 0;
  const driver = playerProfile?.off_the_tee?.clubs?.driver?.avg_carry_yards || 300;
  const wood   = playerProfile?.off_the_tee?.clubs?.["3w"]?.avg_carry_yards  || 270;
  if (par === 3) return yards >= 180 ? "par3_long" : "par3_short";
  if (par === 4) {
    if (yards < 380) return "par4_short";
    if (yards <= 430) return "par4_medium";
    return "par4_long";
  }
  if (par === 5) return (driver + wood >= yards - 20) ? "par5_reachable" : "par5_standard";
  return "par4_medium";
}

async function extractHoleDataWithGemini(base64Image, mimeType) {
  const prompt = `Analyze this yardage book page and extract ALL visible information. Return ONLY valid JSON:
{
  "hole_number": null, "par": null,
  "yardages": { "championship": null, "back": null, "middle": null, "forward": null },
  "hazards": [{ "type": "", "location": "", "distance_from_tee": null, "carry_distance": null, "description": "" }],
  "landing_zones": [{ "zone_id": "A", "distance_from_tee": null, "width": "", "description": "" }],
  "green": { "depth_yards": null, "width_yards": null, "front_distance": null, "middle_distance": null, "back_distance": null, "slope_notes": "" },
  "dogleg": { "exists": false, "direction": "none", "apex_distance": null },
  "elevation_change": "unknown", "notes": ""
}
Be precise. Use null if not visible. Return ONLY the JSON, no markdown, no backticks.`;

  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Image } }] }],
      generationConfig: { temperature: 0.1 },
    }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || "Gemini error"); }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

async function generateStrategyWithClaude(holeData, playerProfile, weather, conditions, gamePlan, detectedCategory, activeGoal) {
  const catMeta = HOLE_CATEGORIES.find(c => c.key === detectedCategory);
  const res = await fetch("/api/strategy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      system: `You are an elite PGA Tour caddie and golf strategist with deep knowledge of performance analytics.

KEY RULES:
1. SCORING GOAL FIRST: Open HOLE OVERVIEW by stating the scoring goal (${activeGoal}) and WHY this hole is categorized as "${catMeta?.label}". Make intent clear from sentence one.
2. DIRECTIONAL AWARENESS: Player is left-handed. All real-world miss directions in the profile are already corrected. Use as stated.
3. APPROACH DISTANCE: Engineer tee shot to leave optimal approach yardage per scoring zones. This is the #1 lever.
4. PIN HEATMAPS: Cross-reference pin position with heatmap SQ for that distance. State score — attack or bail.
5. TEE CLUB: Use FIR% and miss data, not just distance.
6. GOAL-CALIBRATED AGGRESSION: Entire strategy calibrated to the scoring goal.

Format: HOLE OVERVIEW, TEE SHOT, APPROACH, SCORING ZONE, RISK/REWARD, KEY NUMBERS. Bullet points. Reference yardages, clubs, heatmap SQ scores.`,
      messages: [{
        role: "user",
        content: `Build a complete hole strategy.

SCORING GOAL: ${activeGoal}
HOLE CATEGORY: ${catMeta?.label} (${catMeta?.sub})

COACH GAME PLAN:
${JSON.stringify(Object.fromEntries(HOLE_CATEGORIES.map(c => [c.label, gamePlan[c.key]])), null, 2)}

HOLE DATA:
${JSON.stringify(holeData, null, 2)}

PLAYER PROFILE:
${JSON.stringify(playerProfile, null, 2)}

WEATHER:
${JSON.stringify(weather, null, 2)}

CONDITIONS:
${JSON.stringify(conditions, null, 2)}

- Calibrate every decision to: ${activeGoal}
- Check pin_location_heatmaps for pin "${conditions.pin_position}" and state its SQ score
- Compare tee clubs by FIR% not just distance`,
      }],
    }),
  });
  if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || "Claude error"); }
  const data = await res.json();
  return data.content[0].text;
}

function parseStrategy(text) {
  const sections = [
    { key: "overview", label: "Hole Overview", icon: "🗺️" },
    { key: "tee",      label: "Tee Shot",      icon: "🏌️" },
    { key: "approach", label: "Approach",       icon: "🎯" },
    { key: "scoring",  label: "Scoring Zone",   icon: "📍" },
    { key: "risk",     label: "Risk / Reward",  icon: "⚖️" },
    { key: "numbers",  label: "Key Numbers",    icon: "📐" },
  ];
  const headers = {
    overview: /HOLE OVERVIEW/i, tee: /TEE SHOT/i, approach: /APPROACH/i,
    scoring: /SCORING ZONE/i, risk: /RISK[\s/]+REWARD/i, numbers: /KEY NUMBERS/i,
  };
  const result = {};
  let current = null;
  for (const line of text.split("\n")) {
    const t = line.trim();
    let matched = false;
    for (const [key, rx] of Object.entries(headers)) {
      if (rx.test(t)) { current = key; result[key] = []; matched = true; break; }
    }
    if (!matched && current && t && !t.match(/^[#*_]+$/))
      result[current].push(t.replace(/^[-*•]\s*/, "").replace(/\*\*/g, ""));
  }
  return sections.map(s => ({ ...s, lines: result[s.key] || [] }));
}

const DEFAULT_PLAYER = {
  name: "Nolan Forsman", handicap: "Pro", handedness: "left", rounds_analyzed: 20,
  directional_note: "LEFT-HANDED. All miss directions are real-world. 'left' = ball goes left of target.",
  off_the_tee: {
    sg_off_tee_avg: 0.04, ott_dna_avg_sq: 104,
    par4_350_400_sq: 108, par4_400_450_sq: 105, par4_450plus_sq: 102, par5_sq: 103,
    tee_club_hierarchy_by_fir: "3i (84%) > Driver (74%) > 3W (66%)",
    clubs: {
      driver: { avg_carry_yards: 306, fir_pct: 0.74, miss_real_world_left_pct: 0.12, miss_real_world_right_pct: 0.14, shape: "slight fade", note: "Most directionally neutral tee club" },
      "3w":   { avg_carry_yards: 275, fir_pct: 0.66, miss_real_world_left_pct: 0.07, miss_real_world_right_pct: 0.22, note: "AVOID as control club — 22% lead-side pull. Driver is more accurate." },
      "3i":   { avg_carry_yards: 235, fir_pct: 0.84, note: "True control club. Use when accuracy is paramount." },
    },
  },
  approach: {
    sg_approach_avg: -0.48, gir_pct: 0.72,
    dominant_miss_real_world: "right", miss_left_pct: 0.06, miss_right_pct: 0.16,
    scoring_zones: [
      { range_yards: "120-140", sq: 97, avg_proximity_ft: 22.9, note: "BEST — attack pins" },
      { range_yards: "100-120", sq: 95, avg_proximity_ft: 27.0 },
      { range_yards: "140-160", sq: 91, avg_proximity_ft: 31.0 },
      { range_yards: "160-180", sq: 88, avg_proximity_ft: 34.0 },
      { range_yards: "180-200", sq: 82, avg_proximity_ft: 39.0 },
      { range_yards: "200+",    sq: 76, avg_proximity_ft: 48.0, note: "Significant drop-off" },
    ],
    pin_location_heatmaps: {
      "50-100yds": { "front-left":95,"front-center":90,"front-right":88,"middle-left":105,"middle-center":98,"middle-right":85,"back-left":92,"back-center":88,"back-right":80, best_zone:"middle-left",worst_zone:"back-right" },
      "100-140yds": { "front-left":110,"front-center":126,"front-right":108,"middle-left":95,"middle-center":118,"middle-right":92,"back-left":66,"back-center":88,"back-right":65, best_zone:"front-center",worst_zones:["back-left","back-right"],note:"Back pins drop to SQ 65-66. Aim front-center when pin is back." },
      "140-180yds": { "front-left":95,"front-center":98,"front-right":93,"middle-left":90,"middle-center":97,"middle-right":81,"back-left":88,"back-center":92,"back-right":84, best_zone:"front-center",worst_zone:"middle-right" },
      "180plus_yds": { "front-left":98,"front-center":102,"front-right":90,"middle-left":63,"middle-center":95,"middle-right":123,"back-left":85,"back-center":91,"back-right":88, best_zone:"middle-right",worst_zone:"middle-left",note:"Middle-left crashes to 63. Aim center or right-center from 180+." },
    },
  },
  putting: {
    sg_putting_avg: -0.06, three_putt_rate_pct: 0.09,
    zones: { "inside-3ft":{make_rate_pct:0.99},"3-6ft":{make_rate_pct:0.88},"6-10ft":{make_rate_pct:0.62},"10-15ft":{make_rate_pct:0.38},"15-20ft":{make_rate_pct:0.22},"20-25ft":{make_rate_pct:0.14},"25plus_ft":{make_rate_pct:0.07} },
    flag: "3-8ft range trending down (SQ 92) — weakness under pressure",
  },
  around_green: { scrambling_pct: 0.58, sg_around_green_avg: -0.12, note: "Slightly below baseline. Avoid short-side misses." },
  strategic_summary: {
    avoid: ["3W as control club","Back-pin approaches from 100-140yds (SQ 65-66)","Middle-left targets from 180+ (SQ 63)"],
    attack: ["Front/center pins from 100-140yds (SQ 110-126)","120-140yd approach window","Middle-right from 180+ when forced long"],
  },
};

const GlowBadge = ({ children, color="emerald", style={} }) => {
  const c = { emerald:{bg:"rgba(34,197,94,0.1)",border:"rgba(34,197,94,0.3)",text:"#4ade80"}, amber:{bg:"rgba(251,191,36,0.1)",border:"rgba(251,191,36,0.3)",text:"#fbbf24"}, sky:{bg:"rgba(56,189,248,0.1)",border:"rgba(56,189,248,0.3)",text:"#38bdf8"}, rose:{bg:"rgba(251,113,133,0.1)",border:"rgba(251,113,133,0.3)",text:"#fb7185"} }[color] || {bg:"rgba(34,197,94,0.1)",border:"rgba(34,197,94,0.3)",text:"#4ade80"};
  return <span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:c.bg,border:`1px solid ${c.border}`,color:c.text,fontFamily:"inherit",...style}}>{children}</span>;
};

const StatRow = ({ label, value, unit }) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
    <span style={{fontSize:10,color:"#6b7280"}}>{label}</span>
    <span style={{fontSize:10,color:"#e4e9e6"}}>{value}{unit?<span style={{color:"#4b7a5e",marginLeft:2}}>{unit}</span>:""}</span>
  </div>
);

function GamePlanPanel({ gamePlan, setGamePlan, detectedCategory, activeGoal, setActiveGoal }) {
  return (
    <div>
      {HOLE_CATEGORIES.map(cat => {
        const goal = gamePlan[cat.key];
        const gc = GOAL_COLORS[goal] || GOAL_COLORS["par protection"];
        const isDetected = detectedCategory === cat.key;
        return (
          <div key={cat.key} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:6,marginBottom:5,background:isDetected?"rgba(34,197,94,0.06)":"rgba(255,255,255,0.02)",border:isDetected?"1px solid rgba(34,197,94,0.2)":"1px solid transparent"}}>
            <span style={{fontSize:14,flexShrink:0}}>{cat.icon}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,color:isDetected?"#4ade80":"#9ca3af",lineHeight:1.3}}>{cat.label} {isDetected&&<span style={{fontSize:10,color:"#4b7a5e"}}>← detected</span>}</div>
              <div style={{fontSize:11,color:"#9ca3af"}}>{cat.sub}</div>
            </div>
            <select value={gamePlan[cat.key]} onChange={e=>{const u={...gamePlan,[cat.key]:e.target.value};setGamePlan(u);if(isDetected)setActiveGoal(e.target.value);}}
              style={{background:gc.bg,border:`1px solid ${gc.border}`,color:gc.text,borderRadius:4,fontSize:11,padding:"5px 8px",fontFamily:"inherit",cursor:"pointer",outline:"none",flexShrink:0}}>
              {GOAL_OPTIONS.map(g=><option key={g} value={g} style={{background:"#0d1a12"}}>{g}</option>)}
            </select>
          </div>
        );
      })}
      {detectedCategory && (
        <div style={{marginTop:12,padding:"10px 12px",borderRadius:6,background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)"}}>
          <div style={{fontSize:11,color:"#4b7a5e",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,fontWeight:600}}>Active Goal Override</div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:12,color:"#6b7280",flex:1}}>Current hole:</span>
            <select value={activeGoal} onChange={e=>setActiveGoal(e.target.value)}
              style={{background:(GOAL_COLORS[activeGoal]||GOAL_COLORS["par protection"]).bg,border:`1px solid ${(GOAL_COLORS[activeGoal]||GOAL_COLORS["par protection"]).border}`,color:(GOAL_COLORS[activeGoal]||GOAL_COLORS["par protection"]).text,borderRadius:4,fontSize:12,padding:"5px 10px",fontFamily:"inherit",cursor:"pointer",outline:"none"}}>
              {GOAL_OPTIONS.map(g=><option key={g} value={g} style={{background:"#0d1a12"}}>{g}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GolfGoStrategyGenerator() {
  const [imageFile,setImageFile]=useState(null);
  const [imagePreview,setImagePreview]=useState(null);
  const [imageBase64,setImageBase64]=useState(null);
  const [imageMime,setImageMime]=useState("image/jpeg");
  const [weather,setWeather]=useState({wind_speed_mph:10,wind_direction:"into",temperature_f:72,firmness:"normal",green_speed_stimp:11});
  const [conditions,setConditions]=useState({pin_position:"middle-center",rough_height_inches:2.5,fairway_roll_yards:6});
  const [player,setPlayer]=useState(DEFAULT_PLAYER);
  const [editingPlayer,setEditingPlayer]=useState(false);
  const [playerJson,setPlayerJson]=useState(()=>JSON.stringify(DEFAULT_PLAYER,null,2));
  const [gamePlan,setGamePlan]=useState(DEFAULT_GAME_PLAN);
  const [detectedCategory,setDetectedCategory]=useState(null);
  const [activeGoal,setActiveGoal]=useState(null);
  const [showGamePlan,setShowGamePlan]=useState(true);
  const [phase,setPhase]=useState("idle");
  const [holeData,setHoleData]=useState(null);
  const [parsedStrategy,setParsedStrategy]=useState([]);
  const [error,setError]=useState("");
  const [activeSection,setActiveSection]=useState(0);
  const fileRef=useRef();
  const [viewMode,setViewMode]=useState("strategy");
  const [clippdData,setClippdData]=useState(null);
  const [clippdLoading,setClippdLoading]=useState(false);
  const [clippdSearch,setClippdSearch]=useState("");
  const [clippdTypeFilter,setClippdTypeFilter]=useState("");
  const [clippdExpanded,setClippdExpanded]=useState(null);
  const [showAnalytics,setShowAnalytics]=useState(false);

  const handleImageChange=useCallback((file)=>{
    if(!file)return;
    setImageFile(file);setImageMime(file.type||"image/jpeg");
    const r=new FileReader();
    r.onload=e=>{setImagePreview(e.target.result);setImageBase64(e.target.result.split(",")[1]);};
    r.readAsDataURL(file);
  },[]);

  const handleDrop=useCallback(e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f?.type.startsWith("image/"))handleImageChange(f);},[handleImageChange]);

  useEffect(()=>{
    if(viewMode!=="clippd")return;
    setClippdLoading(true);
    fetch("/data/clippd_extracted.json").then(r=>r.json()).then(data=>{setClippdData(data);setClippdLoading(false);}).catch(()=>setClippdLoading(false));
  },[viewMode]);

  const clippdResults=clippdData?.results??[];
  const clippdTypes=[...new Set(clippdResults.map(r=>(r.gemini||r.claude)?.screenshot_type).filter(Boolean))].sort();
  const clippdFiltered=clippdResults.filter(r=>{
    const g=r.gemini||r.claude;
    const typeOk=!clippdTypeFilter||g?.screenshot_type===clippdTypeFilter;
    if(!typeOk)return false;
    if(!clippdSearch.trim())return true;
    const text=(r.image+" "+JSON.stringify(g??{})).toLowerCase();
    return text.includes(clippdSearch.toLowerCase());
  });

  const runPipeline=async()=>{
    if(!imageBase64){setError("Upload a yardage book image");return;}
    setError("");setHoleData(null);setParsedStrategy([]);setDetectedCategory(null);setActiveGoal(null);
    try{
      setPhase("extracting");
      const extracted=await extractHoleDataWithGemini(imageBase64,imageMime);
      setHoleData(extracted);
      const category=classifyHole(extracted,player);
      const goal=gamePlan[category];
      setDetectedCategory(category);setActiveGoal(goal);
      setPhase("strategizing");
      const txt=await generateStrategyWithClaude(extracted,player,weather,conditions,gamePlan,category,goal);
      setParsedStrategy(parseStrategy(txt));setPhase("done");setActiveSection(0);
    }catch(e){setError(e.message);setPhase("error");}
  };

  const rerun=async()=>{
    if(!holeData||!activeGoal)return;
    setError("");setParsedStrategy([]);
    try{
      setPhase("strategizing");
      const txt=await generateStrategyWithClaude(holeData,player,weather,conditions,gamePlan,detectedCategory,activeGoal);
      setParsedStrategy(parseStrategy(txt));setPhase("done");setActiveSection(0);
    }catch(e){setError(e.message);setPhase("error");}
  };

  const reset=()=>{setPhase("idle");setImageFile(null);setImagePreview(null);setImageBase64(null);setHoleData(null);setParsedStrategy([]);setDetectedCategory(null);setActiveGoal(null);};

  const windLabels=["into","downwind","left-to-right","right-to-left","crosswind"];
  const pinLabels=["front-left","front-center","front-right","middle-left","middle-center","middle-right","back-left","back-center","back-right"];
  const goalColor=GOAL_COLORS[activeGoal]||GOAL_COLORS["par protection"];
  const catMeta=HOLE_CATEGORIES.find(c=>c.key===detectedCategory);

  return (
    <div style={{fontFamily:"'DM Mono','Fira Code','Courier New',monospace",background:"linear-gradient(135deg,#0a0f0d 0%,#0d1a12 50%,#080e0b 100%)",minHeight:"100vh",color:"#e4e9e6"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Playfair+Display:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#2a4a35;border-radius:2px}
        .glow-btn{background:linear-gradient(135deg,#16a34a,#15803d);border:1px solid #22c55e40;box-shadow:0 0 20px #16a34a30,inset 0 1px 0 #22c55e30;transition:all 0.2s;cursor:pointer}
        .glow-btn:hover{box-shadow:0 0 30px #16a34a50;transform:translateY(-1px)}
        .glow-btn:disabled{opacity:0.4;cursor:not-allowed;transform:none}
        .panel{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px}
        .input-field{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#e4e9e6;font-family:inherit;font-size:12px;padding:6px 10px;width:100%;outline:none;transition:border-color 0.2s}
        .input-field:focus{border-color:#22c55e60}
        select.input-field option{background:#0d1a12}
        .section-tab{padding:6px 14px;border-radius:6px;font-size:11px;cursor:pointer;border:1px solid transparent;transition:all 0.15s;background:transparent;color:#6b7280;font-family:inherit;white-space:nowrap}
        .section-tab.active{background:rgba(34,197,94,0.1);border-color:rgba(34,197,94,0.3);color:#4ade80}
        .section-tab:hover:not(.active){background:rgba(255,255,255,0.04);color:#9ca3af}
        .drop-zone:hover{border-color:#22c55e60!important;background:rgba(34,197,94,0.05)!important}
        .spin{animation:spin 1s linear infinite}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .fade-in{animation:fadeIn 0.4s ease-out}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .goal-pulse{animation:gp 2s ease-in-out infinite}
        @keyframes gp{0%,100%{opacity:1}50%{opacity:0.6}}
        @keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
      `}</style>

      {/* Header */}
      <div style={{borderBottom:"1px solid rgba(255,255,255,0.06)",padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:34,height:34,borderRadius:8,background:"linear-gradient(135deg,#16a34a,#065f46)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>⛳</div>
          <div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:700,color:"#f0fdf4",letterSpacing:"-0.5px"}}>GolfGo</div>
            <div style={{fontSize:9,color:"#4b7a5e",letterSpacing:"0.15em",textTransform:"uppercase"}}>Course Strategy Engine</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={()=>setViewMode(viewMode==="clippd"?"strategy":"clippd")} style={{fontSize:12,padding:"6px 12px",borderRadius:6,background:viewMode==="clippd"?"rgba(34,197,94,0.15)":"rgba(255,255,255,0.06)",border:viewMode==="clippd"?"1px solid rgba(34,197,94,0.4)":"1px solid rgba(255,255,255,0.1)",color:viewMode==="clippd"?"#4ade80":"#9ca3af",cursor:"pointer",fontFamily:"inherit"}}>{viewMode==="clippd"?"← Strategy":"Clippd Data"}</button>
          <button onClick={()=>setShowAnalytics(true)} style={{padding:"4px 12px",borderRadius:6,fontSize:10,background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.25)",color:"#4ade80",cursor:"pointer",fontFamily:"inherit"}}>📊 Player Analytics</button>
          {activeGoal&&<div style={{padding:"4px 12px",borderRadius:6,background:goalColor.bg,border:`1px solid ${goalColor.border}`,color:goalColor.text,fontSize:11,fontWeight:500}} className="goal-pulse">{catMeta?.icon} {activeGoal}</div>}
        </div>
      </div>

      {viewMode==="clippd"&&(
        <div style={{padding:24,overflowY:"auto",maxHeight:"calc(100vh - 63px)"}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:"#f0fdf4",marginBottom:20}}>Clippd extracted data</div>
          {clippdLoading?<div style={{textAlign:"center",padding:40,color:"#6b7280"}}>Loading…</div>:clippdData&&(
            <>
              <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:20}}>
                <input type="text" placeholder="Search by image name, chart title, notes…" value={clippdSearch} onChange={e=>setClippdSearch(e.target.value)}
                  className="input-field" style={{maxWidth:400,flex:1,minWidth:200}}/>
                <select className="input-field" value={clippdTypeFilter} onChange={e=>setClippdTypeFilter(e.target.value)} style={{width:180}}>
                  <option value="">All types</option>
                  {clippdTypes.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{fontSize:12,color:"#6b7280",marginBottom:12}}>{clippdFiltered.length} of {clippdResults.length} results</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {clippdFiltered.map((r,i)=>(
                  <div key={i} className="panel" style={{padding:14,overflow:"hidden"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,cursor:"pointer"}} onClick={()=>setClippdExpanded(clippdExpanded===i?null:i)}>
                      <div>
                        <div style={{fontSize:13,color:"#e4e9e6",fontWeight:500}}>{r.image.replace(/^.*\//,"")}</div>
                        <div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>{(r.gemini||r.claude)?.screenshot_type??"—"} {(r.gemini||r.claude)?.other_data?.chart_title||(r.gemini||r.claude)?.other_data?.title||(r.gemini||r.claude)?.other_data?.category||""}</div>
                      </div>
                      <span style={{fontSize:11,color:"#4b7a5e"}}>{clippdExpanded===i?"▲ collapse":"▼ expand"}</span>
                    </div>
                    {clippdExpanded===i&&(
                      <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
                        <pre style={{fontSize:11,color:"#d1d5db",background:"rgba(0,0,0,0.2)",padding:14,borderRadius:8,overflow:"auto",maxHeight:400,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{JSON.stringify(r.gemini||r.claude||r,null,2)}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {viewMode==="strategy"&&<div style={{display:"grid",gridTemplateColumns:"340px 1fr",height:"calc(100vh - 63px)"}}>

        {/* Left sidebar */}
        <div style={{borderRight:"1px solid rgba(255,255,255,0.06)",padding:16,overflowY:"auto",display:"flex",flexDirection:"column",gap:12}}>

          {/* Image upload */}
          <div className="panel" style={{padding:14}}>
            <div style={{fontSize:10,color:"#4b7a5e",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Yardage Book Image</div>
            <div className="drop-zone" style={{border:"1px dashed rgba(255,255,255,0.12)",borderRadius:8,padding:imagePreview?0:"18px 16px",textAlign:"center",cursor:"pointer",overflow:"hidden",transition:"all 0.2s"}}
              onClick={()=>fileRef.current?.click()} onDrop={handleDrop} onDragOver={e=>e.preventDefault()}>
              {imagePreview?<img src={imagePreview} alt="Yardage book" style={{width:"100%",display:"block",borderRadius:8}}/>:<><div style={{fontSize:22,marginBottom:4}}>📷</div><div style={{fontSize:11,color:"#6b7280"}}>Drop or click to upload</div><div style={{fontSize:9,color:"#374151",marginTop:2}}>JPG · PNG · WEBP</div></>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleImageChange(e.target.files[0])}/>
            {imageFile&&<div style={{fontSize:9,color:"#4b7a5e",marginTop:5}}>✓ {imageFile.name}</div>}
          </div>

          {/* Game plan */}
          <div className="panel" style={{padding:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div>
                <div style={{fontSize:13,color:"#4b7a5e",letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:600}}>Coach Game Plan</div>
                <div style={{fontSize:11,color:"#374151",marginTop:2}}>Scoring goal by hole type</div>
              </div>
              <button onClick={()=>setShowGamePlan(!showGamePlan)} style={{fontSize:11,color:"#6b7280",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>{showGamePlan?"collapse ↑":"expand ↓"}</button>
            </div>
            {showGamePlan
              ?<GamePlanPanel gamePlan={gamePlan} setGamePlan={setGamePlan} detectedCategory={detectedCategory} activeGoal={activeGoal} setActiveGoal={setActiveGoal}/>
              :<div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {HOLE_CATEGORIES.map(cat=>{const gc=GOAL_COLORS[gamePlan[cat.key]]||GOAL_COLORS["par protection"];return<span key={cat.key} style={{fontSize:11,padding:"4px 8px",borderRadius:3,background:gc.bg,border:`1px solid ${gc.border}`,color:gc.text}}>{cat.label.split("·")[1]?.trim()}: {gamePlan[cat.key]}</span>;})}
              </div>
            }
          </div>

          {/* Weather */}
          <div className="panel" style={{padding:14}}>
            <div style={{fontSize:10,color:"#4b7a5e",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:10}}>Weather</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div><div style={{fontSize:9,color:"#6b7280",marginBottom:3}}>Wind (mph)</div><input type="number" className="input-field" value={weather.wind_speed_mph} onChange={e=>setWeather({...weather,wind_speed_mph:+e.target.value})}/></div>
              <div><div style={{fontSize:9,color:"#6b7280",marginBottom:3}}>Temp (°F)</div><input type="number" className="input-field" value={weather.temperature_f} onChange={e=>setWeather({...weather,temperature_f:+e.target.value})}/></div>
              <div><div style={{fontSize:9,color:"#6b7280",marginBottom:3}}>Wind Dir</div><select className="input-field" value={weather.wind_direction} onChange={e=>setWeather({...weather,wind_direction:e.target.value})}>{windLabels.map(w=><option key={w}>{w}</option>)}</select></div>
              <div><div style={{fontSize:9,color:"#6b7280",marginBottom:3}}>Stimp</div><input type="number" className="input-field" value={weather.green_speed_stimp} onChange={e=>setWeather({...weather,green_speed_stimp:+e.target.value})}/></div>
              <div style={{gridColumn:"span 2"}}><div style={{fontSize:9,color:"#6b7280",marginBottom:3}}>Firmness</div><select className="input-field" value={weather.firmness} onChange={e=>setWeather({...weather,firmness:e.target.value})}>{["soft","normal","firm","hard"].map(f=><option key={f}>{f}</option>)}</select></div>
            </div>
          </div>

          {/* Conditions */}
          <div className="panel" style={{padding:14}}>
            <div style={{fontSize:10,color:"#4b7a5e",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:10}}>Round Conditions</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div style={{gridColumn:"span 2"}}><div style={{fontSize:9,color:"#6b7280",marginBottom:3}}>Pin Position</div><select className="input-field" value={conditions.pin_position} onChange={e=>setConditions({...conditions,pin_position:e.target.value})}>{pinLabels.map(p=><option key={p}>{p}</option>)}</select></div>
              <div><div style={{fontSize:9,color:"#6b7280",marginBottom:3}}>Rough (in)</div><input type="number" step="0.5" className="input-field" value={conditions.rough_height_inches} onChange={e=>setConditions({...conditions,rough_height_inches:+e.target.value})}/></div>
              <div><div style={{fontSize:9,color:"#6b7280",marginBottom:3}}>Roll (yds)</div><input type="number" className="input-field" value={conditions.fairway_roll_yards} onChange={e=>setConditions({...conditions,fairway_roll_yards:+e.target.value})}/></div>
            </div>
          </div>

          {/* Player */}
          <div className="panel" style={{padding:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{fontSize:10,color:"#4b7a5e",letterSpacing:"0.12em",textTransform:"uppercase"}}>Player Profile</div>
              <button onClick={()=>setEditingPlayer(!editingPlayer)} style={{fontSize:9,color:editingPlayer?"#4ade80":"#6b7280",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>{editingPlayer?"← back":"edit ✎"}</button>
            </div>
            {editingPlayer?<><textarea className="input-field" style={{height:180,resize:"vertical",fontSize:10,lineHeight:1.5}} value={playerJson} onChange={e=>setPlayerJson(e.target.value)}/><button className="glow-btn" style={{marginTop:8,padding:"6px 12px",fontSize:11,borderRadius:6,width:"100%",color:"#f0fdf4"}} onClick={()=>{try{setPlayer(JSON.parse(playerJson));setEditingPlayer(false);}catch{alert("Invalid JSON");}}}>Save Profile</button></>
            :<>
              <div style={{fontSize:12,color:"#d1fae5",fontWeight:500,marginBottom:8}}>{player.name} <span style={{fontSize:9,color:"#4b7a5e"}}>{player.handedness==="left"?"LH · ":""}Pro</span></div>
              <div style={{fontSize:9,color:"#4b7a5e",marginBottom:5,textTransform:"uppercase"}}>Off The Tee</div>
              <StatRow label="Driver Carry" value={player.off_the_tee?.clubs?.driver?.avg_carry_yards} unit="yds"/>
              <StatRow label="Driver FIR" value={`${((player.off_the_tee?.clubs?.driver?.fir_pct||0)*100).toFixed(0)}%`}/>
              <StatRow label="3W FIR" value={`${((player.off_the_tee?.clubs?.["3w"]?.fir_pct||0)*100).toFixed(0)}%`}/>
              <StatRow label="3i FIR" value={`${((player.off_the_tee?.clubs?.["3i"]?.fir_pct||0)*100).toFixed(0)}%`}/>
              <div style={{fontSize:9,color:"#4b7a5e",margin:"7px 0 5px",textTransform:"uppercase"}}>Approach</div>
              <StatRow label="SG: App" value={player.approach?.sg_approach_avg}/>
              <StatRow label="Best Range" value="120-140 yds"/>
              <StatRow label="Dom Miss" value={player.approach?.dominant_miss_real_world}/>
              <div style={{fontSize:9,color:"#4b7a5e",margin:"7px 0 5px",textTransform:"uppercase"}}>Putting</div>
              <StatRow label="SG: Putt" value={player.putting?.sg_putting_avg}/>
              <StatRow label="Scrambling" value={`${((player.around_green?.scrambling_pct||0)*100).toFixed(0)}%`}/>
              <StatRow label="Make% 6-10ft" value={`${((player.putting?.zones?.["6-10ft"]?.make_rate_pct||0)*100).toFixed(0)}%`}/>
            </>}
          </div>

          <button className="glow-btn" style={{padding:"12px 16px",borderRadius:8,fontSize:13,color:"#f0fdf4",fontFamily:"inherit",fontWeight:500,width:"100%"}} disabled={phase==="extracting"||phase==="strategizing"} onClick={runPipeline}>
            {phase==="extracting"?"⟳ Analyzing Image...":phase==="strategizing"?"⟳ Building Strategy...":"▶ Generate Strategy"}
          </button>

          {phase==="done"&&holeData&&<button onClick={rerun} style={{padding:"8px 16px",borderRadius:8,fontSize:11,color:"#4ade80",fontFamily:"inherit",background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.2)",cursor:"pointer",width:"100%"}}>↺ Re-run with goal override</button>}

          {error&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:10,fontSize:11,color:"#fca5a5"}}>⚠ {error}</div>}
        </div>

        {/* Right panel */}
        <div style={{overflowY:"auto",padding:20}}>

          {phase==="idle"&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:16}}>
              <div style={{fontSize:44,opacity:0.2}}>⛳</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:"#374151",textAlign:"center"}}>Upload a yardage book image<br/>to generate a hole strategy</div>
              <div style={{fontSize:11,color:"#1f2937",textAlign:"center",maxWidth:320,lineHeight:1.6}}>Set your game plan by hole type in the sidebar →<br/>Gemini detects the hole · Claude builds the strategy</div>
              <div className="panel" style={{padding:14,maxWidth:360,width:"100%"}}>
                <div style={{fontSize:11,color:"#4b7a5e",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,fontWeight:600}}>Current Game Plan</div>
                {HOLE_CATEGORIES.map(cat=>{const gc=GOAL_COLORS[gamePlan[cat.key]]||GOAL_COLORS["par protection"];return(
                  <div key={cat.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                    <div><span style={{fontSize:12,color:"#9ca3af"}}>{cat.icon} {cat.label}</span><span style={{fontSize:11,color:"#9ca3af",marginLeft:6}}>{cat.sub}</span></div>
                    <span style={{fontSize:11,padding:"3px 8px",borderRadius:3,background:gc.bg,border:`1px solid ${gc.border}`,color:gc.text}}>{gamePlan[cat.key]}</span>
                  </div>
                );})}
              </div>
            </div>
          )}

          {(phase==="extracting"||phase==="strategizing")&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:20}}>
              <div style={{width:44,height:44,borderRadius:"50%",border:"2px solid #16a34a20",borderTopColor:"#16a34a"}} className="spin"/>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:13,color:"#4ade80",marginBottom:5}}>{phase==="extracting"?"Analyzing yardage book...":"Building hole strategy..."}</div>
                <div style={{fontSize:10,color:"#374151"}}>{phase==="extracting"?"Gemini Vision extracting hole data":"Claude synthesizing strategy"}</div>
              </div>
              {holeData&&phase==="strategizing"&&(
                <div className="panel fade-in" style={{padding:14,maxWidth:380,width:"100%"}}>
                  <div style={{fontSize:9,color:"#4b7a5e",letterSpacing:"0.1em",marginBottom:8,textTransform:"uppercase"}}>Extracted ✓  |  Classifying hole...</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
                    {holeData.hole_number&&<StatRow label="Hole" value={holeData.hole_number}/>}
                    {holeData.par&&<StatRow label="Par" value={holeData.par}/>}
                    {holeData.yardages?.back&&<StatRow label="Back" value={holeData.yardages.back} unit="yds"/>}
                    {holeData.yardages?.middle&&<StatRow label="Middle" value={holeData.yardages.middle} unit="yds"/>}
                  </div>
                  {detectedCategory&&activeGoal&&(
                    <div style={{padding:"8px 10px",borderRadius:6,background:goalColor.bg,border:`1px solid ${goalColor.border}`}}>
                      <div style={{fontSize:9,color:goalColor.text,textTransform:"uppercase",letterSpacing:"0.1em"}}>Auto-classified</div>
                      <div style={{fontSize:12,color:goalColor.text,marginTop:3,fontWeight:500}}>{catMeta?.icon} {catMeta?.label} → {activeGoal}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {phase==="done"&&parsedStrategy.length>0&&(
            <div className="fade-in">
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:19,color:"#f0fdf4"}}>
                  {holeData?.hole_number?`Hole ${holeData.hole_number}`:"Strategy"}
                  {holeData?.par&&<span style={{color:"#4b7a5e",fontSize:13,marginLeft:8}}>Par {holeData.par}</span>}
                </div>
                {holeData?.yardages?.back&&<GlowBadge color="emerald">{holeData.yardages.back} yds</GlowBadge>}
                {holeData?.dogleg?.exists&&<GlowBadge color="amber">Dogleg {holeData.dogleg.direction}</GlowBadge>}
                {holeData?.elevation_change&&holeData.elevation_change!=="flat"&&<GlowBadge color="sky">{holeData.elevation_change}</GlowBadge>}
                {detectedCategory&&activeGoal&&(
                  <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:6,background:goalColor.bg,border:`1px solid ${goalColor.border}`}}>
                    <span style={{fontSize:10,color:"#6b7280"}}>{catMeta?.icon} {catMeta?.label}</span>
                    <span style={{fontSize:9,color:"#374151"}}>→</span>
                    <span style={{fontSize:10,color:goalColor.text,fontWeight:500}}>{activeGoal}</span>
                  </div>
                )}
                <span style={{marginLeft:"auto",fontSize:9,color:"#4b7a5e"}}>{player.name} · {weather.wind_speed_mph}mph {weather.wind_direction} · Pin {conditions.pin_position}</span>
              </div>

              <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto",paddingBottom:4}}>
                {parsedStrategy.map((s,i)=><button key={s.key} className={`section-tab ${activeSection===i?"active":""}`} onClick={()=>setActiveSection(i)}>{s.icon} {s.label}</button>)}
              </div>

              {parsedStrategy[activeSection]&&(
                <div className="panel fade-in" style={{padding:20}} key={activeSection}>
                  <div style={{fontSize:13,color:"#4ade80",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                    <span>{parsedStrategy[activeSection].icon}</span>
                    <span style={{fontFamily:"'Playfair Display',serif"}}>{parsedStrategy[activeSection].label}</span>
                    {activeSection===0&&activeGoal&&<span style={{marginLeft:"auto",fontSize:10,padding:"2px 8px",borderRadius:4,background:goalColor.bg,border:`1px solid ${goalColor.border}`,color:goalColor.text}}>{activeGoal}</span>}
                  </div>
                  {parsedStrategy[activeSection].lines.length>0
                    ?<div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {parsedStrategy[activeSection].lines.map((line,i)=>(
                        <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",borderBottom:"1px solid rgba(255,255,255,0.04)",paddingBottom:10}}>
                          <div style={{width:20,height:20,borderRadius:4,background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#4ade80",flexShrink:0,marginTop:1}}>{i+1}</div>
                          <div style={{fontSize:13,color:"#d1d5db",lineHeight:1.6}}>{line}</div>
                        </div>
                      ))}
                    </div>
                    :<div style={{fontSize:12,color:"#374151"}}>No data for this section</div>
                  }
                </div>
              )}

              {holeData&&(
                <div className="panel" style={{padding:16,marginTop:14}}>
                  <div style={{fontSize:9,color:"#4b7a5e",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10}}>Gemini Extraction · Raw Hole Data</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
                    {holeData.yardages&&Object.entries(holeData.yardages).filter(([,v])=>v).map(([k,v])=>(
                      <div key={k} style={{background:"rgba(255,255,255,0.02)",borderRadius:6,padding:"7px 10px"}}>
                        <div style={{fontSize:8,color:"#4b7a5e",textTransform:"uppercase",letterSpacing:"0.1em"}}>{k}</div>
                        <div style={{fontSize:17,color:"#d1fae5",fontWeight:500,marginTop:2}}>{v}</div>
                        <div style={{fontSize:8,color:"#374151"}}>yards</div>
                      </div>
                    ))}
                    {holeData.green&&Object.entries({"Front":holeData.green.front_distance,"Mid":holeData.green.middle_distance,"Back":holeData.green.back_distance}).filter(([,v])=>v).map(([k,v])=>(
                      <div key={k} style={{background:"rgba(255,255,255,0.02)",borderRadius:6,padding:"7px 10px"}}>
                        <div style={{fontSize:8,color:"#4b7a5e",textTransform:"uppercase",letterSpacing:"0.1em"}}>Green {k}</div>
                        <div style={{fontSize:17,color:"#d1fae5",fontWeight:500,marginTop:2}}>{v}</div>
                        <div style={{fontSize:8,color:"#374151"}}>yards</div>
                      </div>
                    ))}
                  </div>
                  {holeData.hazards?.length>0&&(
                    <div style={{marginTop:10}}>
                      <div style={{fontSize:9,color:"#6b7280",marginBottom:5}}>Hazards</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                        {holeData.hazards.map((h,i)=><div key={i} style={{fontSize:9,color:"#9ca3af",background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.15)",borderRadius:4,padding:"2px 7px"}}>{h.type} · {h.location}{h.distance_from_tee?` · ${h.distance_from_tee}yds`:""}</div>)}
                      </div>
                    </div>
                  )}
                  <button onClick={reset} style={{marginTop:12,fontSize:10,color:"#4b7a5e",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>← Analyze another hole</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>}

      {showAnalytics&&(
        <>
          <div onClick={()=>setShowAnalytics(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:40,backdropFilter:"blur(2px)"}}/>
          <div style={{position:"fixed",top:0,right:0,width:"min(860px, 92vw)",height:"100vh",zIndex:50,background:"#080e0b",borderLeft:"1px solid rgba(255,255,255,0.08)",boxShadow:"-20px 0 60px rgba(0,0,0,0.6)",animation:"slideIn 0.28s cubic-bezier(0.34,1.1,0.64,1)"}}>
            <ClippdDashboard onClose={()=>setShowAnalytics(false)}/>
          </div>
        </>
      )}
    </div>
  );
}
