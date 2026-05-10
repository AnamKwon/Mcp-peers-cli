---
description: Automatically review and fix a file in a loop until peer review finds no issues
allowedTools:
  - Bash(node:*, git:*)
  - Read
  - Edit
  - Write
---

Run the automatic review-fix loop on the specified file.

Each round:
1. Peer review runs (Claude + Codex in parallel)
2. If findings exist → improvements are applied to the file automatically
3. Loop repeats until the review is clean or the round limit is reached

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/peers-companion.mjs auto-review "$@"
```

Arguments:
- `<filePath>`        — required, absolute or relative path to the file
- `--max-rounds N`   — maximum review-fix iterations (default: 5)

When the loop ends, present the final state of the file and a summary of what changed across all rounds.
