# AlgoTest Backtester MCP for Termux

This local MCP server controls the already-authenticated AlgoTest Backtester browser profile using Playwright and system Chromium. It is intended for personal use with Claude Code.

## Files

Copy `algotest-mcp-server.mjs` into `/root/algotest-mcp/` inside the Debian PRoot environment where Chromium and npm dependencies are installed. The repository also includes `login-session.cjs` for local hidden-password login and `BROWSER_ACCESS.md` with the complete Android/Termux/PRoot browser setup.

## Install

```bash
cd /root/algotest-mcp
npm install --no-audit --no-fund playwright @modelcontextprotocol/sdk zod
# The package is already installed with PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1.
```

The server expects the persistent login profile at `/root/algotest-mcp/profile` and Chromium at `/usr/bin/chromium`. These can be overridden with `ALGO_PROFILE` and `CHROMIUM_PATH`.

## Create or refresh the local login session

```bash
cd /root/algotest-mcp
node login-session.cjs
```

The helper reads credentials locally, does not print the password, and stores the authenticated Playwright profile under `/root/algotest-mcp/profile`. Never commit or share that directory.

## Test server manually

```bash
cd /root/algotest-mcp
node algotest-mcp-server.mjs
```

The process uses stdio and will appear to wait; press Ctrl+C to stop. Do not type passwords into the server process.

## Add to Claude Code

Claude Code commonly supports adding a local stdio MCP server with an `mcp add` command. From the same Debian shell, try:

```bash
claude mcp add algotest-backtester -- node /root/algotest-mcp/algotest-mcp-server.mjs
```

If your installed Claude Code version uses a different MCP command, run `claude mcp --help` and add a local server with:

- Name: `algotest-backtester`
- Transport: `stdio`
- Command: `node`
- Arguments: `/root/algotest-mcp/algotest-mcp-server.mjs`

## Available tools

`preview_backtest` configures the Backtester and never presses Start Backtest. `run_backtest` requires `confirm: true`; without confirmation it only returns the configuration preview. `get_results` reads the currently visible result page. `close_browser` closes the browser but preserves the login profile.

## Example Claude Code request

```text
Use preview_backtest for Delta Exchange ETHUSD: intraday, entry 22:00, exit 07:00, sell ATM call and sell ATM put, Today expiry, start 2025-10-16, end 2026-09-01, 1 lot, no stop-loss and no target.
```

After reviewing the preview, explicitly ask Claude Code to run it. The tool itself still requires `confirm: true` as a safety guard.

## Important limitations

The browser profile must remain available and the Debian/Termux process must not be killed. OTP, CAPTCHA, session expiry, or a changed AlgoTest UI may require manual intervention. The automation is for Backtester data only; it does not place live orders or deploy an algo. The `Today` expiry plus a 22:00-to-07:00 overnight window may be rejected by AlgoTest validation; the tool will return the platform's message.

Never share AlgoTest passwords or OTPs in chat. If a session expires, run a separate local login flow and preserve the profile directory.
