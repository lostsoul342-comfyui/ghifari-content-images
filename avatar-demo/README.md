# Avatar Demo

Talk to an Anam avatar whose replies come from Claude. Claude is grounded on
local files first, and falls back to web search for live questions (e.g.
"what's the weather in Singapore right now").

Architecture: Anam's hosted brain is disabled (`llmId: CUSTOMER_CLIENT_V1`).
The browser SDK detects each finished user turn, sends the conversation to
this app's server, the server calls Claude (streaming), and streams the
reply text back into the avatar so it speaks it.

## Setup (run this locally on your own machine, not in a cloud sandbox)

1. `cd avatar-demo`
2. `cp .env.example .env` and fill in:
   - `ANAM_API_KEY` — from your Anam dashboard
   - `ANTHROPIC_API_KEY` — from console.anthropic.com
   - `LOCAL_KNOWLEDGE_PATHS` — optional, comma-separated folders to ground answers on
     (e.g. `Y:\,Z:\` on Windows). See the warning in `.env.example` before pointing
     this at whole drive roots — it sends filenames/snippets to Anthropic's API.
3. `npm install`
4. `npm run dev`
5. Open `http://localhost:3000`, click "Start talking", allow mic access, and ask a question.

## Verifying it actually works

- Ask something answerable from your local files/repo content — confirm the
  avatar's spoken answer reflects it.
- Ask something live, e.g. "what's the weather in Singapore right now" —
  confirm it uses web search rather than guessing (check server console logs;
  if the web_search tool call fails it logs a warning and retries without it).
- Say something, then repeat it quickly — confirm the avatar doesn't answer twice
  (message-ID dedupe in `public/app.js`).
- Check `ANAM_API_KEY` and `ANTHROPIC_API_KEY` never appear in browser devtools
  network requests — only the short-lived Anam session token should.

## Notes

- The Anam JS SDK is loaded from a CDN (`esm.sh`) in `public/index.html` rather
  than bundled, to keep this a plain-HTML demo with no build step.
- The web search tool name/type in `server/index.js` (`web_search_20250305`) is
  per Anthropic's current docs at the time this was written. This sandbox has no
  network access to anam.ai/anthropic.com to re-verify live, so if it errors,
  check Anthropic's docs for the current tool identifier — the server already
  falls back to a plain (no-search) reply if the tool call is rejected.
