const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function game() {
  const events = {};
  const context2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      width: 1280, height: 760, value: '50',
      getContext: () => context2d,
      addEventListener() {}, setAttribute() {},
      classList: { add() {}, remove() {}, toggle() {} }
    });
    return elements.get(id);
  };
  let now = 0;
  const context = vm.createContext({
    document: { getElementById: element, createElement: () => element(Symbol()) },
    window: { addEventListener: (name, fn) => { events[name] = fn; } },
    performance: { now: () => now }, requestAnimationFrame() {}, setTimeout() {}
  });
  const html = fs.readFileSync(path.join(__dirname, '../public/hockey8.html'), 'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1] + `
    globalThis.api = { player, cpu, puck, startSpinStrike, updateSpinStrike,
      updatePlayer, updateCPU, updatePuck, gameLoop, resetPositions,
      getCPUSpinPlan, tryCPUSpinStrike,
      pause(value) { paused = value; },
      difficulty(value) { aiDifficulty = value; },
      running() { return challengeRunning; }
    };
    let randomCalls = 0;
    Math.random = () => randomCalls++ % 2 ? 0.25 : 0.01;
  `, context);
  const api = context.api;
  api.resetPositions();
  Object.assign(api.player, { x: 550, y: 300, angle: 0 });
  Object.assign(api.cpu, { x: 900, y: 500 });
  return { ...api, events, tick: ms => { now += ms; api.gameLoop(); } };
}

test('a full sweep hits in every quadrant, in either direction, at different frame rates', () => {
  for (const fps of [20, 60, 144]) for (const direction of [-1, 1]) {
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const g = game();
      Object.assign(g.puck, { x: 550 + Math.cos(angle) * 45, y: 300 + Math.sin(angle) * 45 });
      assert.equal(g.startSpinStrike(g.player, direction), true);
      for (let i = 0; i < fps; i++) g.updateSpinStrike(g.player, 1 / fps);
      assert.equal(g.player.spin, null);
      assert.ok(Math.abs(g.player.angle) < 1e-7);
      assert.ok(Math.abs(Math.hypot(g.puck.vx, g.puck.vy) - 16) < 1e-7);
      assert.ok((g.puck.vx * Math.cos(angle) + g.puck.vy * Math.sin(angle)) / 16 > 0.997);
      assert.equal(g.running(), true);
    }
  }
});

test('no distant, through-body or through-net hits; misses still consume cooldown', () => {
  for (const [x, y, px, py] of [[650, 300, 550, 300], [560, 300, 550, 300], [90, 240, 60, 210]]) {
    const g = game();
    Object.assign(g.player, { x: px, y: py });
    Object.assign(g.puck, { x, y });
    g.startSpinStrike(g.player);
    for (let i = 0; i < 30; i++) g.updateSpinStrike(g.player, 1 / 60);
    assert.equal(g.puck.vx, 0);
    assert.equal(g.puck.vy, 0);
    assert.equal(g.running(), false);
    assert.equal(g.startSpinStrike(g.player), false);
  }
});

test('one impact per sweep, no puck teleport, and reset clears the action', () => {
  const g = game();
  Object.assign(g.puck, { x: 595, y: 300 });
  g.startSpinStrike(g.player);
  g.updateSpinStrike(g.player, 1 / 60);
  assert.equal(g.puck.x, 595);
  assert.equal(g.puck.y, 300);
  g.puck.vx = 3;
  for (let i = 0; i < 10; i++) g.updateSpinStrike(g.player, 1 / 60);
  assert.equal(g.puck.vx, 3);
  g.resetPositions();
  assert.equal(g.player.spin, null);
  assert.equal(g.player.shootCooldown, 0);
});

test('space is edge triggered, respects pause and resets on window blur', () => {
  const g = game();
  const key = (repeat = false) => ({ key: ' ', repeat, preventDefault() {} });
  g.events.keydown(key());
  g.updatePlayer();
  assert.ok(g.player.spin);
  for (let i = 0; i < 90; i++) {
    g.events.keydown(key(true));
    g.updatePlayer();
  }
  assert.equal(g.player.spin, null);
  g.events.blur();
  g.pause(true);
  g.events.keydown(key());
  g.tick(16);
  assert.equal(g.player.spin, null);
  g.events.blur();
  g.pause(false);
  g.events.keydown(key());
  g.events.blur();
  g.updatePlayer();
  assert.equal(g.player.spin, null);
});

test('AI uses the shared sweep in each attack tactic, defence and interception', () => {
  for (const [state, tactic, mode] of [
    ['ATTACK', 'STRAIGHT', 'shot'], ['ATTACK', 'FLANK', 'flank'],
    ['ATTACK', 'SNIPER', 'sniper'], ['ATTACK', 'ZIGZAG', 'zigzag'],
    ['ATTACK', 'FEINT', 'feint'], ['DEFEND_OWN_GOAL', 'STRAIGHT', 'clear'],
    ['INTERCEPT', 'STRAIGHT', 'steal']
  ]) {
    const g = game();
    Object.assign(g.player, { x: 800, y: 80 });
    Object.assign(g.puck, { x: 500, y: 300 });
    Object.assign(g.cpu, { state, tactic, tacticTimer: 40, angle: 0, zigzagPhase: 1 });
    const plan = g.getCPUSpinPlan();
    assert.equal(plan.mode, mode);
    Object.assign(g.cpu, { x: 500 - Math.cos(plan.aimAngle) * 45, y: 300 - Math.sin(plan.aimAngle) * 45 });
    g.tryCPUSpinStrike();
    assert.ok(g.cpu.spin, `${state}/${tactic} should start a sweep`);
    for (let i = 0; i < 30; i++) g.updateSpinStrike(g.cpu, 1 / 60);
    assert.ok(Math.abs(Math.hypot(g.puck.vx, g.puck.vy) - plan.power) < 1e-7, `${state}/${tactic} hit power`);
  }
});

test('AI can complete a circular strike during its normal update loop', () => {
  const g = game();
  Object.assign(g.player, { x: 800, y: 80 });
  Object.assign(g.cpu, { x: 542, y: 300, angle: Math.PI, tactic: 'STRAIGHT', tacticDuration: 1000 });
  Object.assign(g.puck, { x: 500, y: 300 });
  g.updateCPU();
  assert.ok(g.cpu.spin);
  assert.ok(Math.hypot(g.puck.vx, g.puck.vy) >= 15);
  for (let i = 0; i < 35; i++) { g.updateCPU(); g.updatePuck(); }
  assert.equal(g.cpu.spin, null);
  assert.ok(Number.isFinite(g.cpu.x) && Number.isFinite(g.puck.x));
});
