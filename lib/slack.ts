// Slack bot (Bolt, Socket Mode). Started once per server process from instrumentation.ts.
//
// IMPORTANT: Next bundles instrumentation.ts and each route handler separately, so module-level
// state is NOT shared between them. Everything that must be shared (the Bolt client, the
// shortlist-message registry) lives on globalThis — same trick as lib/store.ts.
//
// This module has no runtime import of @slack/bolt at top level (type-only), so notify.ts can
// import it from any route bundle cheaply; Bolt is loaded lazily inside startSlackBot().
import type { App, types as SlackTypes } from "@slack/bolt";
import { getRun, listRuns } from "./store";
import type { Run, RunStatus, SlackThread } from "./types";

export type SlackClient = App["client"];
type KnownBlock = SlackTypes.KnownBlock;

interface ShortlistMsg {
  channel: string;
  ts: string;
  text: string;
  finalized: boolean;
}

interface SlackState {
  started: boolean;
  app?: App;
  client?: SlackClient;
  botUserId?: string;
  shortlists: Map<string, ShortlistMsg>; // runId → posted shortlist message (with buttons)
  seen?: Set<string>; // "channel:ts" of handled user messages (Slack may redeliver events)
}

// Loaded lazily to avoid an import cycle (orchestrator → notify → slack → orchestrator).
const orchestrator = () => import("./agents/orchestrator");

const g = globalThis as unknown as { __haggleSlack?: SlackState };
const state: SlackState =
  g.__haggleSlack ?? (g.__haggleSlack = { started: false, shortlists: new Map() });

export const APPROVE_ACTION_ID = "haggle_approve";
const DASHBOARD_ACTION_ID = "haggle_dashboard";
const SECTION_MAX = 3000; // Block Kit section text limit

const RUNNING: RunStatus[] = ["parsing", "sourcing", "negotiating"];

// Slack sends emoji as shortcodes (":+1:", ":white_check_mark:"), possibly with skin tones.
export const APPROVE_RE =
  /^(?:(?:approve|approved|yes|yep|book(?: it)?|confirm|lgtm|ship it)\b|👍|✅|:(?:\+1|thumbsup|white_check_mark|heavy_check_mark|ballot_box_with_check)(?:::skin-tone-\d)?:)/i;

/** Bolt WebClient, available once the socket-mode bot has started in this process. */
export function getSlackClient(): SlackClient | undefined {
  return state.client;
}

