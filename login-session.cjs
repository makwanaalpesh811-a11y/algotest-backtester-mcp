const fs = require('fs');
const readline = require('readline');
const { chromium } = require('playwright');

function findChromium() {
  const candidates = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const base of ['/root/.cache/ms-playwright', '/home/ubuntu/.cache/ms-playwright']) {
    try { for (const dir of fs.readdirSync(base)) if (dir.startsWith('chromium-')) candidates.push(`${base}/${dir}/chrome-linux/chrome`); } catch (_) {}
  }
  return candidates.find(p => { try { return p && fs.statSync(p).isFile() && fs.statSync(p).size > 100000; } catch (_) { return false; } });
}

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    if (!hidden) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, answer => { rl.close(); resolve(answer); });
      return;
    }
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode?.(true);
    let value = '';
    const onData = (chunk) => {
      const key = chunk.toString();
      if (key === '\u0003') process.exit(130);
      if (key === '\r' || key === '\n') {
        stdin.setRawMode?.(wasRaw || false);
        stdin.off('data', onData);
        process.stdout.write('\n');
        resolve(value);
      } else if (key === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += key;
      }
    };
    stdin.on('data', onData);
    stdin.resume();
  });
}

(async () => {
  const phone = (await ask('AlgoTest phone: ')).trim();
  const password = await ask('AlgoTest password: ', true);
  if (!phone || !password) throw new Error('Phone/password required');

  const context = await chromium.launchPersistentContext('/root/algotest-mcp/profile', {
    headless: true,
    executablePath: findChromium(),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://algotest.in/login', { waitUntil: 'networkidle', timeout: 60000 });
  await page.locator('input[name="phone"]').fill(phone);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForTimeout(8000);
  console.log('Login result URL:', page.url());
  console.log('Authenticated dashboard:', page.url().includes('/dashboard') ? 'yes' : 'no');
  await context.close();
  password.replace?.(/.*/g, '');
})().catch(error => { console.error('Login failed:', error.message); process.exit(1); });
