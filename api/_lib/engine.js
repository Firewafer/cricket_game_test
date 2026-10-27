// Pure, authoritative game engine. State is plain JSON so it can live in Redis.
import { randomInt, randomBytes } from 'node:crypto';
const OPTS = { overs: [1, 2, 5, 10, 20], wickets: [1, 2, 3, 5], timer: [5, 10, 15, 20, 30] };
const DEFAULTS = { overs: 2, wickets: 2, timer: 15 };
export const overs = (b) => `${Math.floor(b / 6)}.${b % 6}`;
const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const tok = () => randomBytes(16).toString('hex');

export function cleanSettings(x = {}) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(OPTS)) if (x[k] !== undefined) {
    if (!OPTS[k].includes(Number(x[k]))) throw new Error(`Invalid ${k}`);
    o[k] = Number(x[k]);
  }
  return o;
}
export function cleanName(n) {
  n = String(n ?? '').trim().slice(0, 20);
  if (!n) throw new Error('Display name required');
  return n;
}
function reset(s) { Object.assign(s, { pending: {}, history: [], innings: [], inn: 0, ballNo: 0, deadline: null, result: null, rematch: [false, false] }); }
function startToss(s) { s.status = 'toss'; s.coin = randomInt(2) ? 'heads' : 'tails'; s.tossWinner = randomInt(2); }

export function createRoom(code, name, settings, now) {
  const token = tok();
  const s = { code, status: 'waiting', createdAt: now, settings: cleanSettings(settings),
    players: [{ name: cleanName(name), secret: token }], tossWinner: null, coin: null };
  reset(s);
  return { s, token };
}
export function join(s, name) {
  if (s.status !== 'waiting' || s.players.length >= 2) throw new Error('Room is full');
  const player = { name: cleanName(name), secret: tok() };
  s.players.push(player);
  startToss(s);
  return player.secret;
}
export function seat(s, token) {
  const i = s.players.findIndex((p) => p.secret === token);
  if (i < 0) throw new Error('Not in this room');
  return i;
}
function newBall(s, now) { s.ballNo += 1; s.pending = {}; s.deadline = now + s.settings.timer * 1000; }
function startInnings(s, batter, now) {
  const n = s.innings.length + 1;
  s.innings.push({ batter, runs: 0, wkts: 0, balls: 0, target: n === 2 ? s.innings[0].runs + 1 : null });
  s.inn = n; s.status = 'playing'; newBall(s, now);
}
export function chooseInnings(s, i, pick, now) {
  if (s.status !== 'toss') throw new Error('Not time to choose');
  if (i !== s.tossWinner) throw new Error('Only the toss winner can choose');
  if (!['bat', 'bowl'].includes(pick)) throw new Error('Choose bat or bowl');
  startInnings(s, pick === 'bat' ? i : 1 - i, now);
}
export function tick(s, now) { if (s.status === 'playing' && now >= s.deadline) resolve(s, now); }
export function submit(s, i, ballNo, n, now) {
  tick(s, now);
  if (s.status !== 'playing') throw new Error('No ball in play');
  if (ballNo !== s.ballNo) throw new Error('Stale ball');
  if (!Number.isInteger(n) || n < 0 || n > 6) throw new Error('Pick a number from 0 to 6');
  if (i in s.pending) throw new Error('Already locked in');
  s.pending[i] = n;
  if (Object.keys(s.pending).length === 2) resolve(s, now);
}
function resolve(s, now) {
  const inn = s.innings[s.inn - 1], b = inn.batter;
  const bat = s.pending[b] ?? null, bowl = s.pending[1 - b] ?? null;
  const timeout = bat === null || bowl === null;
  const out = !timeout && bat === bowl;
  const runs = timeout || out ? 0 : bat;
  inn.balls++; inn.runs += runs; if (out) inn.wkts++;
  s.history.push({ inn: s.inn, ball: inn.balls, batter: b, bat, bowl, runs, out, timeout, at: now });
  const done = inn.balls >= s.settings.overs * 6 || inn.wkts >= s.settings.wickets || (s.inn === 2 && inn.runs >= inn.target);
  if (!done) return newBall(s, now);
  if (s.inn === 1) return startInnings(s, 1 - b, now);
  finish(s, now);
}
function finish(s, now) {
  const [a, c] = s.innings;
  let winner = null, margin = 'Scores level';
  if (c.runs >= c.target) { winner = c.batter; margin = pl(s.settings.wickets - c.wkts, 'wicket'); }
  else if (c.runs < a.runs) { winner = a.batter; margin = pl(a.runs - c.runs, 'run'); }
  s.status = 'done'; s.deadline = null; s.pending = {};
  s.result = { winner, tie: winner === null, margin, at: now };
}
export function rematch(s, i) {
  if (s.status !== 'done') throw new Error('Match not finished');
  s.rematch[i] = true;
  if (s.rematch[0] && s.rematch[1]) { reset(s); startToss(s); }
}
// Per-player snapshot: never includes the opponent's pending number or any secrets.
export function view(s, i, now) {
  return { code: s.code, status: s.status, settings: s.settings, me: i, players: s.players.map((p) => ({ name: p.name })),
    tossWinner: s.tossWinner, coin: s.coin, inn: s.inn, innings: s.innings, history: s.history, ballNo: s.ballNo,
    deadline: s.deadline, serverNow: now, mine: s.pending[i] ?? null, oppLocked: (1 - i) in s.pending,
    result: s.result, rematch: s.rematch };
}
