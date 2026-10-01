// In-memory run store + change feed. Single Node process (next dev / next start).
// Every mutation goes through updateRun(), which emits a full Run snapshot to subscribers (SSE).
import { EventEmitter } from "node:events";
import type { ChatMessage, Run } from "./types";

type StoreState = { runs: Map<string, Run>; emitter: EventEmitter };

const g = globalThis as unknown as { __eventSwarmStore?: StoreState };
const state: StoreState =
  g.__eventSwarmStore ??
  (g.__eventSwarmStore = { runs: new Map(), emitter: new EventEmitter() });
state.emitter.setMaxListeners(1000);

export const uid = (prefix = "") =>
  prefix + Math.random().toString(36).slice(2, 10);

export function createRun(brief: string, userPhone?: string): Run {
  const run: Run = {
    id: uid("run_"),
    createdAt: Date.now(),
    userPhone,
    brief,
    status: "parsing",
    negotiations: [],
    selections: [],
    chat: [],
    cards: [],
    log: [],
  };
  state.runs.set(run.id, run);
  emit(run);
  return run;
}

export function getRun(id: string): Run | undefined {
  return state.runs.get(id);
}

export function listRuns(): Run[] {
  return [...state.runs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function latestRun(userPhone?: string): Run | undefined {
  return listRuns().find((r) => !userPhone || r.userPhone === userPhone);
}

/** Mutate a run in place and broadcast the new snapshot. */
export function updateRun(id: string, fn: (run: Run) => void): Run {
  const run = state.runs.get(id);
  if (!run) throw new Error(`Run not found: ${id}`);
  fn(run);
  emit(run);
  return run;
}

export function addLog(runId: string, text: string) {
  updateRun(runId, (r) => r.log.push({ ts: Date.now(), text }));
}

export function addChat(runId: string, from: ChatMessage["from"], text: string) {
  updateRun(runId, (r) =>
    r.chat.push({ id: uid("msg_"), from, text, ts: Date.now() }),
  );
}

/** Subscribe to run snapshots. Returns an unsubscribe function. */
export function subscribe(listener: (run: Run) => void): () => void {
  state.emitter.on("run", listener);
  return () => state.emitter.off("run", listener);
}

function emit(run: Run) {
  // structuredClone so subscribers never see later in-place mutations mid-serialization
  state.emitter.emit("run", structuredClone(run));
}
