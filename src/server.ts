import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listAssistants } from "./tools/list-assistants.js";
import { runPeerReview, startBackgroundReview } from "./tools/peer-review.js";
import { autoImprove } from "./tools/auto-improve.js";
import { getJob } from "./jobs/store.js";

const AssistantEnum = z.enum(["claude", "codex", "gemini"]);
const ReviewTypeEnum = z.enum(["standard", "adversarial"]);

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mcp-peers",
    version: "1.0.0",
  });

  // ── list_assistants ──────────────────────────────────────────────────────
  server.registerTool(
    "list_assistants",
    {
      title: "List Code Assistants",
      description:
        "List available code assistants (Claude, Codex, Gemini) and their CLI/API availability.",
      inputSchema: z.object({}),
    },
    async () => {
      const statuses = listAssistants();
      return {
        content: [{ type: "text", text: JSON.stringify(statuses, null, 2) }],
      };
    }
  );

  // ── peer_review ──────────────────────────────────────────────────────────
  server.registerTool(
    "peer_review",
    {
      title: "Peer Code Review",
      description:
        "Request parallel code review from one or more AI assistants (Claude, Codex, Gemini). " +
        "Pass async:true to start a background job and get a jobId immediately.",
      inputSchema: z.object({
        filePath: z.string().describe("Absolute path to the file to review"),
        content: z.string().optional().describe("File content (reads filePath if omitted)"),
        assistants: z
          .array(AssistantEnum)
          .default(["claude", "codex"])
          .describe("Which assistants to use"),
        reviewType: ReviewTypeEnum.default("standard").describe(
          "standard: bug/quality review; adversarial: challenges design decisions"
        ),
        focus: z.string().optional().describe("Area to focus on (e.g. security, performance)"),
        async: z.boolean().default(false).describe("If true, returns jobId immediately"),
      }),
    },
    async (args) => {
      if (args.async) {
        const jobId = startBackgroundReview(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ jobId }, null, 2),
            },
          ],
        };
      }

      const results = await runPeerReview(args);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  // ── review_status ────────────────────────────────────────────────────────
  server.registerTool(
    "review_status",
    {
      title: "Review Job Status",
      description: "Check the status and progress of a background peer review job.",
      inputSchema: z.object({
        jobId: z.string().describe("Job ID returned by peer_review with async:true"),
      }),
    },
    async ({ jobId }) => {
      const job = getJob(jobId);
      if (!job) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: `Job ${jobId} not found` }) }],
        };
      }
      const { id, status, progress, startedAt, error } = job;
      return {
        content: [
          { type: "text", text: JSON.stringify({ id, status, progress, startedAt, error }, null, 2) },
        ],
      };
    }
  );

  // ── review_result ────────────────────────────────────────────────────────
  server.registerTool(
    "review_result",
    {
      title: "Review Job Result",
      description: "Retrieve the full results of a completed background peer review job.",
      inputSchema: z.object({
        jobId: z.string().describe("Job ID returned by peer_review with async:true"),
      }),
    },
    async ({ jobId }) => {
      const job = getJob(jobId);
      if (!job) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: `Job ${jobId} not found` }) }],
        };
      }
      if (job.status !== "done") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `Job ${jobId} is ${job.status}, not done yet` }),
            },
          ],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(job.results, null, 2) }],
      };
    }
  );

  // ── auto_improve ─────────────────────────────────────────────────────────
  server.registerTool(
    "auto_improve",
    {
      title: "Auto Improve Code",
      description:
        "Generate improved code based on peer review findings. " +
        "Returns the improved source — does NOT write to disk (use Claude Code's Edit tool to apply).",
      inputSchema: z.object({
        filePath: z.string().describe("Absolute path to the original file"),
        reviews: z
          .array(
            z.object({
              assistant: AssistantEnum,
              mode: z.enum(["cli", "api"]),
              findings: z.array(z.string()),
              suggestions: z.array(z.string()),
              rawOutput: z.string(),
              error: z.string().optional(),
            })
          )
          .describe("Review results from peer_review or review_result"),
      }),
    },
    async (args) => {
      const result = await autoImprove(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  return server;
}
