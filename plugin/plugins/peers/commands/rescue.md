---
description: Delegate a complex task or bug investigation to the peer assistant network
allowedTools:
  - Bash(node:*)
  - AskUserQuestion
---

Forward the user's rescue request to the peers companion script. Do nothing else — execute exactly one Bash command:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/peers-companion.mjs task "$@"
```

Default to foreground (`--wait`) for bounded tasks; use `--background` for open-ended or lengthy operations.

Return the command's stdout exactly as-is.
