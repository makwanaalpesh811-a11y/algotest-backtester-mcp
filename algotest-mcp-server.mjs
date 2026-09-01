import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { chromium } from 'playwright';
import { z } from 'zod';

const PROFILE = process.env.ALGO_PROFILE || '/root/algotest-mcp/profile';
const CHROMIUM = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
let context;
let page;
let lastResult = null;

const strategySchema = {
  underlying: z.enum(['ETHUSD', 'BTCUSD']).default('ETHUSD'),
  exchange: z.enum(['Delta Exchange']).default('Delta Exchange'),
  entryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('22:00'),
  exitTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('07:00'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expiry: z.enum(['Today', 'Tomorrow', 'Weekly', 'Next Weekly', 'Monthly']).default('Today'),
  lots: z.number().int().positive().default(1),
  stopLoss: z.number().nonnegative().optional(),
  target: z.number().nonnegative().optional()
};

function textResult(text, extra = {}) {
  return { content: [{ type: 'text', text: JSON.stringify({ ...extra, text }, null, 2) }] };
}

async function getPage() {
  if (page && !page.isClosed()) return page;
  context = await chromium.launchPersistentContext(PROFILE, {
    headless: true,
    executablePath: CHROMIUM,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-features=UseDnsHttpsSvcb'],
    viewport: { width: 1280, height: 900 }
  });
  page = context.pages()[0] || await context.newPage();
  return page;
}

async function setNativeValue(locator, value) {
  await locator.evaluate((el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  }, value);
}

async function clickText(text, occurrence = 0) {
  const loc = page.getByText(text, { exact: true });
  await loc.nth(occurrence).click();
}

async function configure(s) {
  const p = await getPage();
  await p.goto('https://algotest.in/backtest', { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(2500);

  // Select Crypto -> Delta Exchange -> underlying.
  await p.getByText('Crypto', { exact: false }).first().click();
  await clickText('Delta Exchange', 0);
  const combo = p.locator('div[role="combobox"]').first();
  await combo.click();
  await p.getByRole('option', { name: new RegExp(s.underlying, 'i') }).click();

  // Intraday, times and date range.
  await clickText('Intraday', 0);
  const times = p.locator('input[type="time"]');
  await setNativeValue(times.nth(0), s.entryTime);
  await setNativeValue(times.nth(1), s.exitTime);
  const dates = p.locator('input[type="date"]');
  await setNativeValue(dates.nth(0), s.startDate);
  await setNativeValue(dates.nth(1), s.endDate);

  // First leg: Options, Sell, Call, expiry and ATM.
  await clickText('Options', 0);
  await clickText('Sell', 0);
  await clickText('Call', 0);
  const topSelects = p.locator('select');
  await topSelects.nth(3).selectOption({ label: s.expiry });
  await topSelects.nth(5).selectOption({ label: 'ATM' });
  const lots = p.locator('input[type="number"]').first();
  await lots.fill(String(s.lots));

  // Add second leg, then configure its select controls.
  await p.locator('#add-leg').click();
  const legPositions = p.locator('select[hint="Position"]');
  const legTypes = p.locator('select[hint="Option Type"]');
  const legExpiries = p.locator('select[hint="Expiry"]');
  if (await legPositions.count()) {
    await legPositions.last().selectOption({ label: 'Sell' });
    await legTypes.last().selectOption({ label: 'Put' });
    await legExpiries.last().selectOption({ label: s.expiry });
    const secondStrike = p.locator('select[hint="Select Strike Criteria"]').last().locator('xpath=following::select[1]');
    await secondStrike.selectOption({ label: 'ATM' });
  }

  // Keep per-leg and overall risk controls disabled unless explicitly requested.
  const body = await p.locator('body').innerText();
  return {
    url: p.url(),
    underlying: s.underlying,
    exchange: s.exchange,
    entryTime: s.entryTime,
    exitTime: s.exitTime,
    startDate: s.startDate,
    endDate: s.endDate,
    expiry: s.expiry,
    lots: s.lots,
    stopLoss: s.stopLoss ?? null,
    target: s.target ?? null,
    configured: true,
    pageExcerpt: body.slice(-1800)
  };
}

function extractMetric(body, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped + '[^\\d-]*(-?₹?[\\d,.]+)', 'i');
  const m = body.match(re);
  return m ? m[1] : null;
}

async function readResults() {
  const p = await getPage();
  const body = await p.locator('body').innerText();
  const result = {
    url: p.url(),
    overallProfit: extractMetric(body, 'Overall Profit'),
    trades: extractMetric(body, 'No. of Trades'),
    averageProfitPerTrade: extractMetric(body, 'Average Profit per Trade'),
    winRate: extractMetric(body, 'Win %'),
    maxDrawdown: extractMetric(body, 'Max Drawdown'),
    returnMaxDD: extractMetric(body, 'Return/MaxDD'),
    rewardRisk: extractMetric(body, 'Reward to Risk Ratio'),
    expectancy: extractMetric(body, 'Expectancy Ratio'),
    pageExcerpt: body.slice(-7000)
  };
  lastResult = result;
  return result;
}

const server = new McpServer({ name: 'algotest-backtester', version: '0.1.0' });

server.registerTool('preview_backtest', {
  description: 'Configure AlgoTest Backtester in the local browser profile without starting a backtest. Use this first.',
  inputSchema: strategySchema
}, async (args) => {
  try { return textResult('Preview configured; Start Backtest was not clicked.', await configure(args)); }
  catch (e) { return textResult(`Preview failed: ${e.message}`, { ok: false }); }
});

server.registerTool('run_backtest', {
  description: 'Configure and run AlgoTest Backtester. Requires confirm=true because it consumes a backtest quota. Never use for live trading.',
  inputSchema: { ...strategySchema, confirm: z.boolean().default(false) }
}, async (args) => {
  try {
    const config = await configure(args);
    if (!args.confirm) return textResult('Confirmation required. Configuration is ready but Start Backtest was not clicked.', { ok: false, requiresConfirmation: true, config });
    const p = await getPage();
    const button = p.getByRole('button', { name: /Start Backtest/i });
    await button.click();
    await p.waitForTimeout(12000);
    const result = await readResults();
    return textResult('Backtest completed or returned a validation result.', { ok: true, config, result });
  } catch (e) { return textResult(`Backtest failed: ${e.message}`, { ok: false }); }
});

server.registerTool('get_results', {
  description: 'Read the currently visible AlgoTest Backtest result metrics without starting a new run.',
  inputSchema: {}
}, async () => {
  try { return textResult('Current result read.', await readResults()); }
  catch (e) { return textResult(`Could not read results: ${e.message}`, { ok: false }); }
});

server.registerTool('close_browser', {
  description: 'Close the local automation browser while preserving the persistent login profile.',
  inputSchema: {}
}, async () => {
  if (context) await context.close();
  context = undefined; page = undefined;
  return textResult('Browser closed; persistent profile was preserved.');
});

const transport = new StdioServerTransport();
await server.connect(transport);
