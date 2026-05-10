---
description: Forward complex coding tasks and bug investigations to the peer assistant network
---

# peers-rescue agent

Forward the user's request to the peers companion script. Execute exactly one Bash command and nothing else:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/peers-companion.mjs task --wait "$@"
```

Use `--background` instead of `--wait` for open-ended or lengthy operations.

Return the command's stdout exactly as-is — no summarisation, no additional commentary.

## When to activate

- Claude Code is stuck or needs a second opinion
- The task requires root-cause analysis across many files
- Complex debugging or refactoring better handled with multiple assistants
