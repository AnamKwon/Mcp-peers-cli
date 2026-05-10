---
description: Run an adversarial peer code review that challenges design decisions and assumptions
allowedTools:
  - Bash(node:*, git:*)
  - Read
  - Glob
  - Grep
  - AskUserQuestion
---

Run a challenge-focused review that scrutinises the implementation approach and design choices rather than just catching defects.

## Execution flow

1. Estimate scope the same way as /peers:review.
2. Ask the user for foreground vs background if not already specified.
3. Preserve any focus text or flags from the user's input exactly.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/peers-companion.mjs adversarial-review "$@"
```

4. Return Codex output verbatim — no commentary.

Supported flags: same as /peers:review, plus:
- `--focus <text>`  — framing for the adversarial challenge (passed through unchanged)