export const dashboardUrl = () =>
  (process.env.PUBLIC_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");

// ───────────────────────────── text helpers ─────────────────────────────

/** Convert Slack-formatted message text into a plain brief. */
function cleanText(raw: string | undefined): string {
  let t = raw ?? "";
  if (state.botUserId) t = t.replaceAll(`<@${state.botUserId}>`, " ");
  t = t
    .replace(/<@[A-Z0-9]+(?:\|([^>]+))?>/g, (_m, name?: string) => (name ? `@${name}` : "")) // other mentions
    .replace(/<#[A-Z0-9]+\|([^>]*)>/g, "#$1") // channels
    .replace(/<((?:https?|mailto):[^|>]+)\|([^>]+)>/g, "$2") // labeled links
    .replace(/<((?:https?|mailto):[^>]+)>/g, "$1") // bare links
    .replace(/<!(here|channel|everyone)>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  return t.replace(/[ \t]+/g, " ").trim();
}

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

// ───────────────────────────── run lookup ─────────────────────────────

/** Most recent run attached to this Slack thread. */
export function findRunByThread(channel: string, threadTs: string): Run | undefined {
  return listRuns().find((r) => r.slack?.channel === channel && r.slack.threadTs === threadTs);
}

function latestRunInChannel(channel: string): Run | undefined {
  return listRuns().find((r) => r.slack?.channel === channel);
}

// ───────────────────────────── outbound ─────────────────────────────

/** Block Kit for the shortlist message: text + Approve / Dashboard buttons. */
export function shortlistBlocks(runId: string, text: string): KnownBlock[] {
  return [
    { type: "section", text: { type: "mrkdwn", text: truncate(text, SECTION_MAX) } },
    {
      type: "actions",
      block_id: "haggle_shortlist_actions",
      elements: [
        {
          type: "button",
          action_id: APPROVE_ACTION_ID,
          style: "primary",
          text: { type: "plain_text", text: "✅ Approve & issue Ramp cards", emoji: true },
          value: runId,
        },
        {
          type: "button",
          action_id: DASHBOARD_ACTION_ID,
          text: { type: "plain_text", text: "View live dashboard", emoji: true },
          url: dashboardUrl(),
        },
      ],
    },
  ];
}

/** Post a message in the run's Slack thread. Throws on Slack API errors (caller logs). */
export async function postToThread(
  thread: SlackThread,
  text: string,
  opts?: { runId?: string; approveButton?: boolean },
): Promise<void> {
  const client = state.client;
  if (!client) return;
  const withButtons = Boolean(opts?.approveButton && opts.runId);
  const res = await client.chat.postMessage({
    channel: thread.channel,
    thread_ts: thread.threadTs,
    text, // notification / fallback text (mrkdwn)
    mrkdwn: true,
    unfurl_links: false,
    ...(withButtons ? { blocks: shortlistBlocks(opts!.runId!, text) } : {}),
  });
  if (withButtons && res.ts) {
    state.shortlists.set(opts!.runId!, {
      channel: res.channel ?? thread.channel,
      ts: res.ts,
      text,
      finalized: false,
    });
  }
}

/**
 * Replace the shortlist buttons with an "Approved" note. Idempotent; safe to call from the button
 * handler, a thread reply, and notifyUser (dashboard approvals). Never throws.
 */
export async function markShortlistApproved(runId: string, approverId?: string): Promise<void> {
  const msg = state.shortlists.get(runId);
  const client = state.client;
  if (!msg || msg.finalized || !client) return;
  msg.finalized = true;
  const note = approverId ? `✅ Approved by <@${approverId}>` : "✅ Approved";
  try {
    await client.chat.update({
      channel: msg.channel,
      ts: msg.ts,
      text: `${msg.text}\n\n${note}`,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: truncate(msg.text, SECTION_MAX) } },
        { type: "context", elements: [{ type: "mrkdwn", text: note }] },
      ],
    });
  } catch (err) {
    msg.finalized = false;
    console.error(`[slack] failed to update shortlist message for ${runId}:`, err);
  }
}

async function reply(client: SlackClient, channel: string, threadTs: string, text: string) {
  try {
    await client.chat.postMessage({ channel, thread_ts: threadTs, text, unfurl_links: false });
  } catch (err) {
    console.error("[slack] reply failed:", err);
  }
}

async function react(client: SlackClient, channel: string, ts: string, name: string) {
  try {
    await client.reactions.add({ channel, timestamp: ts, name });
  } catch {
    // already_reacted / missing scope — not important
  }
}

const isAlreadyApprovedError = (err: unknown) =>
  err instanceof Error && /not awaiting approval|already being approved/i.test(err.message);

async function approveFromSlack(
  client: SlackClient,
  run: Run,
  userId: string | undefined,
  where: { channel: string; threadTs: string },
) {
  await markShortlistApproved(run.id, userId);
  try {
    const { approveRun } = await orchestrator();
    await approveRun(run.id);
  } catch (err) {
    if (isAlreadyApprovedError(err)) {
      await reply(client, where.channel, where.threadTs, "👌 Already approved — cards are on the way.");
    } else {
      console.error(`[slack] approveRun(${run.id}) failed:`, err);
      await reply(client, where.channel, where.threadTs, "😓 Couldn't approve that run — please try again.");
    }
  }
}

// ───────────────────────────── inbound ─────────────────────────────

const HELP =
  "👋 I'm *Haggle*. Tell me about your event and my agents will negotiate with every vendor at once, e.g.\n" +
  "> 120-person offsite in NYC Oct 20, $40k budget, 20 vegetarian, 5 gluten-free, 2 nut allergies";

interface IncomingText {
  client: SlackClient;
  channel: string;
  ts: string;
  threadTs?: string;
  userId?: string;
  rawText: string;
  /** true for @mentions and DMs (addressed to the bot); false for plain channel thread replies */
  addressed: boolean;
}

