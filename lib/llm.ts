import Anthropic from "@anthropic-ai/sdk";

// Reads ANTHROPIC_API_KEY from env (.env.local). Keys not scoped to a workspace
// also need ANTHROPIC_WORKSPACE_ID, sent as the anthropic-workspace-id header.
const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();

export const anthropic = new Anthropic({
  maxRetries: 4,
  defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
});

export const MODELS = {
  orchestrator: process.env.ORCHESTRATOR_MODEL ?? "claude-sonnet-5-5",
  negotiator: process.env.NEGOTIATOR_MODEL ?? "claude-sonnet-5-5",
  vendor: process.env.VENDOR_MODEL ?? "claude-haiku-4-5-20251001",
} as const;
