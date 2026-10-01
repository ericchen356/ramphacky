// User notifications: every bot message lands in the run's chat (dashboard) and, when the run
// came from Slack and the Socket Mode bot is connected in this process, is posted to its thread.
// Contract: never throws (logs instead).
import { getSlackClient, markShortlistApproved, postToThread } from "./slack";
import { addChat, getRun } from "./store";

export interface NotifyOptions {
  /** Attach the Block Kit "Approve & issue Ramp cards" button (the shortlist message). */
  approveButton?: boolean;
}

export async function notifyUser(runId: string, text: string, opts?: NotifyOptions): Promise<void> {
  try {
    addChat(runId, "bot", text);
  } catch (err) {
    console.error(`[notify] addChat failed for ${runId}:`, err);
  }

  try {
    const run = getRun(runId);
    if (!run?.slack || !getSlackClient()) return;
    // Approved from somewhere else (e.g. the dashboard)? Remove the now-stale buttons.
    if (run.status === "approved") await markShortlistApproved(runId);
    await postToThread(run.slack, text, { runId, approveButton: opts?.approveButton });
  } catch (err) {
    console.error(`[notify] Slack post failed for ${runId}:`, err);
  }
}
