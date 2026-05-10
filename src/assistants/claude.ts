import Anthropic from "@anthropic-ai/sdk";
import { hasCli } from "../utils/which.js";
import { runCli } from "./runner.js";
import { buildReviewPrompt } from "./prompts.js";
import type { AssistantName, AssistantStatus, ReviewRequest, ReviewResult } from "./types.js";

const ASSISTANT: AssistantName = "claude";

function parseJsonOutput(raw: string): { findings: string[]; suggestions: string[] } {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in output");
  return JSON.parse(match[0]);
}

async function reviewViaCli(req: ReviewRequest): Promise<ReviewResult> {
  const prompt = buildReviewPrompt(req);
  const raw = await runCli("claude", ["-p", prompt, "--output-format", "json"], {
    timeoutMs: 120_000,
  });

  let parsed: { result?: string; content?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { result: raw };
  }
  const text = parsed.result ?? parsed.content ?? raw;
  const { findings, suggestions } = parseJsonOutput(text);
  return { assistant: ASSISTANT, mode: "cli", findings, suggestions, rawOutput: raw };
}

async function reviewViaApi(req: ReviewRequest): Promise<ReviewResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = buildReviewPrompt(req);
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const { findings, suggestions } = parseJsonOutput(raw);
  return { assistant: ASSISTANT, mode: "api", findings, suggestions, rawOutput: raw };
}

export async function reviewWithClaude(req: ReviewRequest): Promise<ReviewResult> {
  if (hasCli("claude")) {
    try {
      return await reviewViaCli(req);
    } catch {
      // fall through to API
    }
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Claude: no CLI and ANTHROPIC_API_KEY not set");
  }
  return reviewViaApi(req);
}

export async function improveWithClaude(prompt: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    if (hasCli("claude")) {
      return runCli("claude", ["-p", prompt, "--output-format", "json"], { timeoutMs: 180_000 });
    }
    throw new Error("Claude: no ANTHROPIC_API_KEY and no CLI");
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });
  return message.content[0].type === "text" ? message.content[0].text : "";
}

export function claudeStatus(): AssistantStatus {
  return {
    name: ASSISTANT,
    cliAvailable: hasCli("claude"),
    apiAvailable: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}