function firstTime(channel: string, ts: string): boolean {
  const seen = (state.seen ??= new Set());
  const key = `${channel}:${ts}`;
  if (seen.has(key)) return false;
  seen.add(key);
  if (seen.size > 5000) seen.delete(seen.values().next().value!);
  return true;
}

async function handleText(m: IncomingText): Promise<void> {
  if (!firstTime(m.channel, m.ts)) return;
  const text = cleanText(m.rawText);
  const isApprove = APPROVE_RE.test(text);

  // 1) Replies inside a thread that belongs to a run.
  if (m.threadTs) {
    const run = findRunByThread(m.channel, m.threadTs);
    if (run) {
      if (isApprove && run.status === "awaiting_approval") {
        await react(m.client, m.channel, m.ts, "white_check_mark");
        await approveFromSlack(m.client, run, m.userId, { channel: m.channel, threadTs: m.threadTs });
        return;
      }
      if (isApprove && run.status === "approved") {
        await reply(m.client, m.channel, m.threadTs, "👌 Already approved — your Ramp cards are issued.");
        return;
      }
      if (RUNNING.includes(run.status)) {
        await reply(
          m.client,
          m.channel,
          m.threadTs,
          "⏳ Still negotiating… my agents are mid-haggle. I'll post the shortlist here as soon as it's ready.",
        );
        return;
      }
      if (!m.addressed) return; // ordinary chatter in a finished thread
    } else if (!m.addressed) {
      return; // channel thread we don't own
    }
  }

  // 2) Top-level "approve" (e.g. in a DM) → latest awaiting run in this conversation.
  if (isApprove && !m.threadTs) {
    const run = latestRunInChannel(m.channel);
    if (run?.status === "awaiting_approval") {
      await react(m.client, m.channel, m.ts, "white_check_mark");
      await approveFromSlack(m.client, run, m.userId, {
        channel: m.channel,
        threadTs: run.slack?.threadTs ?? m.ts,
      });
      return;
    }
  }

  if (!m.addressed) return;

  const threadTs = m.threadTs ?? m.ts;
  if (!text || isApprove) {
    await reply(m.client, m.channel, threadTs, HELP);
    return;
  }

  // 3) New brief.
  await react(m.client, m.channel, m.ts, "eyes");
  const { startRun } = await orchestrator();
  startRun(text, { slack: { channel: m.channel, threadTs, userId: m.userId } });
}

// Loose shape covering the message-event union members we care about.
interface LooseMessageEvent {
  type: string;
  subtype?: string;
  bot_id?: string;
  user?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  channel: string;
  channel_type?: string;
}

