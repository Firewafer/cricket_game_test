# Hand Cricket Online

Two-player realtime hand cricket. **Architecture:** static `index.html` + one Vercel serverless function (`api/game.js`) + Upstash Redis for shared room state. Clients poll once per second; the server is authoritative (scores, hidden picks, toss, timeouts are all server-side; timeouts are resolved lazily from a stored deadline, so no long-running process or WebSocket is needed). Everything runs on Vercel.

## Run tests
`npm test` (Node 18+, no dependencies)

## Local dev
`npm i -g vercel && vercel dev`. Without Redis variables it uses an in-memory store (single process only).

## Deploy to Vercel
1. Push this folder to a GitHub repo.
2. Vercel → Add New Project → import repo. Framework preset: **Other**; no build command; root directory = repo root.
3. Project → Storage/Marketplace → add **Upstash Redis** (injects `KV_REST_API_URL`/`KV_REST_API_TOKEN`), or set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` manually (see `.env.example`).
4. Deploy. Share `https://<your-app>.vercel.app/?room=CODE` links. Same-origin API, so no CORS setup is needed.
5. Updates: `git push` redeploys.

Troubleshooting: "Store error" = missing/incorrect Redis variables; "Server busy" = lock contention, retry.

## Limitations
No accounts/match-history database, no sound or animations, no rate limiting, no forfeit or reconnect-grace policy (an absent player's balls simply time out as dot balls), plain JS instead of React/TS/Tailwind. Rooms expire 24h after last save. Not browser-tested or deployed from this environment.
