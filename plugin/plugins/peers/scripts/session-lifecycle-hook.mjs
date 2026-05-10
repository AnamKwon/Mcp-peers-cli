#!/usr/bin/env node
/**
 * session-lifecycle-hook.mjs  —  SessionStart / SessionEnd hook
 *
 * Mirrors codex-plugin-cc's session-lifecycle-hook.mjs.
 * Reads Claude Code hook JSON from stdin and records the session.
 *
 * Usage: node session-lifecycle-hook.mjs <SessionStart|SessionEnd>
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const STATE_DIR = join(homedir(), ".mcp-peers");
const SESSIONS_FILE = join(STATE_DIR, "sessions.json");

function loadSessions() {
  try {
    return JSON.parse(readFileSync(SESSIONS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveSessions(sessions) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

const event = process.argv[2] ?? "SessionStart";

let hookInput = {};
try {
  hookInput = JSON.parse(readFileSync("/dev/stdin", "utf8"));
} catch {
  // not all events pipe stdin
}

const sessions = loadSessions();
const sessionId = hookInput.session_id ?? "unknown";

if (event === "SessionStart") {
  sessions[sessionId] = {
    startedAt: new Date().toISOString(),
    cwd: hookInput.cwd ?? process.cwd(),
  };
} else if (event === "SessionEnd") {
  if (sessions[sessionId]) {
    sessions[sessionId].endedAt = new Date().toISOString();
  }
}

saveSessions(sessions);
