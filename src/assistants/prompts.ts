import type { ReviewRequest } from "./types.js";

export function buildReviewPrompt(req: ReviewRequest): string {
  const focusLine = req.focus ? `Focus specifically on: ${req.focus}` : "";
  const frame =
    req.reviewType === "adversarial"
      ? "Challenge the implementation approach, design choices, hidden assumptions, and failure modes. Be critical and thorough."
      : "Review for bugs, anti-patterns, security issues, and missed edge cases.";

  return `You are an expert code reviewer. ${frame}
${focusLine}

File: ${req.filePath}
\`\`\`
${req.content}
\`\`\`

Respond with ONLY valid JSON in this exact shape — no markdown fences, no extra text:
{"findings":["..."],"suggestions":["..."]}`;
}

export function buildImprovePrompt(
  filePath: string,
  content: string,
  findings: string[],
  suggestions: string[]
): string {
  const allFindings = findings.map((f) => `- ${f}`).join("\n");
  const allSuggestions = suggestions.map((s) => `- ${s}`).join("\n");
  return `You are a senior software engineer. Apply the following review feedback to improve the code.
Return ONLY the full improved source file — no explanations, no markdown fences.

File: ${filePath}
Findings:
${allFindings}

Suggestions:
${allSuggestions}

Original code:
${content}`;
}
