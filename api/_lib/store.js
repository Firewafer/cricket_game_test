// Upstash Redis over REST (works in serverless). Falls back to in-memory for local dev.
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const mem = (globalThis.__hc ??= new Map());
async function cmd(...a) {
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(a) });
  const j = await r.json();
  if (j.error) throw new Error('Store error');
  return j.result;
}
export async function load(code) {
  const v = URL_ ? await cmd('GET', 'room:' + code) : mem.get('room:' + code);
  return v ? JSON.parse(v) : null;
}
export async function save(s) {
  const v = JSON.stringify(s);
  if (URL_) await cmd('SET', 'room:' + s.code, v, 'EX', 86400); else mem.set('room:' + s.code, v);
}
export async function lock(code) {
  for (let i = 0; i < 30; i++) {
    if (URL_) { if (await cmd('SET', 'lock:' + code, '1', 'NX', 'PX', 3000)) return; }
    else if (!mem.has('lock:' + code)) { mem.set('lock:' + code, 1); return; }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Server busy, try again');
}
export async function unlock(code) { if (URL_) await cmd('DEL', 'lock:' + code); else mem.delete('lock:' + code); }
