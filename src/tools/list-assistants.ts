import { claudeStatus } from "../assistants/claude.js";
import { codexStatus } from "../assistants/codex.js";
import { geminiStatus } from "../assistants/gemini.js";
import type { AssistantStatus } from "../assistants/types.js";

export function listAssistants(): AssistantStatus[] {
  return [claudeStatus(), codexStatus(), geminiStatus()];
}
