#!/usr/bin/env node
/**
 * peers-companion.mjs  —  CLI orchestrator for mcp-peers
 *
 * Mirrors the interface of codex-plugin-cc's codex-companion.mjs but
 * delegates all work to the MCP server (dist/index.js) via JSON-RPC
 * over stdio rather than routing to a Codex app server.
 *
 * Subcommands: setup | review | adversarial-review | task | status | result | cancel
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_SERVER = join(__dirname, "../../../../dist/index.js");
const STATE_DIR = join(homedir(), ".mcp-peers");
const STATE_FILE = join(STATE_DIR, "state.json");

// ── state helpers ─────────────────────────────────────────────────────────

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { reviewGateEnabled: false, jobs: {} };
  }
}

function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── MCP JSON-RPC over stdio ───────────────────────────────────────────────

function callMcpTool(toolName, args, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [MCP_SERVER], { stdio: "pipe" });
    const id = 1;
    const chunks = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill("SIGTERM");
        reject(new Error(`MCP tool ${toolName} timed out`));
      }
    }, timeoutMs);

    proc.stdout.on("data", (d) => chunks.push(d));
    proc.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const raw = Buffer.concat(chunks).toString("utf8");
      // Each JSON-RPC message is a newline-delimited JSON object
      const lines = raw.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.id === id && msg.result) {
            const text = msg.result.content?.[0]?.text ?? "{}";
            try {
              resolve(JSON.parse(text));
            } catch {
              resolve(text);
            }
            return;
          }
          if (msg.id === id && msg.error) {
            reject(new Error(msg.error.message));
            return;
          }
        } catch {
          // skip non-JSON lines (e.g. server startup messages)
        }
      }
      reject(new Error(`No response received from MCP server. Output: ${raw.slice(0, 200)}`));
    });

    proc.on("error", (err) => {
      if (!settled) { settled = true; clearTimeout(timer); reject(err); }
    });

    // Send initialize then tools/call
    const init = JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "peers-companion", version: "1.0.0" } } });
    const call = JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: toolName, arguments: args } });
    proc.stdin.write(init + "\n");
    proc.stdin.write(call + "\n");
    proc.stdin.end();
  });
}

// ── git helpers ───────────────────────────────────────────────────────────

function getChangedFiles() {
  try {
    const out = execSync("git diff --name-only HEAD", { encoding: "utf8" });
    return out.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function getCwd() {
  return process.cwd();
}

// ── subcommand handlers ───────────────────────────────────────────────────

async function handleSetup(args) {
  const state = loadState();
  if (args.includes("--enable-review-gate")) {
    state.reviewGateEnabled = true;
    saveState(state);
    console.log("✓ Stop-time review gate ENABLED.");
  } else if (args.includes("--disable-review-gate")) {
    state.reviewGateEnabled = false;
    saveState(state);
    console.log("✓ Stop-time review gate DISABLED.");
  }

  let statuses;
  try {
    statuses = await callMcpTool("list_assistants", {});
  } catch (err) {
    console.error("✗ Could not reach MCP server:", err.message);
    console.error("  Make sure the server is built: npm run build (in the mcp-peers-cli directory)");
    process.exit(1);
  }

  console.log("\n── Assistant Status ───────────────────────────────");
  for (const s of statuses) {
    const cli = s.cliAvailable ? "✓ CLI" : "✗ CLI";
    const api = s.apiAvailable ? "✓ API" : "✗ API";
    console.log(`  ${s.name.padEnd(8)} ${cli}  ${api}`);
  }
  console.log("\nReview gate:", state.reviewGateEnabled ? "enabled" : "disabled");
  console.log("────────────────────────────────────────────────\n");
}

async function handleReview(reviewType, rawArgs) {
  const isBackground = rawArgs.includes("--background");
  const isWait = rawArgs.includes("--wait");
  const asyncMode = isBackground && !isWait;

  // parse --assistants flag
  const assistantsIdx = rawArgs.indexOf("--assistants");
  const assistants =
    assistantsIdx >= 0
      ? rawArgs[assistantsIdx + 1].split(",")
      : ["claude", "codex"];

  // parse --focus flag
  const focusIdx = rawArgs.indexOf("--focus");
  const focus = focusIdx >= 0 ? rawArgs[focusIdx + 1] : undefined;

  // find files to review
  const changedFiles = getChangedFiles();
  if (changedFiles.length === 0) {
    console.log("No changed files detected in the working tree.");
    return;
  }

  const results = [];

  for (const file of changedFiles) {
    const filePath = join(getCwd(), file);
    if (!existsSync(filePath)) continue;

    const params = {
      filePath,
      assistants,
      reviewType,
      async: asyncMode,
      ...(focus ? { focus } : {}),
    };

    if (asyncMode) {
      const resp = await callMcpTool("peer_review", params);
      console.log(`Job started for ${file}: ${resp.jobId}`);
      const state = loadState();
      state.jobs[resp.jobId] = { file, reviewType, startedAt: new Date().toISOString() };
      saveState(state);
    } else {
      console.log(`Reviewing ${file}...`);
      const fileResults = await callMcpTool("peer_review", params, 180_000);
      results.push({ file, results: fileResults });
    }
  }

  if (!asyncMode && results.length > 0) {
    renderResults(results);
  }
}

function renderResults(fileReviews) {
  for (const { file, results } of fileReviews) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`File: ${file}`);
    console.log("═".repeat(60));
    for (const r of results) {
      if (r.error) {
        console.log(`\n[${r.assistant}] ✗ Error: ${r.error}`);
        continue;
      }
      console.log(`\n[${r.assistant}] (${r.mode})`);
      if (r.findings.length) {
        console.log("  Findings:");
        r.findings.forEach((f) => console.log(`    • ${f}`));
      }
      if (r.suggestions.length) {
        console.log("  Suggestions:");
        r.suggestions.forEach((s) => console.log(`    → ${s}`));
      }
    }
  }
}

async function handleStatus(args) {
  const jobId = args.find((a) => !a.startsWith("-"));
  if (jobId) {
    const status = await callMcpTool("review_status", { jobId });
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  const state = loadState();
  const jobs = Object.entries(state.jobs);
  if (jobs.length === 0) { console.log("No jobs found."); return; }

  const rows = [];
  for (const [id, meta] of jobs) {
    let status;
    try {
      status = await callMcpTool("review_status", { jobId: id });
    } catch {
      status = { status: "unknown", progress: 0 };
    }
    rows.push({ jobId: id.slice(0, 8) + "...", file: meta.file, status: status.status, progress: `${status.progress ?? 0}%`, started: meta.startedAt });
  }

  console.log("\njobId        file                        status    progress  started");
  console.log("─".repeat(75));
  for (const r of rows) {
    console.log(`${r.jobId}  ${r.file.padEnd(28)}  ${r.status.padEnd(8)}  ${r.progress.padEnd(8)}  ${r.started}`);
  }
}

async function handleResult(args) {
  const jobId = args.find((a) => !a.startsWith("-"));
  if (!jobId) { console.error("Usage: peers-companion.mjs result <jobId>"); process.exit(1); }
  const result = await callMcpTool("review_result", { jobId });
  console.log(JSON.stringify(result, null, 2));
}

async function handleCancel(args) {
  const jobId = args.find((a) => !a.startsWith("-"));
  if (!jobId) { console.error("Usage: peers-companion.mjs cancel <jobId>"); process.exit(1); }
  // Jobs are in-memory in the MCP server; best we can do is mark locally
  const state = loadState();
  if (state.jobs[jobId]) {
    delete state.jobs[jobId];
    saveState(state);
  }
  console.log(`Job ${jobId} removal requested. (In-process jobs stop when the MCP server exits.)`);
}

async function handleTask(args) {
  // Delegate to review as a convenience alias
  await handleReview("standard", args);
}

// ── main ──────────────────────────────────────────────────────────────────

const [, , subcommand, ...rest] = process.argv;

const handlers = {
  setup: () => handleSetup(rest),
  review: () => handleReview("standard", rest),
  "adversarial-review": () => handleReview("adversarial", rest),
  task: () => handleTask(rest),
  status: () => handleStatus(rest),
  result: () => handleResult(rest),
  cancel: () => handleCancel(rest),
};

const handler = handlers[subcommand];
if (!handler) {
  console.error(`Unknown subcommand: ${subcommand}`);
  console.error(`Available: ${Object.keys(handlers).join(", ")}`);
  process.exit(1);
}

handler().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
