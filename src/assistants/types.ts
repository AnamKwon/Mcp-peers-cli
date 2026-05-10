export type AssistantName = "claude" | "codex" | "gemini";
export type ReviewType = "standard" | "adversarial";

export interface ReviewRequest {
  filePath: string;
  content: string;
  reviewType: ReviewType;
  focus?: string;
}

export interface ReviewResult {
  assistant: AssistantName;
  mode: "cli" | "api";
  findings: string[];
  suggestions: string[];
  rawOutput: string;
  error?: string;
}

export interface AssistantStatus {
  name: AssistantName;
  cliAvailable: boolean;
  apiAvailable: boolean;
}

export interface Job {
  id: string;
  status: "pending" | "running" | "done" | "error";
  progress: number;
  startedAt: string;
  results?: ReviewResult[];
  error?: string;
}
