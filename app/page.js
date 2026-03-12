'use client';
import { useState, useRef, useCallback, useEffect } from "react";

const GPT4O_MODEL = "gpt-4o";

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

// ─── Player DNA ───────────────────────────────────────────────────────────────
const SHOT_SHAPES = [
  { value: "draw", label: "Draw", note: "Right-to-left (RH) / Left-to-right (LH)" },
  { value: "fade", label: "Fade", note: "Left-to-right (RH) / Right-to-left (LH)" },
  { value: "straight", label: "Straight", note: "Minimal lateral movement" },
  { value: "strong_draw", label: "Strong Draw", note: "Significant curvature" },
  { value: "strong_fade", label: "Strong Fade", note: "Significant curvature" },
];
const BALL_FLIGHTS = [
  { value: "tumbler", label: "Tumbler", icon: "🔽", note: "Below avg spin & apex", implications: "Plays shorter, more run-out, wind-resistant, less stopping power." },
  { value: "floater", label: "Floater", icon: "🎈", note: "Above avg spin & apex", implications: "Vulnerable to headwinds, high stopping power. Adjust 1-2 clubs into wind." },
  { value: "riser", label: "Riser", icon: "📈", note: "High spin, low apex, low launch", implications: "Excellent wind performance off tee. Low launch clears hazards." },
  { value: "knuckler", label: "Knuckler", icon: "🌀", note: "Low spin, high apex, high launch", implications: "Susceptible to crosswinds. Less green-holding at distance." },
];
const DEFAULT_PLAYER_DNA = { dexterity: "left", stock_shape: "fade", ball_flight: "tumbler", notes: "" };

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

// ─── GPT-4o Vision + Strategy (single call) ──────────────────────────────────

