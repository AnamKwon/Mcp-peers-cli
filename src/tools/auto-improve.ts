import { readFileSync } from "node:fs";
import { improveWithClaude } from "../assistants/claude.js";
import { buildImprovePrompt } from "../assistants/prompts.js";
import type { ReviewResult } from "../assistants/types.js";

export interface ImprovementResult {
  improvedContent: string;
  summary: string;
  appliedSuggestions: string[];
}

export async function autoImprove(params: {
  filePath: string;
  reviews: ReviewResult[];
}): Promise<ImprovementResult> {
  const content = readFileSync(params.filePath, "utf8");

  const allFindings = params.reviews.flatMap((r) =>
    r.findings.map((f) => `[${r.assistant}] ${f}`)
  );
  const allSuggestions = params.reviews.flatMap((r) =>
    r.suggestions.map((s) => `[${r.assistant}] ${s}`)
  );

  const prompt = buildImprovePrompt(
    params.filePath,
    content,
    allFindings,
    allSuggestions
  );

  const improvedContent = await improveWithClaude(prompt);

  const summary =
    `Applied ${allSuggestions.length} suggestions from ` +
    `${[...new Set(params.reviews.map((r) => r.assistant))].join(", ")} review(s). ` +
    `${allFindings.length} finding(s) addressed.`;

  return { improvedContent, summary, appliedSuggestions: allSuggestions };
}
