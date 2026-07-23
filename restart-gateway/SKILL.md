---
name: restart-gateway
description: Restart the OpenClaw gateway. Use when the user says "restart gateway", "重启 gateway", or similar.
---

# Restart OpenClaw Gateway

Follow these steps in order:

## 1. Stop existing gateway

```bash
lsof -ti:18789 2>/dev/null | xargs kill 2>/dev/null
```

Wait 1 second for the process to exit.

## 2. Rebuild (only if source code was modified)

If any source files under `extensions/` or `src/` were modified since the last build, run:

```bash
pnpm build
```

If no source changes were made, skip this step.

## 3. Start gateway in prod mode

```bash
pnpm openclaw gateway
```

Run this in the background.

## Important notes

- Prod gateway uses port **18789**. Dev gateway uses 19001.
- Always use `pnpm openclaw gateway` (prod mode), NOT `pnpm gateway:dev` or `pnpm gateway:watch`.
- `pnpm openclaw gateway stop` only works for launchd-managed services. For manually started gateways, use `kill` via `lsof`.
- After starting, verify the gateway is running by checking the background task output for the "listening on" message.
