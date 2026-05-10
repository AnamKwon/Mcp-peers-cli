import { GoogleGenerativeAI } from "@google/generative-ai";
import { hasCli } from "../utils/which.js";
import { runCli } from "./runner.js";
import { buildReviewPrompt } from "./prompts.js";
import type { AssistantName, AssistantStatus, ReviewRequest, ReviewResult } from "./types.js";

const ASSISTANT: AssistantName = "gemini";

function parseJsonOutput(raw: string): { findings: string[]; suggestions: string[] } {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in output");
  return JSON.parse(match[0]);
}

async function reviewViaCli(req: ReviewRequest): Promise<ReviewResult> {
  const prompt = buildReviewPrompt(req);
  const raw = await runCli("gemini", ["-p", prompt], { timeoutMs: 120_000 });
  const { findings, suggestions } = parseJsonOutput(raw);
  return { assistant: ASSISTANT, mode: "cli", findings, suggestions, rawOutput: raw };
}

async function reviewViaApi(req: ReviewRequest): Promise<ReviewResult> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
  const prompt = buildReviewPrompt(req);
  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  const { findings, suggestions } = parseJsonOutput(raw);
  return { assistant: ASSISTANT, mode: "api", findings, suggestions, rawOutput: raw };
}

export async function reviewWithGemini(req: ReviewRequest): Promise<ReviewResult> {
  if (hasCli("gemini")) {
    try {
      return await reviewViaCli(req);
    } catch {
      // fall through to API
    }
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Gemini: no CLI and GEMINI_API_KEY not set");
  }
  return reviewViaApi(req);
}

export function geminiStatus(): AssistantStatus {
  return {
    name: ASSISTANT,
    cliAvailable: hasCli("gemini"),
    apiAvailable: Boolean(process.env.GEMINI_API_KEY),
  };
}
