#!/usr/bin/env node
/**
 * post-edit-review-hook.mjs  —  Claude Code PostToolUse hook
 *
 * Fires automatically after every Edit or Write tool use.
 * Runs a synchronous peer review on the modified file and injects
 * the findings as a "note" back into Claude's context so Claude
 * continues fixing until the review is clean.
 *
 * Loop termination: when no findings are returned, no note is emitted
 * and the automatic review-fix cycle ends naturally.
 *
 * stdout: JSON  { "note": "..." }  or nothing
 * stderr: diagnostic log lines
 */

import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_SERVER = join(__dirname, "../../../../dist/index.js");

const REVIEW_TIMEOUT_MS = 120_000;

// ── stdin ─────────────────────────────────────────────────────────────────

function readHookInput() {
  try {
    return JSON.parse(readFileSync("/dev/stdin", "utf8"));
  } catch {
    return {};
  }
}

function logNote(msg) {
  process.stderr.write(`[mcp-peers post-edit] ${msg}\n`);
}

// ── MCP peer_review via JSON-RPC ──────────────────────────────────────────

function callPeerReview(filePath) {
  return new Promise((resolve) => {
    const proc = spawn("node", [MCP_SERVER], { stdio: "pipe" });
    const chunks = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill("SIGTERM");
        resolve(null);
      }
    }, REVIEW_TIMEOUT_MS);

    proc.stdout.on("data", (d) => chunks.push(d));
    proc.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const raw = Buffer.concat(chunks).toString("utf8");
      for (const line of raw.split("\n").filter((l) => l.trim())) {
        try {
          const msg = JSON.parse(line);
          if (msg.id === 1 && msg.result) {
            const text = msg.result.content?.[0]?.text ?? "[]";
            try { resolve(JSON.parse(text)); } catch { resolve(null); }
            return;
          }
        } catch { /* skip */ }
      }
      resolve(null);
    });

    proc.on("error", () => { if (!settled) { settled = true; clearTimeout(timer); resolve(null); } });

    const init = JSON.stringify({
      jsonrpc: "2.0", id: 0, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "post-edit-hook", version: "1.0.0" } },
    });
    const call = JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "peer_review", arguments: { filePath, assistants: ["claude", "codex"], reviewType: "standard", async: false } },
    });
    proc.stdin.write(init + "\n");
    proc.stdin.write(call + "\n");
    proc.stdin.end();
  });
}

// ── format note for Claude ────────────────────────────────────────────────

function buildNote(filePath, results) {
  const lines = [`Peer review completed for \`${filePath}\`:\n`];
  let totalFindings = 0;

  for (const r of results) {
    if (r.error) continue;
    if (!r.findings.length && !r.suggestions.length) continue;

    lines.push(`**[${r.assistant}]**`);
    if (r.findings.length) {
      lines.push("Findings:");
      r.findings.forEach((f) => { lines.push(`  • ${f}`); totalFindings++; });
    }
    if (r.suggestions.length) {
      lines.push("Suggestions:");
      r.suggestions.forEach((s) => lines.push(`  → ${s}`));
    }
    lines.push("");
  }

  if (totalFindings === 0) return null; // no note needed — loop ends

  lines.push("Please apply the suggestions above to address these findings.");
  return lines.join("\n");
}

// ── main ──────────────────────────────────────────────────────────────────

const input = readHookInput();
const toolName = input.tool_name ?? "";
const toolInput = input.tool_input ?? {};

// Only act on Edit or Write tool uses
if (!["Edit", "Write"].includes(toolName)) process.exit(0);

const filePath = toolInput.file_path ?? toolInput.path;
if (!filePath || !existsSync(filePath)) {
  logNote(`Skipping — file not found: ${filePath}`);
  process.exit(0);
}

logNote(`Running peer review on ${filePath}...`);
const results = await callPeerReview(filePath);

if (!results || !Array.isArray(results)) {
  logNote("Review returned no results — skipping.");
  process.exit(0);
}

const note = buildNote(filePath, results);

if (note) {
  process.stdout.write(JSON.stringify({ note }) + "\n");
  logNote("Injected review findings into Claude context.");
} else {
  logNote("No findings — review is clean. Loop ends.");
}
