---
description: Check whether the local code assistants are ready and configure the stop-time review gate
allowedTools:
  - Bash(node:*)
---

Run the setup check:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/peers-companion.mjs setup "$@"
```

Present the output to the user exactly as returned. If an assistant is unavailable, show instructions to install it or set the required API key.

Accepted flags:
- `--enable-review-gate`  — enable automatic review on session stop
- `--disable-review-gate` — disable automatic review on session stop
