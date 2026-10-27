import { randomInt } from 'node:crypto';
import * as E from './_lib/engine.js';
import * as S from './_lib/store.js';
const CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => CH[randomInt(CH.length)]).join('');

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const now = Date.now();
    if (b.action === 'create') {
      let code; do code = newCode(); while (await S.load(code));
      const { s, token } = E.createRoom(code, b.name, b.settings, now);
      await S.save(s);
      return res.json({ code, token, view: E.view(s, 0, now) });
    }
    const code = String(b.code || '').toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('Invalid room code');
    await S.lock(code);
    try {
      const s = await S.load(code);
      if (!s) throw new Error('Room not found');
      let token = b.token, i;
      if (b.action === 'join') { token = E.join(s, b.name); i = 1; }
      else {
        i = E.seat(s, b.token); // identity comes from the secret token, never from a client claim
        E.tick(s, now);         // lazy server-side timeout enforcement
        if (b.action === 'choose') E.chooseInnings(s, i, b.pick, now);
        else if (b.action === 'submit') E.submit(s, i, b.ball, b.n, now);
        else if (b.action === 'rematch') E.rematch(s, i);
        else if (b.action !== 'state') throw new Error('Unknown action');
      }
      await S.save(s);
      return res.json({ code, token, view: E.view(s, i, now) });
    } finally { await S.unlock(code); }
  } catch (e) { res.status(400).json({ error: e.message }); }
}
