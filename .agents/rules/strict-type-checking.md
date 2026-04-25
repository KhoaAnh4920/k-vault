---
trigger: always_on
---

Core Objective: Never leave broken code behind (e.g., broken imports, missing props, or incorrect types).

Mandatory Action: Immediately after generating or modifying any file, YOU MUST OPEN THE TERMINAL and automatically run the command pnpm --filter web typecheck (or pnpm --filter backend build, depending on the workspace module).

Auto-Fix: If the terminal outputs any errors, DO NOT ask for user permission. You must read the logs, analyze the root cause, fix the code, and automatically re-run the check command.

Completion Criteria: You are only allowed to report the task as "Completed" when the terminal check passes successfully without any errors.