function registerHandlers(app: App) {
  // @Haggle mentions in channels (top-level or in a thread).
  app.event("app_mention", async ({ event, client }) => {
    if (event.bot_id || (event.subtype && event.subtype !== "thread_broadcast")) return;
    await handleText({
      client,
      channel: event.channel,
      ts: event.ts,
      threadTs: event.thread_ts,
      userId: event.user,
      rawText: event.text,
      addressed: true,
    });
  });

  // DMs (message.im) + channel thread replies (message.channels / message.groups).
  app.event("message", async ({ event, client }) => {
    const e = event as unknown as LooseMessageEvent;
    if (e.subtype || e.bot_id || !e.user) return; // edits, deletes, joins, bots (incl. ourselves)
    if (e.user === state.botUserId) return;
    const isDm = e.channel_type === "im";
    if (!isDm) {
      // Channel messages: only thread replies, and never ones that @mention us (app_mention handles those).
      if (!e.thread_ts) return;
      if (state.botUserId && e.text?.includes(`<@${state.botUserId}>`)) return;
    }
    await handleText({
      client,
      channel: e.channel,
      ts: e.ts,
      threadTs: e.thread_ts,
      userId: e.user,
      rawText: e.text ?? "",
      addressed: isDm,
    });
  });

  // /haggle <brief>
  app.command("/haggle", async ({ command, ack, client, respond }) => {
    await ack();
    const brief = cleanText(command.text);
    if (!brief) {
      await respond({ response_type: "ephemeral", text: HELP }).catch(() => {});
      return;
    }
    try {
      // Post the brief publicly so there's a thread for updates + approvals.
      const posted = await client.chat.postMessage({
        channel: command.channel_id,
        text: `📝 <@${command.user_id}> asked Haggle to plan:\n>${brief.replace(/\n/g, "\n>")}`,
        unfurl_links: false,
      });
      if (!posted.ts) throw new Error("chat.postMessage returned no ts");
      const channel = posted.channel ?? command.channel_id;
      await react(client, channel, posted.ts, "eyes");
      const { startRun } = await orchestrator();
      startRun(brief, { slack: { channel, threadTs: posted.ts, userId: command.user_id } });
    } catch (err) {
      console.error("[slack] /haggle failed:", err);
      await respond({
        response_type: "ephemeral",
        text: "😕 I can't post in this conversation. Invite me first (`/invite @Haggle`) or DM me the brief.",
      }).catch(() => {});
    }
  });

  // Approve button on the shortlist message.
  app.action(APPROVE_ACTION_ID, async ({ ack, body, action, client }) => {
    await ack();
    if (body.type !== "block_actions" || action.type !== "button") return;
    const runId = action.value ?? "";
    const userId = body.user.id;
    const channel = body.channel?.id ?? body.container?.channel_id;
    const run = getRun(runId);

    const ephemeral = async (text: string) => {
      if (!channel) return;
      try {
        await client.chat.postEphemeral({
          channel,
          user: userId,
          text,
          ...(run?.slack?.threadTs ? { thread_ts: run.slack.threadTs } : {}),
        });
      } catch (err) {
        console.error("[slack] postEphemeral failed:", err);
      }
    };

    if (!run) {
      await ephemeral("🤔 I can't find that event anymore (the server may have restarted).");
      return;
    }
    if (run.status !== "awaiting_approval") {
      await markShortlistApproved(run.id);
      await ephemeral(
        run.status === "approved" ? "👌 Already approved — cards are issued." : `This event can't be approved (status: ${run.status}).`,
      );
      return;
    }

    // Remember the message even if this process didn't post it (e.g. after HMR).
    if (!state.shortlists.has(run.id) && channel && body.message?.ts) {
      state.shortlists.set(run.id, {
        channel,
        ts: body.message.ts,
        text: body.message.text ?? "",
        finalized: false,
      });
    }
    await markShortlistApproved(run.id, userId);
    try {
      const { approveRun } = await orchestrator();
      await approveRun(run.id);
    } catch (err) {
      if (isAlreadyApprovedError(err)) await ephemeral("👌 Already approved — cards are on the way.");
      else {
        console.error(`[slack] approveRun(${run.id}) failed:`, err);
        await ephemeral("😓 Approval failed — please try again.");
      }
    }
  });

  // URL button: Slack still sends an action; ack it so the user doesn't see a warning.
  app.action(DASHBOARD_ACTION_ID, async ({ ack }) => {
    await ack();
  });

  app.error(async (err) => {
    console.error("[slack] Bolt error:", err);
  });
}

/**
 * Start the Socket Mode bot once per process. No-op (with one log line) when tokens are missing.
 * Never throws.
 */
export async function startSlackBot(): Promise<void> {
  if (state.started) return;
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  const appToken = process.env.SLACK_APP_TOKEN?.trim();
  if (!token || !appToken) {
    console.log("[slack] SLACK_BOT_TOKEN / SLACK_APP_TOKEN not set — Slack bot disabled (dashboard still works).");
    return;
  }
  state.started = true; // set before any await so concurrent calls can't start a second socket
  try {
    const { App, LogLevel } = await import("@slack/bolt");
    const app = new App({ token, appToken, socketMode: true, logLevel: LogLevel.WARN });
    registerHandlers(app);
    const auth = await app.client.auth.test(); // validates SLACK_BOT_TOKEN, gives us our bot user id
    state.app = app;
    state.client = app.client;
    state.botUserId = auth.user_id;
    await app.start(); // opens the Socket Mode websocket (validates SLACK_APP_TOKEN)
    console.log(`[slack] ⚡ Haggle bot connected via Socket Mode as @${auth.user ?? "haggle"} (${auth.user_id})`);
  } catch (err) {
    state.started = false;
    state.app = undefined;
    state.client = undefined;
    console.error("[slack] failed to start Slack bot (check SLACK_BOT_TOKEN / SLACK_APP_TOKEN):", err);
  }
}
