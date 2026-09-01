# Browser access on Android Termux

## Architecture

Claude Code runs in the Termux/PRoot Debian shell. The MCP server starts a persistent Chromium context with Playwright. The browser profile is stored locally at `/root/algotest-mcp/profile`, so a successful AlgoTest session can be reused without sending credentials to Claude or GitHub.

```text
Claude Code
   │ stdio
   ▼
Local MCP server (Node.js)
   │ Playwright
   ▼
System Chromium (/usr/bin/chromium)
   │ HTTPS
   ▼
AlgoTest Backtester
```

## Initial installation

From the normal Termux shell:

```bash
pkg update -y && pkg upgrade -y
pkg install nodejs-lts git wget proot-distro -y
proot-distro install debian
proot-distro login debian --shared-tmp
```

Inside Debian:

```bash
apt update
apt install -y chromium nodejs npm ca-certificates
mkdir -p /root/algotest-mcp
cd /root/algotest-mcp
npm install --no-audit --no-fund playwright @modelcontextprotocol/sdk zod
```

Do not run `proot-distro` from inside the Debian prompt. To leave Debian, run `exit`; to enter it again, run `proot-distro login debian --shared-tmp` from the normal Termux prompt.

## Copy and check the project

Copy the repository files into `/root/algotest-mcp/` and run:

```bash
cd /root/algotest-mcp
node --check algotest-mcp-server.mjs
```

The server uses system Chromium and does not download another browser. If your Chromium is installed at another location, set it before launching:

```bash
export CHROMIUM_PATH=/path/to/chromium
```

## Local login session

Run the included helper:

```bash
cd /root/algotest-mcp
node login-session.cjs
```

Enter the phone and password directly into the local hidden prompt. The helper prints only whether the resulting URL is the dashboard; it never prints the password and never commits the profile. If an OTP, CAPTCHA, or additional verification screen appears, handle it manually in a browser that can display the page, then rerun the helper if needed. Never paste the password or OTP into chat.

The persistent profile is sensitive local data. Keep the directory private:

```bash
chmod 700 /root/algotest-mcp/profile
```

## Claude Code connection

From the Debian prompt, add the MCP server as a local stdio server:

```bash
cd /root/algotest-mcp
claude mcp add algotest-backtester -- node /root/algotest-mcp/algotest-mcp-server.mjs
claude mcp list
```

If your Claude Code release has a different command syntax, use `claude mcp --help` and create a server with command `node` and argument `/root/algotest-mcp/algotest-mcp-server.mjs`.

## Safe usage

Start with `preview_backtest`. It configures the page but does not press Start Backtest. Use `run_backtest` only after reviewing the returned configuration; it requires `confirm: true`. The MCP has no live-trading, order-placement, broker-setup, or algo-deployment command.

The default prototype supports ETHUSD and BTCUSD on Delta Exchange, intraday times, Today/Tomorrow/Weekly/Next Weekly/Monthly expiry choices, lots, ATM-style legs and the result metrics visible on the Backtester page. The UI can change over time; if a selector fails, inspect the current page before modifying the automation.

## Android reliability

Keep Termux running and exclude it from Android battery optimization if the process needs to remain active. Android may suspend or kill background processes. This setup is intended for on-demand personal use, not unattended 24/7 trading. A session can expire, and a CAPTCHA or OTP may require manual intervention.

## Troubleshooting

If the page shows “Internet Not Connected” while `curl -I https://algotest.in/login` returns HTTP 200, the banner may be the application’s generic unauthenticated state. A 401 response from `https://api.algotest.in/user` before login is expected. If the browser reaches `/dashboard`, authentication succeeded.

If npm reports an `ENOENT` cache rename error, use a temporary cache:

```bash
mkdir -p /tmp/npm-cache
npm_config_cache=/tmp/npm-cache npm install --no-audit --no-fund playwright @modelcontextprotocol/sdk zod
```

If Chromium cannot launch, check:

```bash
which chromium
chromium --version
node -v
```

and ensure the MCP process uses `--no-sandbox` and `--disable-dev-shm-usage` as in the included server.

## Security warning

Do not commit `/root/algotest-mcp/profile`, cookies, screenshots containing account information, passwords, OTPs, API tokens, or exported private strategy files. The repository `.gitignore` excludes profile, logs, screenshots and environment files by default.