async function generateStrategyWithGPT4o(base64Image, mimeType, playerProfile, playerDna, weather, conditions, gamePlan) {
  const shapeMeta  = SHOT_SHAPES.find(s => s.value === playerDna.stock_shape);
  const flightMeta = BALL_FLIGHTS.find(f => f.value === playerDna.ball_flight);

  const systemPrompt = `You are an elite PGA Tour caddie and golf strategist with deep knowledge of performance analytics. You receive a yardage book image and player data, and return a complete structured hole strategy.

KEY RULES:
1. READ THE IMAGE FIRST: Extract hole number, par, yardages, hazards, landing zones, green dimensions, dogleg, and elevation from the yardage book image.
2. CLASSIFY THE HOLE: Based on par and yardage, determine the hole category and pull the correct scoring goal from the game plan provided.
3. SCORING GOAL FIRST: Open hole_overview by stating the scoring goal and why the hole falls into that category.
4. DIRECTIONAL AWARENESS: Player is left-handed. All miss directions in the profile are real-world corrected. Use them as stated.
5. APPROACH DISTANCE MANAGEMENT: Engineer tee shot to leave optimal approach yardage per scoring zones. This is the #1 lever.
6. PIN LOCATION HEATMAPS: Cross-reference pin position with heatmap SQ scores. State the SQ score and whether to attack or bail.
7. TEE CLUB SELECTION: Use FIR% and miss data — not just distance.
8. GOAL-CALIBRATED AGGRESSION: Eagle attempt = go for it. Par protection = remove risk, accept bogey before double.
9. PLAYER DNA: Factor ball flight archetype into every club recommendation. Account for stock shot shape in target lines and miss management.

OUTPUT FORMAT — return ONLY a raw JSON object with exactly these 7 keys. No markdown, no backticks, no preamble:
{
  "hole_data": {
    "hole_number": integer or null,
    "par": integer or null,
    "yardages": { "back": integer or null, "middle": integer or null, "forward": integer or null },
    "hazards": [{ "type": "Bunker | Water | OB | Trees", "side": "left | right | center", "distance_to_carry": integer or null }],
    "dogleg": { "direction": "left | right | none", "distance_to_pivot": integer or null },
    "elevation_change": "uphill | downhill | flat | unknown",
    "green": { "front_distance": integer or null, "middle_distance": integer or null, "back_distance": integer or null }
  },
  "hole_overview": ["bullet 1", "bullet 2", ...],
  "tee_shot": ["bullet 1", "bullet 2", ...],
  "approach": ["bullet 1", "bullet 2", ...],
  "scoring_zone": ["bullet 1", "bullet 2", ...],
  "risk_reward": ["bullet 1", "bullet 2", ...],
  "key_numbers": ["bullet 1", "bullet 2", ...]
}
Each strategy key must be an array of 3-6 concise bullet strings. Reference specific yardages, clubs, and heatmap SQ scores throughout.`;

  const userContent = [
    {
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${base64Image}`,
        detail: "high",
      },
    },
    {
      type: "text",
      text: `Analyze this yardage book image and build a complete hole strategy.

COACH GAME PLAN (scoring goal by hole type):
${JSON.stringify(Object.fromEntries(HOLE_CATEGORIES.map(c => [c.label + " (" + c.sub + ")", gamePlan[c.key]])), null, 2)}

PLAYER DNA:
- Dexterity: ${playerDna.dexterity}-handed
- Stock Shot Shape: ${shapeMeta?.label || playerDna.stock_shape} — ${shapeMeta?.note || ""}
- Ball Flight Archetype: ${flightMeta?.label || playerDna.ball_flight} (${flightMeta?.note || ""})
  · ${flightMeta?.description || ""}
  · Strategy implication: ${flightMeta?.implications || ""}
${playerDna.notes ? `- Coach Notes: ${playerDna.notes}` : ""}

PLAYER PROFILE (full ClippD analytics):
${JSON.stringify(playerProfile, null, 2)}

WEATHER:
- Wind effect on this hole: ${weather.wind_effect} (${weather.wind_tier === "light" ? "light, 1-10 mph" : weather.wind_tier === "moderate" ? "moderate, 11-20 mph" : "strong, 20+ mph"})
- Temperature: ${weather.temperature_f}F
- Green speed: Stimp ${weather.green_speed_stimp}
- Course firmness: ${weather.firmness}

COURSE CONDITIONS:
- Pin position: ${conditions.pin_position}
- Rough height: ${conditions.rough_height_inches} inches
- Fairway roll: ${conditions.fairway_roll_yards} yards

Instructions:
- Read the image carefully — extract all visible yardages, hazards, landing zones, green info
- Match hole to the correct game plan category and scoring goal
- Use approach scoring zones to determine ideal tee shot layup distance
- Check pin_location_heatmaps for the current pin position at expected approach distance
- State the heatmap SQ score and whether to attack or bail
- Account for dominant miss direction on every shot
- Compare tee clubs by FIR% not just distance`,
    },
  ];

  const response = await fetch("/api/strategy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GPT4O_MODEL,
      max_tokens: 1500,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "Strategy API error");
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

const SECTION_META = [
  { key: "hole_overview", label: "Hole Overview", icon: "🗺️" },
  { key: "tee_shot",      label: "Tee Shot",       icon: "🏌️" },
  { key: "approach",      label: "Approach",        icon: "🎯" },
  { key: "scoring_zone",  label: "Scoring Zone",   icon: "📍" },
  { key: "risk_reward",   label: "Risk / Reward",  icon: "⚖️" },
  { key: "key_numbers",   label: "Key Numbers",    icon: "📐" },
];

function parseStrategy(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return SECTION_META.map(s => ({
      ...s,
      lines: s.key === "hole_overview" ? ["Strategy response could not be parsed. Try regenerating."] : [],
    }));
  }
  return SECTION_META.map(s => ({
    ...s,
    lines: Array.isArray(parsed[s.key])
      ? parsed[s.key].map(l => String(l).replace(/^[-•*]\s*/, "").trim()).filter(Boolean)
      : typeof parsed[s.key] === "string"
        ? [parsed[s.key]]
        : [],
  }));
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
  return <span style={{fontSize:12,padding:"3px 10px",borderRadius:4,background:c.bg,border:`1px solid ${c.border}`,color:c.text,fontFamily:"inherit",...style}}>{children}</span>;
};

const StatRow = ({ label, value, unit }) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
    <span style={{fontSize:12,color:"#c4cdd8"}}>{label}</span>
    <span style={{fontSize:13,color:"#f0fdf4",fontWeight:500}}>{value}{unit?<span style={{color:"#6dab82",marginLeft:2}}>{unit}</span>:""}</span>
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
              <div style={{fontSize:13,color:isDetected?"#4ade80":"#c4cdd8",lineHeight:1.3,fontWeight:isDetected?600:400}}>{cat.label} {isDetected&&<span style={{fontSize:11,color:"#6dab82"}}>← detected</span>}</div>
              <div style={{fontSize:12,color:"#9ca3af"}}>{cat.sub}</div>
            </div>
            <select value={gamePlan[cat.key]} onChange={e=>{const u={...gamePlan,[cat.key]:e.target.value};setGamePlan(u);if(isDetected)setActiveGoal(e.target.value);}}
              style={{background:gc.bg,border:`1px solid ${gc.border}`,color:gc.text,borderRadius:4,fontSize:12,padding:"5px 9px",fontFamily:"inherit",cursor:"pointer",outline:"none",flexShrink:0}}>
              {GOAL_OPTIONS.map(g=><option key={g} value={g} style={{background:"#0d1a12"}}>{g}</option>)}
            </select>
          </div>
        );
      })}
      {detectedCategory && (
        <div style={{marginTop:12,padding:"10px 12px",borderRadius:6,background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)"}}>
          <div style={{fontSize:12,color:"#6dab82",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6,fontWeight:600}}>Active Goal Override</div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:13,color:"#c4cdd8",flex:1}}>Current hole:</span>
            <select value={activeGoal} onChange={e=>setActiveGoal(e.target.value)}
              style={{background:(GOAL_COLORS[activeGoal]||GOAL_COLORS["par protection"]).bg,border:`1px solid ${(GOAL_COLORS[activeGoal]||GOAL_COLORS["par protection"]).border}`,color:(GOAL_COLORS[activeGoal]||GOAL_COLORS["par protection"]).text,borderRadius:4,fontSize:13,padding:"5px 10px",fontFamily:"inherit",cursor:"pointer",outline:"none"}}>
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
  const [imagePreview,setImagePreview]=useState(null); // object URL — not base64 (avoids Chrome crash)
  const [imageMime,setImageMime]=useState("image/jpeg");
  const imageBase64Ref=useRef(null);
  const previewUrlRef=useRef(null);
  const [weather,setWeather]=useState({wind_effect:"into",wind_tier:"moderate",temperature_f:72,firmness:"normal",green_speed_stimp:11});
  const [conditions,setConditions]=useState({pin_position:"middle-center",rough_height_inches:2.5,fairway_roll_yards:6});
  const [player,setPlayer]=useState(DEFAULT_PLAYER);
  const [editingPlayer,setEditingPlayer]=useState(false);
  const [playerJson,setPlayerJson]=useState(()=>JSON.stringify(DEFAULT_PLAYER,null,2));
  const [playerDna,setPlayerDna]=useState(DEFAULT_PLAYER_DNA);
  const [showDna,setShowDna]=useState(true);
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

  const handleImageChange=useCallback((file)=>{
    if(!file)return;
    setImageFile(file);setImageMime(file.type||"image/jpeg");
    if(previewUrlRef.current){URL.revokeObjectURL(previewUrlRef.current);}
    const objectUrl=URL.createObjectURL(file);
    previewUrlRef.current=objectUrl;
    setImagePreview(objectUrl);
    const r=new FileReader();
    r.onload=e=>{imageBase64Ref.current=e.target.result.split(",")[1];};
    r.readAsDataURL(file);
  },[]);

  useEffect(()=>{
    return ()=>{if(previewUrlRef.current)URL.revokeObjectURL(previewUrlRef.current);};
  },[]);

  const handleDrop=useCallback(e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f?.type.startsWith("image/"))handleImageChange(f);},[handleImageChange]);

  const runPipeline=async()=>{
    if(!imageBase64Ref.current){setError("Upload a yardage book image");return;}
    setError("");setHoleData(null);setParsedStrategy([]);setDetectedCategory(null);setActiveGoal(null);
    try{
      setPhase("thinking");
      const result=await generateStrategyWithGPT4o(imageBase64Ref.current,imageMime,player,playerDna,weather,conditions,gamePlan);
      const extracted=result.hole_data||{};
      setHoleData(extracted);
      const category=classifyHole(extracted,player);
      const goal=gamePlan[category];
      setDetectedCategory(category);setActiveGoal(goal);
      setParsedStrategy(parseStrategy(result));setPhase("done");setActiveSection(0);
    }catch(e){setError(e.message);setPhase("error");}
  };

  const rerunWithOverride=async()=>{
    if(!holeData||!activeGoal)return;
    setError("");setParsedStrategy([]);
    try{
      setPhase("thinking");
      const result=await generateStrategyWithGPT4o(imageBase64Ref.current,imageMime,player,playerDna,weather,conditions,gamePlan);
      const extracted=result.hole_data||holeData;
      setHoleData(extracted);
      const category=classifyHole(extracted,player);
      const goal=gamePlan[category];
      setDetectedCategory(category);setActiveGoal(goal);
      setParsedStrategy(parseStrategy(result));setPhase("done");setActiveSection(0);
    }catch(e){setError(e.message);setPhase("error");}
  };

  const reset=()=>{
    if(previewUrlRef.current){URL.revokeObjectURL(previewUrlRef.current);previewUrlRef.current=null;}
    imageBase64Ref.current=null;
    setPhase("idle");setImageFile(null);setImagePreview(null);setHoleData(null);setParsedStrategy([]);setDetectedCategory(null);setActiveGoal(null);
  };

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
        .input-field{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#f0fdf4;font-family:inherit;font-size:13px;padding:7px 10px;width:100%;outline:none;transition:border-color 0.2s}
        .input-field:focus{border-color:#22c55e60}
        select.input-field option{background:#0d1a12}
        .section-tab{padding:7px 16px;border-radius:6px;font-size:13px;cursor:pointer;border:1px solid transparent;transition:all 0.15s;background:transparent;color:#9ca3af;font-family:inherit;white-space:nowrap}
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
            <div style={{fontSize:11,color:"#6dab82",letterSpacing:"0.15em",textTransform:"uppercase"}}>Course Strategy Engine</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {activeGoal&&<div style={{padding:"4px 12px",borderRadius:6,background:goalColor.bg,border:`1px solid ${goalColor.border}`,color:goalColor.text,fontSize:11,fontWeight:500}} className="goal-pulse">{catMeta?.icon} {activeGoal}</div>}
          <GlowBadge color="emerald">AI Vision</GlowBadge>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"340px 1fr",height:"calc(100vh - 63px)"}}>

        {/* Left sidebar */}
        <div style={{borderRight:"1px solid rgba(255,255,255,0.06)",padding:16,overflowY:"auto",display:"flex",flexDirection:"column",gap:12}}>

          {/* Image upload */}
          <div className="panel" style={{padding:14}}>
            <div style={{fontSize:13,color:"#6dab82",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Yardage Book Image</div>
            <div className="drop-zone" style={{border:"1px dashed rgba(255,255,255,0.12)",borderRadius:8,padding:imagePreview?0:"18px 16px",textAlign:"center",cursor:"pointer",overflow:"hidden",transition:"all 0.2s"}}
              onClick={()=>fileRef.current?.click()} onDrop={handleDrop} onDragOver={e=>e.preventDefault()}>
              {imagePreview?<img src={imagePreview} alt="Yardage book" style={{width:"100%",display:"block",borderRadius:8}}/>:<><div style={{fontSize:22,marginBottom:4}}>📷</div><div style={{fontSize:13,color:"#c4cdd8"}}>Drop or click to upload</div><div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>JPG · PNG · WEBP</div></>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleImageChange(e.target.files[0])}/>
            {imageFile&&<div style={{fontSize:12,color:"#6dab82",marginTop:5}}>✓ {imageFile.name}</div>}
          </div>

          {/* Game plan */}
          <div className="panel" style={{padding:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div>
                <div style={{fontSize:14,color:"#6dab82",letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:600}}>Coach Game Plan</div>
                <div style={{fontSize:12,color:"#c4cdd8",marginTop:2}}>Scoring goal by hole type</div>
              </div>
              <button onClick={()=>setShowGamePlan(!showGamePlan)} style={{fontSize:12,color:"#9ca3af",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>{showGamePlan?"collapse ↑":"expand ↓"}</button>
            </div>
            {showGamePlan
              ?<GamePlanPanel gamePlan={gamePlan} setGamePlan={setGamePlan} detectedCategory={detectedCategory} activeGoal={activeGoal} setActiveGoal={setActiveGoal}/>
              :<div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {HOLE_CATEGORIES.map(cat=>{const gc=GOAL_COLORS[gamePlan[cat.key]]||GOAL_COLORS["par protection"];return<span key={cat.key} style={{fontSize:11,padding:"4px 8px",borderRadius:3,background:gc.bg,border:`1px solid ${gc.border}`,color:gc.text}}>{cat.label.split("·")[1]?.trim()}: {gamePlan[cat.key]}</span>;})}
              </div>
            }
          </div>

          {/* Weather — Wind Rose + Speed Tier */}
          <div className="panel" style={{padding:14}}>
            <div style={{fontSize:13,color:"#6dab82",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12,fontWeight:600}}>Weather</div>
            {/* Wind Rose */}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,color:"#c4cdd8",marginBottom:8}}>Wind effect on this hole</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:4,maxWidth:200,margin:"0 auto"}}>
                {[
                  {key:"into-L",label:"↙ Into-L",pos:0},
                  {key:"into",label:"↓ Into",pos:1},
                  {key:"into-R",label:"↘ Into-R",pos:2},
                  {key:"R→L",label:"← R→L",pos:3},
                  {key:null,label:"⛳",pos:4},
                  {key:"L→R",label:"L→R →",pos:5},
                  {key:"down-L",label:"↖ Down-L",pos:6},
                  {key:"down",label:"↑ Down",pos:7},
                  {key:"down-R",label:"↗ Down-R",pos:8},
                ].map(({key,label,pos})=>{
                  if(key===null)return(
                    <div key={pos} style={{padding:"8px 4px",borderRadius:6,fontSize:14,textAlign:"center",background:"rgba(34,197,94,0.06)",border:"1px solid rgba(34,197,94,0.15)",color:"#6dab82",display:"flex",alignItems:"center",justifyContent:"center"}}>{label}</div>
                  );
                  const active=weather.wind_effect===key;
                  return(
                    <button key={pos} onClick={()=>setWeather({...weather,wind_effect:key})}
                      style={{padding:"7px 4px",borderRadius:6,fontSize:10,cursor:"pointer",fontFamily:"inherit",textAlign:"center",transition:"all 0.12s",
                        background:active?"rgba(96,165,250,0.15)":"rgba(255,255,255,0.03)",
                        border:`1px solid ${active?"rgba(96,165,250,0.45)":"rgba(255,255,255,0.07)"}`,
                        color:active?"#93c5fd":"#9ca3af",fontWeight:active?500:400,lineHeight:1.3}}>
                      {label}
                    </button>
                  );
                })}
              </div>
              <div style={{textAlign:"center",marginTop:8,fontSize:11,color:"#60a5fa"}}>{weather.wind_effect?`Wind: ${weather.wind_effect}`:<span style={{color:"#9ca3af"}}>tap a direction</span>}</div>
            </div>
            {/* Wind Speed Tier */}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,color:"#c4cdd8",marginBottom:6}}>Wind strength</div>
              <div style={{display:"flex",gap:5}}>
                {[
                  {key:"light",label:"🟢 Light",sub:"1–10 mph"},
                  {key:"moderate",label:"🟡 Moderate",sub:"11–20 mph"},
                  {key:"strong",label:"🔴 Strong",sub:"20+ mph"},
                ].map(tier=>{
                  const active=weather.wind_tier===tier.key;
                  return(
                    <button key={tier.key} onClick={()=>setWeather({...weather,wind_tier:tier.key})}
                      style={{flex:1,padding:"7px 4px",borderRadius:6,fontSize:10,cursor:"pointer",fontFamily:"inherit",textAlign:"center",transition:"all 0.12s",lineHeight:1.4,
                        background:active?"rgba(255,255,255,0.07)":"rgba(255,255,255,0.02)",
                        border:`1px solid ${active?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.06)"}`,
                        color:active?"#e4e9e6":"#9ca3af"}}>
                      <div>{tier.label}</div>
                      <div style={{fontSize:9,opacity:0.7,marginTop:2}}>{tier.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Temp / Stimp / Firmness */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div><div style={{fontSize:12,color:"#c4cdd8",marginBottom:4}}>Temp (°F)</div><input type="number" className="input-field" value={weather.temperature_f} onChange={e=>setWeather({...weather,temperature_f:+e.target.value})}/></div>
              <div><div style={{fontSize:12,color:"#c4cdd8",marginBottom:4}}>Stimp</div><input type="number" className="input-field" value={weather.green_speed_stimp} onChange={e=>setWeather({...weather,green_speed_stimp:+e.target.value})}/></div>
              <div style={{gridColumn:"span 2"}}><div style={{fontSize:12,color:"#c4cdd8",marginBottom:4}}>Firmness</div><select className="input-field" value={weather.firmness} onChange={e=>setWeather({...weather,firmness:e.target.value})}>{["soft","normal","firm","hard"].map(f=><option key={f}>{f}</option>)}</select></div>
            </div>
          </div>

          {/* Conditions */}
          <div className="panel" style={{padding:14}}>
            <div style={{fontSize:13,color:"#6dab82",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Round Conditions</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div style={{gridColumn:"span 2"}}><div style={{fontSize:12,color:"#c4cdd8",marginBottom:4}}>Pin Position</div><select className="input-field" value={conditions.pin_position} onChange={e=>setConditions({...conditions,pin_position:e.target.value})}>{pinLabels.map(p=><option key={p}>{p}</option>)}</select></div>
              <div><div style={{fontSize:12,color:"#c4cdd8",marginBottom:4}}>Rough (in)</div><input type="number" step="0.5" className="input-field" value={conditions.rough_height_inches} onChange={e=>setConditions({...conditions,rough_height_inches:+e.target.value})}/></div>
              <div><div style={{fontSize:12,color:"#c4cdd8",marginBottom:4}}>Roll (yds)</div><input type="number" className="input-field" value={conditions.fairway_roll_yards} onChange={e=>setConditions({...conditions,fairway_roll_yards:+e.target.value})}/></div>
            </div>
          </div>

          {/* Player */}
          <div className="panel" style={{padding:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{fontSize:13,color:"#6dab82",letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:600}}>Player Profile</div>
              <button onClick={()=>setEditingPlayer(!editingPlayer)} style={{fontSize:12,color:editingPlayer?"#4ade80":"#9ca3af",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>{editingPlayer?"← back":"edit ✎"}</button>
            </div>
            {editingPlayer?<><textarea className="input-field" style={{height:180,resize:"vertical",fontSize:10,lineHeight:1.5}} value={playerJson} onChange={e=>setPlayerJson(e.target.value)}/><button className="glow-btn" style={{marginTop:8,padding:"6px 12px",fontSize:11,borderRadius:6,width:"100%",color:"#f0fdf4"}} onClick={()=>{try{setPlayer(JSON.parse(playerJson));setEditingPlayer(false);}catch{alert("Invalid JSON");}}}>Save Profile</button></>
            :<>
              <div style={{fontSize:14,color:"#d1fae5",fontWeight:500,marginBottom:8}}>{player.name} <span style={{fontSize:12,color:"#6dab82"}}>{player.handedness==="left"?"LH · ":""}Pro</span></div>
              <div style={{fontSize:12,color:"#6dab82",marginBottom:5,textTransform:"uppercase",fontWeight:600}}>Off The Tee</div>
              <StatRow label="Driver Carry" value={player.off_the_tee?.clubs?.driver?.avg_carry_yards} unit="yds"/>
              <StatRow label="Driver FIR" value={`${((player.off_the_tee?.clubs?.driver?.fir_pct||0)*100).toFixed(0)}%`}/>
              <StatRow label="3W FIR" value={`${((player.off_the_tee?.clubs?.["3w"]?.fir_pct||0)*100).toFixed(0)}%`}/>
              <StatRow label="3i FIR" value={`${((player.off_the_tee?.clubs?.["3i"]?.fir_pct||0)*100).toFixed(0)}%`}/>
              <div style={{fontSize:12,color:"#6dab82",margin:"7px 0 5px",textTransform:"uppercase",fontWeight:600}}>Approach</div>
              <StatRow label="SG: App" value={player.approach?.sg_approach_avg}/>
              <StatRow label="Best Range" value="120-140 yds"/>
              <StatRow label="Dom Miss" value={player.approach?.dominant_miss_real_world}/>
              <div style={{fontSize:12,color:"#6dab82",margin:"7px 0 5px",textTransform:"uppercase",fontWeight:600}}>Putting</div>
              <StatRow label="SG: Putt" value={player.putting?.sg_putting_avg}/>
              <StatRow label="Scrambling" value={`${((player.around_green?.scrambling_pct||0)*100).toFixed(0)}%`}/>
              <StatRow label="Make% 6-10ft" value={`${((player.putting?.zones?.["6-10ft"]?.make_rate_pct||0)*100).toFixed(0)}%`}/>
            </>}
          </div>

          {/* Player DNA */}
          <div className="panel" style={{padding:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:showDna?12:0}}>
              <div>
                <div style={{fontSize:13,color:"#6dab82",letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:600}}>Player DNA</div>
                <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>Shot shape & ball flight</div>
              </div>
              <button onClick={()=>setShowDna(!showDna)} style={{fontSize:12,color:"#9ca3af",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>{showDna?"collapse ↑":"expand ↓"}</button>
            </div>
            {!showDna&&(
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <span style={{fontSize:12,padding:"3px 8px",borderRadius:3,background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.2)",color:"#4ade80"}}>{playerDna.dexterity==="left"?"LH":"RH"}</span>
                <span style={{fontSize:12,padding:"3px 8px",borderRadius:3,background:"rgba(96,165,250,0.08)",border:"1px solid rgba(96,165,250,0.2)",color:"#93c5fd"}}>{SHOT_SHAPES.find(s=>s.value===playerDna.stock_shape)?.label||playerDna.stock_shape}</span>
                <span style={{fontSize:12,padding:"3px 8px",borderRadius:3,background:"rgba(251,191,36,0.08)",border:"1px solid rgba(251,191,36,0.2)",color:"#fcd34d"}}>{BALL_FLIGHTS.find(f=>f.value===playerDna.ball_flight)?.label||playerDna.ball_flight}</span>
              </div>
            )}
            {showDna&&(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div>
                  <div style={{fontSize:12,color:"#c4cdd8",marginBottom:5}}>Dexterity</div>
                  <div style={{display:"flex",gap:6}}>
                    {["left","right"].map(hand=>(
                      <button key={hand} onClick={()=>setPlayerDna({...playerDna,dexterity:hand})}
                        style={{flex:1,padding:"6px 0",borderRadius:6,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all 0.14s",
                          background:playerDna.dexterity===hand?"rgba(34,197,94,0.12)":"rgba(255,255,255,0.03)",
                          border:`1px solid ${playerDna.dexterity===hand?"rgba(34,197,94,0.35)":"rgba(255,255,255,0.08)"}`,
                          color:playerDna.dexterity===hand?"#4ade80":"#9ca3af"}}>
                        {hand==="left"?"Left-handed":"Right-handed"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:12,color:"#c4cdd8",marginBottom:5}}>Stock Shot Shape</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                    {SHOT_SHAPES.map(shape=>{
                      const active=playerDna.stock_shape===shape.value;
                      return (
                        <button key={shape.value} onClick={()=>setPlayerDna({...playerDna,stock_shape:shape.value})}
                          style={{padding:"6px 8px",borderRadius:6,fontSize:11,cursor:"pointer",fontFamily:"inherit",transition:"all 0.14s",textAlign:"left",
                            background:active?"rgba(96,165,250,0.1)":"rgba(255,255,255,0.03)",
                            border:`1px solid ${active?"rgba(96,165,250,0.35)":"rgba(255,255,255,0.08)"}`,
                            color:active?"#93c5fd":"#9ca3af",gridColumn:shape.value==="straight"?"span 2":"span 1"}}>
                          {shape.label}
                          {active&&<div style={{fontSize:10,color:"#60a5fa",marginTop:2,lineHeight:1.3}}>{shape.note}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:12,color:"#c4cdd8",marginBottom:5}}>Ball Flight Archetype</div>
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {BALL_FLIGHTS.map(flight=>{
                      const active=playerDna.ball_flight===flight.value;
                      return (
                        <button key={flight.value} onClick={()=>setPlayerDna({...playerDna,ball_flight:flight.value})}
                          style={{padding:"7px 10px",borderRadius:6,fontSize:11,cursor:"pointer",fontFamily:"inherit",transition:"all 0.14s",textAlign:"left",
                            background:active?"rgba(251,191,36,0.08)":"rgba(255,255,255,0.03)",
                            border:`1px solid ${active?"rgba(251,191,36,0.3)":"rgba(255,255,255,0.08)"}`,
                            color:active?"#fcd34d":"#9ca3af"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:12}}>{flight.icon}</span>
                            <span style={{fontWeight:active?500:400}}>{flight.label}</span>
                            <span style={{fontSize:10,color:active?"#92400e":"#9ca3af",marginLeft:"auto"}}>{flight.note}</span>
                          </div>
                          {active&&<div style={{fontSize:10,color:"#d97706",marginTop:5,lineHeight:1.5,borderTop:"1px solid rgba(251,191,36,0.15)",paddingTop:5}}>{flight.implications}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:12,color:"#c4cdd8",marginBottom:4}}>Coach Notes <span style={{color:"#9ca3af"}}>(optional)</span></div>
                  <textarea className="input-field" placeholder="e.g. struggles with low punch shots, excellent at shaping..."
                    value={playerDna.notes} onChange={e=>setPlayerDna({...playerDna,notes:e.target.value})}
                    style={{height:56,resize:"none",fontSize:12,lineHeight:1.5}}/>
                </div>
              </div>
            )}
          </div>

          <button className="glow-btn" style={{padding:"12px 16px",borderRadius:8,fontSize:13,color:"#f0fdf4",fontFamily:"inherit",fontWeight:500,width:"100%"}} disabled={phase==="thinking"} onClick={runPipeline}>
            {phase==="thinking"?"⟳ Analyzing & Building Strategy...":"▶ Generate Strategy"}
          </button>

          {phase==="done"&&holeData&&<button onClick={rerunWithOverride} style={{padding:"8px 16px",borderRadius:8,fontSize:13,color:"#4ade80",fontFamily:"inherit",background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.2)",cursor:"pointer",width:"100%"}}>↺ Re-run with current goal override</button>}

          {error&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:10,fontSize:13,color:"#fca5a5"}}>⚠ {error}</div>}
        </div>

        {/* Right panel */}
        <div style={{overflowY:"auto",padding:20}}>

          {phase==="idle"&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:16}}>
              <div style={{fontSize:44,opacity:0.2}}>⛳</div>
              <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:"#c4cdd8",textAlign:"center"}}>Upload a yardage book image<br/>to generate a hole strategy</div>
              <div style={{fontSize:14,color:"#9ca3af",textAlign:"center",maxWidth:320,lineHeight:1.6}}>Set your game plan by hole type in the sidebar →<br/>AI reads the image · builds the strategy in one shot</div>
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

          {phase==="thinking"&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:20}}>
              <div style={{width:44,height:44,borderRadius:"50%",border:"2px solid #16a34a20",borderTopColor:"#16a34a"}} className="spin"/>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:13,color:"#4ade80",marginBottom:5}}>Reading yardage book & building strategy...</div>
                <div style={{fontSize:10,color:"#9ca3af"}}>Analyzing image and player data</div>
              </div>
            </div>
          )}

          {phase==="done"&&parsedStrategy.length>0&&(
            <div className="fade-in">
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:19,color:"#f0fdf4"}}>
                  {holeData?.hole_number?`Hole ${holeData.hole_number}`:"Strategy"}
                  {holeData?.par&&<span style={{color:"#6dab82",fontSize:14,marginLeft:8}}>Par {holeData.par}</span>}
                </div>
                {holeData?.yardages?.back&&<GlowBadge color="emerald">{holeData.yardages.back} yds</GlowBadge>}
                {holeData?.dogleg?.direction&&holeData.dogleg.direction!=="none"&&<GlowBadge color="amber">Dogleg {holeData.dogleg.direction}</GlowBadge>}
                {holeData?.elevation_change&&holeData.elevation_change!=="flat"&&<GlowBadge color="sky">{holeData.elevation_change}</GlowBadge>}
                {detectedCategory&&activeGoal&&(
                  <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:6,background:goalColor.bg,border:`1px solid ${goalColor.border}`}}>
                    <span style={{fontSize:12,color:"#c4cdd8"}}>{catMeta?.icon} {catMeta?.label}</span>
                    <span style={{fontSize:12,color:"#6b7280"}}>→</span>
                    <span style={{fontSize:12,color:goalColor.text,fontWeight:600}}>{activeGoal}</span>
                  </div>
                )}
                <span style={{marginLeft:"auto",fontSize:12,color:"#6dab82"}}>{player.name} · {weather.wind_tier} {weather.wind_effect} · Pin {conditions.pin_position}</span>
              </div>

              <div style={{display:"flex",gap:6,marginBottom:14,overflowX:"auto",paddingBottom:4}}>
                {parsedStrategy.map((s,i)=><button key={s.key} className={`section-tab ${activeSection===i?"active":""}`} onClick={()=>setActiveSection(i)}>{s.icon} {s.label}</button>)}
              </div>

              {parsedStrategy[activeSection]&&(
                <div className="panel fade-in" style={{padding:20}} key={activeSection}>
                  <div style={{fontSize:15,color:"#4ade80",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                    <span>{parsedStrategy[activeSection].icon}</span>
                    <span style={{fontFamily:"'Playfair Display',serif"}}>{parsedStrategy[activeSection].label}</span>
                    {activeSection===0&&activeGoal&&<span style={{marginLeft:"auto",fontSize:10,padding:"2px 8px",borderRadius:4,background:goalColor.bg,border:`1px solid ${goalColor.border}`,color:goalColor.text}}>{activeGoal}</span>}
                  </div>
                  {parsedStrategy[activeSection].lines.length>0
                    ?<div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {parsedStrategy[activeSection].lines.map((line,i)=>(
                        <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",borderBottom:"1px solid rgba(255,255,255,0.04)",paddingBottom:10}}>
                          <div style={{width:22,height:22,borderRadius:4,background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#4ade80",flexShrink:0,marginTop:1}}>{i+1}</div>
                          <div style={{fontSize:14,color:"#e4e9e6",lineHeight:1.7}}>{line}</div>
                        </div>
                      ))}
                    </div>
                    :<div style={{fontSize:12,color:"#9ca3af"}}>No data for this section</div>
                  }
                </div>
              )}

              {holeData&&(
                <div className="panel" style={{padding:16,marginTop:14}}>
                  <div style={{fontSize:12,color:"#6dab82",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Raw Hole Data</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
                    {holeData.yardages&&Object.entries(holeData.yardages).filter(([,v])=>v).map(([k,v])=>(
                      <div key={k} style={{background:"rgba(255,255,255,0.02)",borderRadius:6,padding:"7px 10px"}}>
                        <div style={{fontSize:11,color:"#6dab82",textTransform:"uppercase",letterSpacing:"0.08em"}}>{k}</div>
                        <div style={{fontSize:18,color:"#d1fae5",fontWeight:600,marginTop:2}}>{v}</div>
                        <div style={{fontSize:11,color:"#9ca3af"}}>yards</div>
                      </div>
                    ))}
                    {holeData.green&&Object.entries({"Front":holeData.green.front_distance,"Mid":holeData.green.middle_distance,"Back":holeData.green.back_distance}).filter(([,v])=>v).map(([k,v])=>(
                      <div key={k} style={{background:"rgba(255,255,255,0.02)",borderRadius:6,padding:"7px 10px"}}>
                        <div style={{fontSize:11,color:"#6dab82",textTransform:"uppercase",letterSpacing:"0.08em"}}>Green {k}</div>
                        <div style={{fontSize:18,color:"#d1fae5",fontWeight:600,marginTop:2}}>{v}</div>
                        <div style={{fontSize:11,color:"#9ca3af"}}>yards</div>
                      </div>
                    ))}
                  </div>
                  {holeData.hazards?.length>0&&(
                    <div style={{marginTop:10}}>
                      <div style={{fontSize:12,color:"#c4cdd8",marginBottom:6,fontWeight:600}}>Hazards</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {holeData.hazards.map((h,i)=><div key={i} style={{fontSize:12,color:"#fca5a5",background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:4,padding:"3px 9px"}}>{h.type} · {h.side||h.location}{(h.distance_to_carry??h.distance_from_tee)?` · ${h.distance_to_carry??h.distance_from_tee}yds`:""}</div>)}
                      </div>
                    </div>
                  )}
                  <button onClick={reset} style={{marginTop:12,fontSize:13,color:"#6dab82",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>← Analyze another hole</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
