const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
process.env.DHAMANA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dhamana-not-'));
const app = require('../src/server');
let server, base;
const call = async (m, u, b, t) => { const r = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, data: await r.json() }; };
const reg = async (e) => (await call('POST', '/api/auth/register', { email: e, displayName: e.split('@')[0] + '-user', password: 'password1234' })).data.token;
before(() => { server = app.listen(0); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());

test('users are notified of trade events, privately, and can mark them read', async () => {
  const admin = (await call('POST', '/api/auth/login', { email: 'admin@dhamana.local', password: 'admin123456' })).data.token;
  const [seller, buyer, other] = [await reg('s@x.com'), await reg('b@x.com'), await reg('o@x.com')];
  await call('POST', '/api/admin/credit', { email: 's@x.com', asset: 'USDT', amount: 100 }, admin);
  const o = (await call('POST', '/api/offers', { title: 't', asset: 'USDT', quantity: 100, price: 2, paymentMethod: 'wallet' }, seller)).data.item;
  const t = (await call('POST', `/api/offers/${o.id}/trades`, { quantity: 10 }, buyer)).data.item;
  assert.equal((await call('GET', '/api/notifications', null, seller)).data.unread, 1);
  await call('POST', `/api/trades/${t.id}/paid`, {}, buyer);
  await call('POST', `/api/trades/${t.id}/messages`, { text: 'hi' }, buyer);
  assert.equal((await call('GET', '/api/notifications', null, seller)).data.unread, 3);
  await call('POST', `/api/trades/${t.id}/confirm`, null, seller);
  const b = (await call('GET', '/api/notifications', null, buyer)).data;
  assert.ok(b.items[0].text.includes('اكتملت'));
  assert.equal((await call('GET', '/api/notifications', null, other)).data.items.length, 0);
  await call('POST', '/api/notifications/read', null, seller);
  assert.equal((await call('GET', '/api/notifications', null, seller)).data.unread, 0);
  assert.equal((await call('GET', '/api/notifications')).status, 401);
});
