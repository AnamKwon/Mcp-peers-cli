import OpenAI from "openai";
import { hasCli } from "../utils/which.js";
import { runCli } from "./runner.js";
import { buildReviewPrompt } from "./prompts.js";
import type { AssistantName, AssistantStatus, ReviewRequest, ReviewResult } from "./types.js";

const ASSISTANT: AssistantName = "codex";

function parseJsonOutput(raw: string): { findings: string[]; suggestions: string[] } {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in output");
  return JSON.parse(match[0]);
}

async function reviewViaCli(req: ReviewRequest): Promise<ReviewResult> {
  const prompt = buildReviewPrompt(req);
  // codex CLI: pass prompt via --full-auto flag with stdin or as positional arg
  const raw = await runCli("codex", ["--quiet", prompt], { timeoutMs: 120_000 });
  const { findings, suggestions } = parseJsonOutput(raw);
  return { assistant: ASSISTANT, mode: "cli", findings, suggestions, rawOutput: raw };
}

async function reviewViaApi(req: ReviewRequest): Promise<ReviewResult> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = buildReviewPrompt(req);
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 2048,
  });
  const raw = response.choices[0]?.message?.content ?? "";
  const { findings, suggestions } = parseJsonOutput(raw);
  return { assistant: ASSISTANT, mode: "api", findings, suggestions, rawOutput: raw };
}

export async function reviewWithCodex(req: ReviewRequest): Promise<ReviewResult> {
  if (hasCli("codex")) {
    try {
      return await reviewViaCli(req);
    } catch {
      // fall through to API
    }
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Codex: no CLI and OPENAI_API_KEY not set");
  }
  return reviewViaApi(req);
}

export function codexStatus(): AssistantStatus {
  return {
    name: ASSISTANT,
    cliAvailable: hasCli("codex"),
    apiAvailable: Boolean(process.env.OPENAI_API_KEY),
  };
}
