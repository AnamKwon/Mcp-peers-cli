---
description: Cancel an active background peer review job
allowedTools:
  - Bash(node:*)
---

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/peers-companion.mjs cancel "$@"
```

Present the output verbatim.

Required argument: `<jobId>`
