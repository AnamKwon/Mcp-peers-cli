---
description: Show active and recent peer review jobs for this repository
allowedTools:
  - Bash(node:*)
---

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/peers-companion.mjs status "$@"
```

Rendering rules:
- **Without a jobId** — display a compact Markdown table with columns: jobId, assistants, reviewType, status, progress, startedAt
- **With a jobId** — show the full output without truncation

Supported flags:
- `--wait`          — poll until the job completes
- `--timeout-ms <n>` — max wait time in ms (default 300000)
- `--all`           — include jobs from other sessions
