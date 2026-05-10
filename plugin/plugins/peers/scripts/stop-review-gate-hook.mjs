#!/usr/bin/env node
/**
 * stop-review-gate-hook.mjs  —  Claude Code Stop hook
 *
 * Clones the behaviour of codex-plugin-cc's stop-review-gate-hook.mjs.
 * When the stop-time review gate is enabled this script:
 *   1. Reads Claude Code's hook JSON from stdin
 *   2. Runs a foreground peer review via peers-companion.mjs
 *   3. If outstanding findings exist → emits BLOCK to prevent session exit
 *   4. Otherwise → emits ALLOW
 *
 * stdout: JSON decision  { "decision": "ALLOW" | "BLOCK", "reason": "..." }
 * stderr: diagnostic log lines
 */

import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(homedir(), ".mcp-peers", "state.json");
const COMPANION = join(__dirname, "peers-companion.mjs");
const TIMEOUT_MS = 900_000; // 15 minutes, matching codex-plugin-cc

function logNote(msg) {
  process.stderr.write(`[mcp-peers stop-gate] ${msg}\n`);
}

function emitDecision(decision, reason) {
  process.stdout.write(JSON.stringify({ decision, reason }) + "\n");
}

function readHookInput() {
  try {
    const raw = readFileSync("/dev/stdin", "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { reviewGateEnabled: false };
  }
}

function runStopReview() {
  return new Promise((resolve) => {
    const proc = spawn("node", [COMPANION, "review", "--wait"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks = [];
    const errChunks = [];
    proc.stdout.on("data", (d) => chunks.push(d));
    proc.stderr.on("data", (d) => errChunks.push(d));

    const timer = setTimeout(() => {
      logNote("Review timed out after 15 minutes.");
      proc.kill("SIGTERM");
      resolve({ timedOut: true, output: "" });
    }, TIMEOUT_MS);

    proc.on("close", (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString("utf8");
      resolve({ timedOut: false, code, output });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      logNote(`Failed to spawn review: ${err.message}`);
      resolve({ timedOut: false, code: 1, output: "" });
    });
  });
}

function hasOutstandingFindings(output) {
  // Heuristic: look for non-empty findings sections in the output
  return /findings:/i.test(output) && /•/.test(output);
}

// ── main ──────────────────────────────────────────────────────────────────

const hookInput = readHookInput();
logNote(`Stop hook triggered. session_id=${hookInput.session_id ?? "unknown"}`);

const state = loadState();

if (!state.reviewGateEnabled) {
  logNote("Review gate is disabled — allowing session to stop.");
  emitDecision("ALLOW", "Review gate is not enabled.");
  process.exit(0);
}

logNote("Review gate is enabled — running peer review before allowing stop...");

const { timedOut, output } = await runStopReview();

if (timedOut) {
  logNote("Review timed out. Allowing session to stop.");
  emitDecision("ALLOW", "Peer review timed out — session exit allowed.");
  process.exit(0);
}

if (hasOutstandingFindings(output)) {
  logNote("Outstanding findings detected — blocking session stop.");
  emitDecision(
    "BLOCK",
    "Peer review found outstanding issues. Review the findings above, then stop again to exit."
  );
} else {
  logNote("No blocking findings — allowing session to stop.");
  emitDecision("ALLOW", "Peer review completed with no blocking findings.");
}
