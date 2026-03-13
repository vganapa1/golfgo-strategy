# GolfGo — Coach's User Guide

A tournament strategy generator. Upload a yardage book image, set your player's profile and game plan, and get a compressed, editable strategy card for each hole. Save all 18 to a sheet.

---

## The Layout

| Left Sidebar | Right Panel |
|---|---|
| Player setup, conditions, image upload, Generate button | Strategy card output, Tournament Sheet |

---

## Step 1 — Set Up the Player Profile

Click **Player Profile** in the sidebar to expand it.

- **Name, Handicap, Handedness** — basic identity fields.
- **ClippD Analytics (JSON)** — paste in the player's full ClippD data. This drives all AI distance, tendency, and miss-direction logic. Click **Save Profile** when done.

> If you don't have ClippD data, the defaults still produce a usable strategy — but the more accurate the data, the sharper the output.

---

## Step 2 — Set Player DNA

Click **Player DNA** to expand.

| Field | What it does |
|---|---|
| **Dexterity** | Left or right-handed. Affects all directional language in the output. |
| **Stock Shape** | Draw, Fade, Straight, Strong Draw, Strong Fade. The AI adjusts miss-side logic accordingly. |
| **Ball Flight Archetype** | Tumbler / Floater / Riser / Knuckler. The AI factors spin, apex, and wind vulnerability into the approach and miss recommendations. |
| **Coach Notes** | Free text — e.g. "struggles with low punch shots". Gets passed directly into the prompt. |

---

## Step 3 — Set the Game Plan

Click **Game Plan** to expand. You'll see 7 hole categories:

- Par 3 Short / Long
- Par 4 Short / Medium / Long
- Par 5 Reachable / Standard

For each, choose a **scoring goal**:

| Goal | What the AI does with it |
|---|---|
| **Eagle attempt** | Aggressive lines, driver + fairway wood, go for green in two |
| **Birdie** | Standard play, best approach yardage, attack good pins |
| **Par protection** | Remove risk, club down, miss away from trouble, center green |
| **Bogey avoidance** | Play away from doubles, accept bogey, never short-side |
| **Make cut** | Ultra conservative, fairways and greens only |

> The AI reads the hole image, classifies the hole into one of these 7 categories, pulls the goal you've assigned, and calibrates all 3 strategy fields around it.

---

## Step 4 — Set Conditions

These appear as dropdown/input fields in the sidebar:

- **Pin Position** — 9 options (front-left through back-right)
- **Wind Effect** — into / downwind / left-to-right / right-to-left / calm
- **Wind Tier** — calm / light / moderate / strong / extreme
- **Temperature** — affects distance calculations
- **Firmness** — soft / normal / firm / very firm
- **Green Speed (Stimp)** — numeric
- **Rough Height** — in inches
- **Fairway Roll** — in yards

Set these fresh before each hole or each round as conditions change.

---

## Step 5 — Upload the Yardage Book Image

Drag and drop, or click the upload zone. The AI reads yardage, par, hazards, green shape, dogleg, and elevation from the image directly — no manual entry needed.

Supported formats: JPEG, PNG, WEBP.

---

## Step 6 — Generate

Click **▶ Generate Strategy**.

The AI makes a single call: it reads the image, extracts hole data, classifies the hole, pulls your game plan goal, and builds the strategy card. Takes roughly 10–20 seconds.

---

## Step 7 — Review & Edit the Card

The card comes back in **edit mode**. Three required fields are pre-filled as text inputs:

| Field | Description |
|---|---|
| **Tee Intent** | Where to start the ball, what to avoid, aggression level |
| **Approach Bias** | Aggressive / neutral / conservative, yardage or club only if it changes the shot |
| **Miss Safety** | Safest miss side or zone |

Three optional fields may also appear (Ideal Leave, Primary Danger, Pin Adjustment) — edit or leave blank.

**Edit any field freely** before saving. The AI's output is a starting point, not locked.

---

## Step 8 — Save, Regenerate, or Discard

Three buttons appear below the card:

| Button | What it does |
|---|---|
| **✓ Save to Sheet** | Snapshots current field values (including your edits) into the Tournament Sheet. Resets the generator for the next hole. |
| **↺ Regenerate** | Fires a fresh AI call with the same image and current conditions. Replaces the card. |
| **✕ Discard** | Clears the card without saving. Returns to idle. |

---

## Step 9 — Build the Sheet

The **Tournament Sheet** appears below the layout once you've saved at least one hole. It shows:

- Hole number, Par, Yardage
- Scoring goal (colour-coded)
- TEE / APPROACH / MISS values (your final edited versions)

Rows are sorted by hole number. If you generate and save the same hole number twice, it **replaces** the previous row — no duplicates.

Each row has a **✕** to remove and redo that hole.

---

## Typical Round Workflow

```
Before the round
  → Set player profile + DNA (once per player, update as needed)
  → Set game plan (once per round or per course)

For each hole (×18)
  → Dial in conditions (pin, wind, etc.)
  → Upload yardage book image
  → Generate
  → Edit card if needed
  → Save to Sheet

After all 18
  → Review the full Tournament Sheet
  → Print / photograph / share with player
```

---

## Tips

- **Left-handed players** — always confirm dexterity is set correctly. All miss directions (left / right) are real-world, not mirror-flipped.
- **Wrong classification?** — the AI determines hole category from the image. If it's wrong, you can edit the tee intent manually before saving.
- **Wind changes mid-round** — update wind tier/effect before generating each hole. It's baked into the prompt.
- **Same hole, different goal** — change the game plan goal for that hole category in the sidebar, then hit Regenerate.
- **Raw data check** — click "AI Extraction · Raw Hole Data" (collapsed below the card) to verify the yardages and hazards the AI pulled. If the numbers look off, the image quality may be too low.
