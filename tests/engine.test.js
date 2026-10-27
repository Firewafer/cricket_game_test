import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../api/_lib/engine.js';
const T = 1e6;
function setup(set = { overs: 1, wickets: 2 }) {
  const { s } = E.createRoom('ABCDEF', 'A', set, T); E.join(s, 'B');
  s.tossWinner = 0; E.chooseInnings(s, 0, 'bat', T); return s;
}
function play(s, bat, bowl) {
  const b = s.innings[s.inn - 1].batter;
  E.submit(s, b, s.ballNo, bat, T); E.submit(s, 1 - b, s.ballNo, bowl, T);
}
const rep = (n, f) => { for (let i = 0; i < n; i++) f(); };

test('different numbers score batsman number', () => { const s = setup(); play(s, 6, 2); assert.equal(s.innings[0].runs, 6); assert.equal(s.innings[0].wkts, 0); });
test('matching numbers = wicket, zero runs (incl. 0 v 0)', () => {
  const s = setup(); play(s, 3, 3); assert.equal(s.innings[0].wkts, 1); assert.equal(s.innings[0].runs, 0);
  play(s, 0, 0); assert.equal(s.inn, 2); assert.equal(s.innings[1].target, 1);
});
test('0 vs other is a dot ball, no wicket', () => { const s = setup(); play(s, 0, 5); assert.equal(s.innings[0].wkts, 0); assert.equal(s.innings[0].balls, 1); });
test('bowler timeout: zero runs, no wicket, ball counts', () => {
  const s = setup(); const b = s.innings[0].batter;
  E.submit(s, b, s.ballNo, 6, T); E.tick(s, T + 16000);
  const h = s.history[0]; assert.deepEqual([h.runs, h.out, h.timeout, s.innings[0].balls], [0, false, true, 1]);
});
test('over display from integer balls', () => assert.equal(E.overs(7), '1.1'));
test('chase win reports wickets remaining', () => {
  const s = setup(); rep(6, () => play(s, 2, 1));
  assert.equal(s.innings[1].target, 13);
  play(s, 6, 1); play(s, 6, 1); play(s, 1, 2);
  assert.equal(s.status, 'done'); assert.equal(s.result.winner, 1); assert.equal(s.result.margin, '2 wickets');
});
test('tie detected', () => {
  const s = setup(); rep(6, () => play(s, 2, 1)); play(s, 6, 1); play(s, 6, 1); rep(4, () => play(s, 0, 1));
  assert.equal(s.status, 'done'); assert.equal(s.result.tie, true);
});
test('defender wins by runs', () => {
  const s = setup(); rep(6, () => play(s, 2, 1)); rep(6, () => play(s, 0, 1));
  assert.equal(s.result.winner, 0); assert.equal(s.result.margin, '12 runs');
});
test('only toss winner chooses', () => {
  const { s } = E.createRoom('ABCDEF', 'A', {}, T); E.join(s, 'B'); s.tossWinner = 0;
  assert.throws(() => E.chooseInnings(s, 1, 'bat', T), /toss winner/);
});
test('stale, duplicate and invalid submissions rejected', () => {
  const s = setup(); const b = s.innings[0].batter;
  assert.throws(() => E.submit(s, b, 99, 1, T), /Stale/);
  assert.throws(() => E.submit(s, b, s.ballNo, 7, T), /0 to 6/);
  E.submit(s, b, s.ballNo, 1, T);
  assert.throws(() => E.submit(s, b, s.ballNo, 2, T), /Already/);
});
test('opponent selection stays hidden', () => {
  const s = setup(); const b = s.innings[0].batter; E.submit(s, b, s.ballNo, 5, T);
  const v = E.view(s, 1 - b, T); assert.equal(v.oppLocked, true); assert.equal(v.mine, null);
  assert.ok(!('pending' in v)); assert.ok(!JSON.stringify(v).includes(s.players[0].secret));
});
test('third player rejected; no ball after match ends', () => {
  const s = setup(); assert.throws(() => E.join(s, 'C'), /full/);
  rep(6, () => play(s, 2, 1)); rep(6, () => play(s, 0, 1));
  assert.throws(() => E.submit(s, 0, s.ballNo, 1, T), /No ball/);
});
test('rematch needs both players', () => {
  const s = setup(); rep(6, () => play(s, 2, 1)); rep(6, () => play(s, 0, 1));
  E.rematch(s, 0); assert.equal(s.status, 'done'); E.rematch(s, 1); assert.equal(s.status, 'toss');
});
