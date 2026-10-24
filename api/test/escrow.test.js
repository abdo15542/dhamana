const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
process.env.DHAMANA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dhamana-esc-'));
const app = require('../src/server');
let server, base;
const call = async (m, u, b, t) => { const r = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, data: await r.json() }; };
const reg = async (e) => (await call('POST', '/api/auth/register', { email: e, displayName: e.split('@')[0], password: 'password1234' })).data.token;
let admin, seller, buyer, other;
const bal = async (t, a = 'USDT') => (await call('GET', '/api/wallet', null, t)).data.balances[a] || 0;
const newTrade = async (qty) => {
  const o = await call('POST', '/api/offers', { title: 's', asset: 'USDT', quantity: 100, price: 2, paymentMethod: 'wallet' }, seller);
  return (await call('POST', `/api/offers/${o.data.item.id}/trades`, { quantity: qty }, buyer)).data.item;
};
before(async () => {
  server = app.listen(0); base = `http://127.0.0.1:${server.address().port}`;
  admin = (await call('POST', '/api/auth/login', { email: 'admin@dhamana.local', password: 'admin123456' })).data.token;
  [seller, buyer, other] = [await reg('seller@x.com'), await reg('buyer@x.com'), await reg('other@x.com')];
  await call('POST', '/api/admin/credit', { email: 'seller@x.com', asset: 'USDT', amount: 300 }, admin);
});
after(() => server.close());

test('cannot lock more than seller balance; cannot trade own offer', async () => {
  const o = (await call('POST', '/api/offers', { title: 's', asset: 'USDT', quantity: 1000, price: 2, paymentMethod: 'wallet' }, seller)).data.item;
  assert.equal((await call('POST', `/api/offers/${o.id}/trades`, { quantity: 500 }, buyer)).status, 400);
  assert.equal((await call('POST', `/api/offers/${o.id}/trades`, { quantity: 1 }, seller)).status, 400);
});
test('happy path: lock -> paid -> confirm releases minus 1% fee', async () => {
  const before = await bal(seller);
  const t = await newTrade(100);
  assert.equal(await bal(seller), before - 100);                       // locked in escrow
  assert.equal((await call('POST', `/api/trades/${t.id}/confirm`, null, seller)).status, 409); // not paid yet
  assert.equal((await call('POST', `/api/trades/${t.id}/paid`, {}, other)).status, 403);        // outsider
  assert.equal((await call('POST', `/api/trades/${t.id}/paid`, { note: 'ref 123' }, buyer)).status, 200);
  assert.equal((await call('POST', `/api/trades/${t.id}/confirm`, null, buyer)).status, 403);   // buyer can't self-confirm
  const done = await call('POST', `/api/trades/${t.id}/confirm`, null, seller);
  assert.equal(done.data.item.status, 'completed');
  assert.equal(await bal(buyer), 99); assert.equal(await bal(admin), 1);
  assert.equal((await call('POST', `/api/trades/${t.id}/rate`, { score: 5 }, buyer)).status, 200);
  assert.equal((await call('POST', `/api/trades/${t.id}/rate`, { score: 5 }, buyer)).status, 409);
  const rep = (await call('GET', `/api/users/${(await call('GET', '/api/auth/me', null, seller)).data.user.id}/reputation`)).data;
  assert.equal(rep.completedTrades, 1);
});
test('cancel refunds seller and restores the offer', async () => {
  const before = await bal(seller);
  const t = await newTrade(50);
  assert.equal((await call('POST', `/api/trades/${t.id}/cancel`, null, buyer)).data.item.status, 'cancelled');
  assert.equal(await bal(seller), before);
});
test('dispute -> admin refund returns funds to seller; release pays buyer', async () => {
  const s0 = await bal(seller); const t = await newTrade(40);
  await call('POST', `/api/trades/${t.id}/paid`, {}, buyer);
  assert.equal((await call('POST', `/api/trades/${t.id}/dispute`, {}, seller)).status, 400);
  assert.equal((await call('POST', `/api/trades/${t.id}/dispute`, { reason: 'no payment received' }, seller)).status, 200);
  assert.equal((await call('POST', `/api/admin/trades/${t.id}/resolve`, { outcome: 'refund' }, buyer)).status, 403);
  assert.equal((await call('POST', `/api/admin/trades/${t.id}/resolve`, { outcome: 'refund' }, admin)).data.item.status, 'refunded');
  assert.equal(await bal(seller), s0);
  const b0 = await bal(buyer); const t2 = await newTrade(40);
  await call('POST', `/api/trades/${t2.id}/paid`, {}, buyer); await call('POST', `/api/trades/${t2.id}/dispute`, { reason: 'paid' }, buyer);
  await call('POST', `/api/admin/trades/${t2.id}/resolve`, { outcome: 'release' }, admin);
  assert.equal(await bal(buyer), b0 + 39.6);
});
test('ledger always balances: total of all wallets equals credited funds', async () => {
  const sum = (await Promise.all([seller, buyer, admin].map((t) => bal(t)))).reduce((a, b) => a + b, 0);
  const locked = JSON.parse(fs.readFileSync(path.join(process.env.DHAMANA_DATA_DIR, 'store.json'))).trades.filter((t) => ['awaiting_payment', 'paid', 'disputed'].includes(t.status)).reduce((a, t) => a + t.quantity, 0);
  assert.equal(Math.round((sum + locked) * 1e6) / 1e6, 300);
});
