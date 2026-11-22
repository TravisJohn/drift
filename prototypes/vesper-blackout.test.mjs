import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const file = readFileSync(new URL('./Vesper-Blackout.html', import.meta.url), 'utf8');
const simulation = file.match(/<script id="simulation">([\s\S]*?)<\/script>/)[1];
const D = Function(simulation + '\nreturn Deck;')();
const plans = new Map();
function inspectSocket(cell) {
  if (plans.has(cell.id)) return plans.get(cell.id);
  const scans = [],
    quantum = 0.125;
  for (let i = 0; i < 800; i++) {
    const time = i * quantum;
    const seen = D.guardsAt(time).some((g) => D.touches(g.cone, cell.x, cell.y));
    scans.push(seen);
  }
  const start = scans.findIndex(
    (v, i) => !v && i + 88 < scans.length && scans.slice(i, i + 88).every((b) => !b),
  );
  assert.ok(start >= 0, cell.id + ' has no sustained extraction window');
  assert.ok(scans.some(Boolean), cell.id + ' is never inspected');
  const plan = { safe: start * quantum, seen: scans.indexOf(true) * quantum };
  plans.set(cell.id, plan);
  return plan;
}
function atSocket(run, cell, t) {
  run.player.x = cell.x;
  run.player.y = cell.y;
  run.clock = t;
  run.guards = D.guardsAt(t);
}
function advance(run, n) {
  for (let i = 0; i < n; i++) run.step(1 / 60);
}
test('all 16 rooms and inspection paths have navigable geometry', () => {
  assert.equal(Object.keys(D.rooms).length, 16);
  assert.equal(D.halls.length, 26);
  const visited = new Set(['air']);
  for (const _ of Object.keys(D.rooms))
    for (const h of D.halls) {
      if (visited.has(h.a) || visited.has(h.b)) {
        visited.add(h.a);
        visited.add(h.b);
      }
    }
  assert.equal(visited.size, 16);
  for (const h of D.halls)
    for (let i = 1; i < h.points.length; i++) {
      const [x, y] = h.points[i - 1],
        [ex, ey] = h.points[i],
        n = Math.ceil(Math.hypot(ex - x, ey - y));
      for (let j = 0; j <= n; j++)
        assert.ok(D.fits(x + ((ex - x) * j) / n, y + ((ey - y) * j) / n), h.a + ' / ' + h.b);
    }
  for (const p of D.paths)
    for (const s of p.segments) {
      for (let j = 0; j <= s.dist; j += 1)
        assert.ok(D.fits(s.x + (s.dx * j) / s.dist, s.y + (s.dy * j) / s.dist));
    }
  assert.equal(D.floor(753, 250), false);
});
test('visible wedge catches hull contact and is blocked by the bulkhead', () => {
  const open = D.sight(92, 548, 0);
  assert.ok(D.touches(open, 133, 548));
  assert.ok(!D.touches(open, 81, 548));
  assert.ok(D.touches(open, 150, 548));
  assert.ok(!D.touches(open, 154, 548));
  const clipped = D.sight(95, 514, -Math.PI / 2);
  assert.ok(!D.touches(clipped, 95, 496));
});
test('holding one direction follows a slanted corridor in either direction', () => {
  const r = new D.Run();
  r.reset();
  r.detect = () => -1;
  const start = { x: 361.6, y: 432.5 };
  Object.assign(r.player, start);
  assert.equal(D.roomAt(start.x, start.y), undefined);
  for (let i = 0; i < 68; i++) r.step(1 / 60, 1, 0);
  assert.ok(r.player.x > start.x + 30);
  assert.ok(r.player.y > start.y + 20);
  assert.ok(D.fits(r.player.x, r.player.y));
  for (let i = 0; i < 68; i++) r.step(1 / 60, -1, 0);
  assert.ok(Math.hypot(r.player.x - start.x, r.player.y - start.y) < 1);
});
test('five seeds can stay active and expired seeds free up slots after 15 seconds', () => {
  const r = new D.Run();
  assert.equal(r.plantSeed(), false);
  r.reset();
  assert.ok(r.plantSeed());
  advance(r, 60);
  for (let i = 0; i < 4; i++) assert.ok(r.plantSeed());
  assert.equal(r.plantSeed(), false);
  advance(r, 839);
  assert.equal(r.seeds.length, 5);
  advance(r, 1);
  assert.equal(r.seeds.length, 4);
  assert.ok(r.plantSeed());
  advance(r, 60);
  assert.equal(r.seeds.length, 1);
});
test('a guard extinguishes a seed on contact, even without capturing the drone', () => {
  const r = new D.Run();
  r.reset();
  const dock = { ...r.player };
  r.plantSeed();
  const guard = D.guardsAt(0.5)[0];
  Object.assign(r.player, { x: guard.x, y: guard.y });
  r.plantSeed();
  Object.assign(r.player, dock);
  advance(r, 1);
  assert.equal(r.seeds.length, 2);
  advance(r, 30);
  assert.equal(r.seeds.length, 1);
  assert.equal(r.seeds[0].x, dock.x);
  assert.equal(r.mode, 'play');
  assert.ok(r.plantSeed());
});
test('all three sockets are watched and each allows a full ten-second extraction', () => {
  for (const c of D.cells) {
    const r = new D.Run();
    r.reset();
    atSocket(r, c, inspectSocket(c).safe);
    r.interact();
    advance(r, 599);
    assert.equal(r.taken.size, 0);
    advance(r, 1);
    assert.ok(r.taken.has(c.id));
    assert.equal(r.mode, 'play');
    r.interact();
    assert.equal(r.tap, null);
  }
});
test('leaving the socket cancels partial progress', () => {
  const c = D.cells[0],
    r = new D.Run();
  r.reset();
  atSocket(r, c, inspectSocket(c).safe);
  r.interact();
  advance(r, 120);
  assert.ok(r.progress > 1.9);
  r.player.x -= 12;
  r.step(1 / 60);
  assert.equal(r.progress, 0);
  assert.equal(r.tap, null);
});
test('capture outranks extraction, slightly accelerates patrols, then clears the run', () => {
  const c = D.cells[0],
    r = new D.Run();
  r.reset();
  r.taken.add('bank');
  r.plantSeed();
  atSocket(r, c, inspectSocket(c).seen);
  r.interact();
  r.progress = 9.999;
  r.step(1 / 60);
  assert.equal(r.mode, 'alarm');
  assert.equal(r.tap, null);
  assert.ok(!r.taken.has(c.id));
  const start = r.clock;
  r.step(0.1);
  assert.ok(Math.abs(r.clock - start - 0.12) < 1e-8);
  assert.equal(r.seeds.length, 1);
  advance(r, 140);
  assert.equal(r.mode, 'play');
  assert.equal(r.attempt, 2);
  assert.equal(r.taken.size, 0);
  assert.equal(r.seeds.length, 0);
  assert.ok(r.atDock);
});
test('two different cells must be brought back and unloaded', () => {
  const r = new D.Run();
  r.reset();
  r.interact();
  assert.equal(r.mode, 'play');
  for (const c of D.cells.slice(0, 2)) {
    atSocket(r, c, inspectSocket(c).safe);
    r.interact();
    advance(r, 600);
    if (r.taken.size === 1) {
      r.player.x = 100;
      r.player.y = 548;
      r.interact();
      assert.equal(r.mode, 'play');
    }
  }
  assert.equal(r.taken.size, 2);
  r.interact();
  assert.equal(r.mode, 'play');
  r.player.x = 100;
  r.player.y = 548;
  r.interact();
  assert.equal(r.mode, 'won');
});
