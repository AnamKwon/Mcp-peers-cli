---
description: Display the final output from a completed peer review job
allowedTools:
  - Bash(node:*)
---

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/peers-companion.mjs result "$@"
```

Present the complete, unmodified command output — including job status, verdict, findings, suggestions, and any error messages. Do not summarise.

Required argument: `<jobId>`
