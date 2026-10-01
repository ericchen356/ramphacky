# Haggle

**An AI agent swarm that plans your event from Slack and haggles with every vendor at once.**

Mention the bot in a channel:

> @Haggle 120-person offsite in NYC Oct 20, $40k budget, 20 vegetarian, 5 gluten-free, 2 nut allergies

An orchestrator agent parses the brief, finds matching venues, caterers and AV vendors, and starts a
swarm of buyer agents that negotiate **in parallel** with each vendor. Every vendor is role-played live by
its own Claude agent with a hidden walk-away price. The orchestrator picks the best deal per category and
posts a shortlist in the thread with an **Approve & issue Ramp cards** button. Approving issues Ramp-style
virtual cards, each locked to one vendor at the negotiated amount.

## Quickstart

```bash
npm i
cp .env.example .env.local   # set ANTHROPIC_API_KEY at minimum
npm run dev                  # http://localhost:3000
```

## Demo without Slack

Open the dashboard at http://localhost:3000, type a brief into the input box and send it. The swarm
streams live into the grid. When the shortlist is ready, hit **Approve** (or `POST /api/runs/:id/approve`)
to issue the virtual cards. If the Slack tokens are not set, the server logs one line and the dashboard
works as normal.

## Slack setup (about 3 minutes)

The bot uses **Socket Mode**, so you don't need ngrok or a public URL. It runs inside the Next.js server
process (started from `instrumentation.ts`).

1. Go to https://api.slack.com/apps, then **Create New App → From a manifest**. Pick your workspace and
   paste the contents of [`slack-manifest.yml`](./slack-manifest.yml). Click **Create**.
2. Go to **Basic Information → App-Level Tokens → Generate Token and Scopes**. Give it any name, add the
   scope `connections:write` and click **Generate**. Copy the `xapp-…` token into `SLACK_APP_TOKEN`.
3. Go to **Install App → Install to Workspace** and allow. Copy the **Bot User OAuth Token** (`xoxb-…`)
   into `SLACK_BOT_TOKEN`.
4. Optional: set `PUBLIC_URL` to the URL the "View live dashboard" button should open. The default is
   `http://localhost:3000`.
5. Restart `npm run dev`. You should see `[slack] ⚡ Haggle bot connected via Socket Mode`.
6. In Slack, invite the bot to a channel with `/invite @Haggle`, then use it:
   - `@Haggle plan a 120-person offsite in NYC Oct 20, $40k budget, 20 vegetarian`
   - or `/haggle <brief>`, which posts your brief in the channel and replies in its thread
   - or DM **Haggle** directly (open it from the **Apps** sidebar section)
7. Updates arrive in the thread. When the shortlist appears, click **✅ Approve & issue Ramp cards**, or
   reply `approve` / `yes` / `book it` / 👍 in the thread.

> If you change scopes or events in the manifest later, reinstall the app to the workspace.
> Only one process should hold the Socket Mode connection, so don't run two dev servers with the same tokens.

## Architecture

Haggle is a single Next.js app running one Node process with an in-memory store. The Slack bot runs in
the same process, so Slack and the dashboard see the same runs.

```
Slack @mention / DM / /haggle ─► Bolt (Socket Mode, lib/slack.ts) ─┐
Dashboard input ─► POST /api/runs ─────────────────────────────────┼─► startRun()  lib/agents/orchestrator.ts
                                                                   │      parse brief (Claude tool-use → EventSpec)
                                                                   │      source vendors, disqualify (capacity/dietary)
                                                                   │      spawn runNegotiation() for each vendor IN PARALLEL
                                                                   │      select best per category, notifyUser(shortlist + Approve button)
Approve button / "approve" in thread / dashboard ─► approveRun() → issueVirtualCards()
                                                                   │
lib/store.ts (in-memory, globalThis) ── every updateRun() emits Run snapshot ──► GET /api/stream (SSE) ─► UI
```

| Path | What |
|---|---|
| `instrumentation.ts` | starts the Slack bot once when the server boots (only if both tokens are set) |
| `lib/slack.ts` | Bolt app: mentions, DMs, thread replies, `/haggle`, Approve button |
| `lib/agents/orchestrator.ts` | brief parsing, sourcing, swarm fan-out, selection, approval |
| `lib/agents/negotiate.ts`, `lib/agents/vendor.ts` | buyer ⇄ vendor negotiation loop |
| `lib/vendors.ts` | hardcoded NYC vendors (with hidden floor prices) |
| `lib/notify.ts` | adds a bot chat message and posts it to the run's Slack thread |
| `lib/finance.ts` | Ramp-style single-vendor virtual cards (mocked; the live Ramp API call is stubbed) |
| `lib/store.ts` | in-memory run store and change feed |

### HTTP API

| Method | Path | |
|---|---|---|
| `POST` | `/api/runs` | `{ brief }` → `{ run }` |
| `GET` | `/api/runs` | `{ runs }` |
| `POST` | `/api/runs/:id/approve` | `{ run }` (404 for an unknown run, 409 if it isn't awaiting approval) |
| `GET` | `/api/stream` | SSE: every Run snapshot (`data: <Run JSON>`), heartbeat every 15s |

## Scripts

| Script | |
|---|---|
| `npm run dev` | start the dev server (and the Slack bot, if configured) |
| `npm run build` / `npm start` | production build / serve |
| `npm run lint` | ESLint |
| `npx tsx --env-file=.env.local scripts/demo.ts "<brief>"` | run the swarm end to end in the terminal |

> State is kept in memory, so restarting the server clears all runs. Run a single long-lived process
> (not serverless).
