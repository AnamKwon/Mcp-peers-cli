import { readFileSync } from "node:fs";
import { reviewWithClaude } from "../assistants/claude.js";
import { reviewWithCodex } from "../assistants/codex.js";
import { reviewWithGemini } from "../assistants/gemini.js";
import type { AssistantName, ReviewRequest, ReviewResult, ReviewType } from "../assistants/types.js";
import { createJob, setDone, setError, setRunning, updateProgress } from "../jobs/store.js";

type ReviewFn = (req: ReviewRequest) => Promise<ReviewResult>;

const ASSISTANTS: Record<AssistantName, ReviewFn> = {
  claude: reviewWithClaude,
  codex: reviewWithCodex,
  gemini: reviewWithGemini,
};

export async function runPeerReview(params: {
  filePath: string;
  content?: string;
  assistants: AssistantName[];
  reviewType?: ReviewType;
  focus?: string;
}): Promise<ReviewResult[]> {
  const content = params.content ?? readFileSync(params.filePath, "utf8");
  const req: ReviewRequest = {
    filePath: params.filePath,
    content,
    reviewType: params.reviewType ?? "standard",
    focus: params.focus,
  };

  const settled = await Promise.allSettled(
    params.assistants.map((name) => ASSISTANTS[name](req))
  );

  return settled.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    return {
      assistant: params.assistants[i],
      mode: "api" as const,
      findings: [],
      suggestions: [],
      rawOutput: "",
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });
}

export function startBackgroundReview(params: {
  filePath: string;
  content?: string;
  assistants: AssistantName[];
  reviewType?: ReviewType;
  focus?: string;
}): string {
  const job = createJob();

  setImmediate(async () => {
    setRunning(job.id);
    try {
      const total = params.assistants.length;
      const results: ReviewResult[] = [];

      for (let i = 0; i < total; i++) {
        const name = params.assistants[i];
        const content = params.content ?? readFileSync(params.filePath, "utf8");
        const req: ReviewRequest = {
          filePath: params.filePath,
          content,
          reviewType: params.reviewType ?? "standard",
          focus: params.focus,
        };
        try {
          results.push(await ASSISTANTS[name](req));
        } catch (err) {
          results.push({
            assistant: name,
            mode: "api",
            findings: [],
            suggestions: [],
            rawOutput: "",
            error: err instanceof Error ? err.message : String(err),
          });
        }
        updateProgress(job.id, Math.round(((i + 1) / total) * 100));
      }

      setDone(job.id, results);
    } catch (err) {
      setError(job.id, err instanceof Error ? err.message : String(err));
    }
  });

  return job.id;
}
