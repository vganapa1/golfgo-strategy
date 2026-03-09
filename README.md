# GolfGo Strategy Generator v2

## Setup
1. npm install
2. Copy .env.example → .env.local, add both API keys
3. npm run dev → http://localhost:3000

## Deploy to Vercel
Push to GitHub → vercel.com → New Project → import repo
Add environment variables: ANTHROPIC_API_KEY + GEMINI_API_KEY
Deploy.

Or via CLI:
  npm i -g vercel && vercel
  Then add env vars in Vercel dashboard → Settings → Environment Variables → redeploy.

## API Keys
- ANTHROPIC_API_KEY: get at console.anthropic.com
- GEMINI_API_KEY: get free at aistudio.google.com
Both stay server-side. Nothing is exposed to the browser.

## How it works
1. Coach sets scoring goals per hole category (Par 3 short/long, Par 4 short/medium/long, Par 5 reachable/standard)
2. Upload a yardage book image
3. Gemini Vision extracts hole data (par, yardage, hazards, green distances, dogleg)
4. App auto-classifies the hole and pulls the scoring goal from the game plan
5. Claude builds a full strategy calibrated to that goal
6. Coach can override the goal and re-run without re-analyzing the image
