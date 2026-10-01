// Runs once when the Next.js server starts. We use it to boot the Slack bot (Socket Mode) inside
// the same Node process as the dashboard, so both share the in-memory run store.
export async function register() {
  // Keep the import inside this `if` (Next's documented pattern) so the Node-only Slack/Bolt code
  // is never compiled into the edge instrumentation bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Never open a Slack socket from `next build` workers.
    if (process.env.NEXT_PHASE === "phase-production-build") return;

    const g = globalThis as unknown as { __haggleSlackBoot?: boolean };
    if (g.__haggleSlackBoot) return; // HMR / repeated register() calls
    g.__haggleSlackBoot = true;

    if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_APP_TOKEN) {
      console.log(
        "[slack] SLACK_BOT_TOKEN / SLACK_APP_TOKEN not set — Slack bot disabled (dashboard still works).",
      );
      return;
    }

    // Don't block server readiness on the websocket handshake; startSlackBot never throws.
    void import("./lib/slack")
      .then(({ startSlackBot }) => startSlackBot())
      .catch((err: unknown) => {
        g.__haggleSlackBoot = false;
        console.error("[slack] failed to load Slack bot:", err);
      });
  }
}
