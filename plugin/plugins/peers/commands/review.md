---
description: Run a standard peer code review using Claude, Codex, and/or Gemini
allowedTools:
  - Bash(node:*, git:*)
  - Read
  - Glob
  - Grep
  - AskUserQuestion
---

Run a read-only peer code review on the current working-tree changes.

## Execution flow

1. Inspect git status to estimate review scope:
   - If the diff is clearly small (1-2 files, no directory-level changes) → recommend `--wait`
   - Otherwise → recommend `--background`
   - When uncertain, always run the review rather than declaring nothing to review

2. If the user did not supply `--wait` or `--background`, ask which mode they prefer.

3. Execute:
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/peers-companion.mjs review "$@"
```

4. Output the result verbatim — do not summarise or editorialize.

Supported flags:
- `--wait`            — foreground, blocks until complete
- `--background`      — async, returns a jobId; check progress with /peers:status
- `--assistants <names>` — comma-separated: claude,codex,gemini (default: claude,codex)
- `--focus <text>`    — specific area to focus on (e.g. security, performance)
- `--base <ref>`      — compare against this git ref instead of working tree
