import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gameUrl = pathToFileURL(resolve(projectRoot, 'Startup_Problem_Solving_Simulator_500_v6.html')).href;

let chrome;
let chromeProfile;
let cdp;
let chromeStderr = '';

async function executable(path) {
  if (!path) return false;
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    ...String(process.env.PATH || '')
      .split(delimiter)
      .flatMap((dir) => ['google-chrome', 'chromium', 'chromium-browser'].map((name) => resolve(dir, name))),
  ];
  for (const candidate of candidates) if (await executable(candidate)) return candidate;
  throw new Error('Chrome/Chromium not found. Set CHROME_BIN to run engine regression tests.');
}

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const port = server.address().port;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

async function waitForJson(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 80));
  }
  throw new Error(`Timed out waiting for Chrome DevTools at ${url}\n${chromeStderr.slice(-3000)}`);
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolveOpen, reject) => {
      socket.addEventListener('open', resolveOpen, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    return new Promise((resolveSend, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve: resolveSend, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(expression) {
  const response = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  }
  return response.result.value;
}

function closeEnough(actual, expected, epsilon = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be within ${epsilon} of ${expected}`);
}

before(async () => {
  const chromeBin = await findChrome();
  const port = await freePort();
  chromeProfile = await mkdtemp(resolve(tmpdir(), 'startup-sim-test-'));
  chrome = spawn(
    chromeBin,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${chromeProfile}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  chrome.stderr.on('data', (chunk) => {
    chromeStderr += chunk.toString();
  });
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(gameUrl)}`, { method: 'PUT' });
  assert.equal(targetResponse.ok, true, 'Chrome should create a page target');
  const target = await targetResponse.json();
  cdp = await CdpClient.connect(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await evaluate(`document.readyState === 'complete' && typeof makeInitialState === 'function'`)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error('Game script did not become ready');
}, { timeout: 30_000 });

after(async () => {
  cdp?.close();
  if (chrome && !chrome.killed) chrome.kill('SIGTERM');
  if (chromeProfile) await rm(chromeProfile, { recursive: true, force: true });
});

test('zero usable research units create an access signal but no target evidence', async () => {
  const result = await evaluate(`(() => {
    const s = makeInitialState(setupSelection);
    s.rng = 1;
    const p = s.problemOps.problems.find((problem) => problem.type === 'unclear_icp');
    v6RecomputeEvidenceState(s);
    const before = {
      metric: s.bootstrap.research.budgetEvidence,
      problemEvidence: s.bootstrap.problemEvidence,
      sampleQuality: s.bootstrap.research.sampleQuality,
      evidenceQuality: s.bootstrap.research.evidenceQuality,
      diversity: s.bootstrap.research.evidenceDiversity,
      insights: s.bootstrap.research.synthesizedInsights,
      hypotheses: p.hypotheses.map((h) => h.score),
    };
    const output = v6ResearchOutcome({ payload: { question: 'budget', sample: 'cold_targeted', method: 'proposal', count: 1 } }, p, 1, s);
    return {
      output,
      before,
      after: {
        metric: s.bootstrap.research.budgetEvidence,
        problemEvidence: s.bootstrap.problemEvidence,
        sampleQuality: s.bootstrap.research.sampleQuality,
        evidenceQuality: s.bootstrap.research.evidenceQuality,
        diversity: s.bootstrap.research.evidenceDiversity,
        insights: s.bootstrap.research.synthesizedInsights,
        hypotheses: p.hypotheses.map((h) => h.score),
      },
      evidence: s.problemOps.evidence[0],
    };
  })()`);

  assert.match(result.output, /^0\/1 unit usable/);
  closeEnough(result.after.metric, result.before.metric);
  closeEnough(result.after.problemEvidence, result.before.problemEvidence);
  closeEnough(result.after.sampleQuality, result.before.sampleQuality);
  closeEnough(result.after.evidenceQuality, result.before.evidenceQuality);
  closeEnough(result.after.diversity, result.before.diversity);
  assert.equal(result.after.insights, result.before.insights);
  assert.deepEqual(result.after.hypotheses, result.before.hypotheses);
  assert.equal(result.evidence.direction, 'neutral');
  assert.equal(result.evidence.hypothesisId, null);
});

test('usable research increases evidence while repeated designs do not fake diversity', async () => {
  const result = await evaluate(`(() => {
    const s = makeInitialState(setupSelection);
    s.rng = 9;
    const p = s.problemOps.problems.find((problem) => problem.type === 'unclear_icp');
    const action = { payload: { question: 'severity', sample: 'existing_users', method: 'interview', count: 6 } };
    const metric0 = s.bootstrap.research.problemSeverity;
    const diversity0 = s.bootstrap.research.evidenceDiversity;
    const first = v6ResearchOutcome(action, p, 1, s);
    const metric1 = s.bootstrap.research.problemSeverity;
    const diversity1 = s.bootstrap.research.evidenceDiversity;
    const second = v6ResearchOutcome(action, p, 1, s);
    return { first, second, metric0, metric1, metric2: s.bootstrap.research.problemSeverity, diversity0, diversity1, diversity2: s.bootstrap.research.evidenceDiversity, history: s.bootstrap.research.designHistory };
  })()`);

  assert.doesNotMatch(result.first, /^0\//);
  assert.doesNotMatch(result.second, /^0\//);
  assert.ok(result.metric1 > result.metric0);
  assert.ok(result.metric2 > result.metric1);
  assert.equal(result.diversity1, result.diversity0 + 4);
  assert.equal(result.diversity2, result.diversity1);
  assert.deepEqual(result.history, ['existing_users:interview']);
});

test('overload quality is accumulated before completion and is independent of completion status', async () => {
  const result = await evaluate(`(() => {
    const s = makeInitialState(setupSelection);
    s.rng = 777;
    const p = s.problemOps.problems.find((problem) => problem.type === 'product_scope');
    s.problemOps.actions = Array.from({ length: 6 }, (_, index) => ({
      id: 'overload_' + index,
      problemId: p.id,
      title: 'Overload regression ' + index,
      effect: 'noop',
      actionId: null,
      payload: {},
      status: 'active',
      size: 'major',
      intensity: 'sustainable',
      startedDay: 0,
      baseDays: 1,
      estimatedDays: 1,
      remainingWork: 1,
      cashCost: 0,
      executionAttentionWeighted: 0,
      executionWorkDone: 0,
    }));
    state = s;
    activeTab = 'situation';
    renderApp();
    const before = v6AttentionDiagnostics(s);
    v6AdvanceToNextDecision();
    closeModal();
    const completed = s.problemOps.actions.filter((action) => action.status === 'completed');
    const action = completed[0];
    s.rng = 1234;
    const completedQuality = v6ActionExecutionQuality(action, s, { quality: 0.2 });
    s.problemOps.actions.forEach((item) => { item.status = 'active'; });
    s.rng = 1234;
    const activeQuality = v6ActionExecutionQuality(action, s, { quality: 1 });
    return {
      before,
      completedCount: completed.length,
      attentionQualities: completed.map((item) => item.executionAttentionQuality),
      executionQualities: completed.map((item) => item.executionQuality),
      completedQuality,
      activeQuality,
    };
  })()`);

  assert.ok(result.before.quality < 0.6, 'fixture should be materially overloaded');
  assert.equal(result.completedCount, 6);
  for (const quality of result.attentionQualities) closeEnough(quality, result.before.quality);
  for (const quality of result.executionQualities) assert.ok(Number.isFinite(quality));
  closeEnough(result.completedQuality, result.activeQuality);
});

test('fixed savings reduce expenses before solvency checks and keep the cash bridge consistent', async () => {
  const result = await evaluate(`(() => {
    const s = makeInitialState(setupSelection);
    s.cash = 9;
    s.bootstrap.personalCash = 10000;
    s.problemOps.monthlyFixedSavings = 999;
    s.rng = 99;
    const cap = maxMonthlyFixedSavings(s);
    const close = v6CloseProblemMonth(s);
    return { cap, status: s.game.status, reason: s.game.reason, cash: s.cash, close };
  })()`);

  assert.equal(result.status, 'active');
  assert.ok(result.cash > 0);
  closeEnough(result.close.endCash, result.close.startCash + result.close.finance.netCashFlow);
  closeEnough(result.close.finance.burn, Math.max(0, -result.close.finance.netCashFlow));
  closeEnough(result.close.finance.fixedSavings, result.cap);
  closeEnough(result.close.finance.softwareOffice, result.close.finance.grossSoftwareOffice - result.cap);
  assert.ok(result.close.finance.runway >= 0);
});

test('tool cuts cannot exceed the actually reducible monthly expense', async () => {
  const result = await evaluate(`(() => {
    const s = makeInitialState(setupSelection);
    s.cash = 50;
    s.rng = 42;
    const p = v6SpawnProblem('cash_crisis', { severity: 4 }, s);
    const action = { problemId: p.id, effect: 'cut_tools', intensity: 'sustainable', payload: {} };
    for (let i = 0; i < 20; i += 1) v6ApplyActionOutcome(action, s, 1);
    return { stored: s.problemOps.monthlyFixedSavings, applied: appliedMonthlyFixedSavings(s), cap: maxMonthlyFixedSavings(s) };
  })()`);

  closeEnough(result.stored, result.cap);
  closeEnough(result.applied, result.cap);
});

test('founder injection is a company liability, not new personal debt', async () => {
  const result = await evaluate(`(() => {
    const s = makeInitialState(setupSelection);
    s.cash = 50;
    s.bootstrap.personalCash = 1000;
    s.bootstrap.personalDebt = 100;
    const p = v6SpawnProblem('cash_crisis', { severity: 4 }, s);
    const before = { company: s.cash, personal: s.bootstrap.personalCash, debt: s.bootstrap.personalDebt, founderLoan: s.bootstrap.founderLoanBalance };
    v6ApplyActionOutcome({ problemId: p.id, effect: 'personal_injection', intensity: 'sustainable', payload: {} }, s, 1);
    return { before, after: { company: s.cash, personal: s.bootstrap.personalCash, debt: s.bootstrap.personalDebt, founderLoan: s.bootstrap.founderLoanBalance } };
  })()`);

  closeEnough(result.after.company + result.after.personal, result.before.company + result.before.personal);
  assert.equal(result.after.debt, result.before.debt);
  assert.equal(result.after.founderLoan - result.before.founderLoan, result.after.company - result.before.company);
});

test('all seven primary views still render after engine changes', async () => {
  const result = await evaluate(`(() => {
    state = makeInitialState(setupSelection);
    return TABS.map(([key]) => {
      try {
        setActiveTab(key);
        return { key, ok: true, panels: document.querySelectorAll('.panel').length };
      } catch (error) {
        return { key, ok: false, error: error.stack };
      }
    });
  })()`);

  assert.equal(result.length, 7);
  for (const view of result) {
    assert.equal(view.ok, true, `${view.key}: ${view.error || 'render failed'}`);
    assert.ok(view.panels > 0, `${view.key} should render panels`);
  }
});
