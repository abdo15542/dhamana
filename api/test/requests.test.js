const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
process.env.DHAMANA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dhamana-req-'));
const app = require('../src/server');
let server, base, admin, u1, u2;
const call = async (m, u, b, t) => { const r = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, data: await r.json() }; };
const reg = async (e) => (await call('POST', '/api/auth/register', { email: e, displayName: e.split('@')[0], password: 'password1234' })).data.token;
const bal = async (t) => (await call('GET', '/api/wallet', null, t)).data.balances.USDT || 0;
before(async () => { server = app.listen(0); base = `http://127.0.0.1:${server.address().port}`;
  admin = (await call('POST', '/api/auth/login', { email: 'admin@dhamana.local', password: 'admin123456' })).data.token; u1 = await reg('u1@x.com'); u2 = await reg('u2@x.com'); });
after(() => server.close());

test('deposit: pending does not credit; approve credits once; duplicate reference blocked', async () => {
  assert.equal((await call('POST', '/api/wallet/deposits', { asset: 'USDT', amount: -5, reference: 'abcde' }, u1)).status, 400);
  assert.equal((await call('POST', '/api/wallet/deposits', { asset: 'USDT', amount: 50, reference: 'x' }, u1)).status, 400);
  const d = (await call('POST', '/api/wallet/deposits', { asset: 'USDT', amount: 50, reference: 'TX-ABC-1' }, u1)).data.item;
  assert.equal(await bal(u1), 0);
  assert.equal((await call('POST', `/api/admin/requests/${d.id}/decide`, { decision: 'approve' }, u1)).status, 403);
  assert.equal((await call('POST', `/api/admin/requests/${d.id}/decide`, { decision: 'approve' }, admin)).status, 200);
  assert.equal(await bal(u1), 50);
  assert.equal((await call('POST', `/api/admin/requests/${d.id}/decide`, { decision: 'approve' }, admin)).status, 409);
  const dup = (await call('POST', '/api/wallet/deposits', { asset: 'USDT', amount: 50, reference: 'tx-abc-1' }, u2)).data.item;
  assert.equal((await call('POST', `/api/admin/requests/${dup.id}/decide`, { decision: 'approve' }, admin)).status, 409);
  assert.equal(await bal(u2), 0);
});
test('withdrawal: locks funds, reject refunds, approve completes; cannot overdraw', async () => {
  assert.equal((await call('POST', '/api/wallet/withdrawals', { asset: 'USDT', amount: 80, address: 'TAddress123' }, u1)).status, 400);
  const w = (await call('POST', '/api/wallet/withdrawals', { asset: 'USDT', amount: 30, address: 'TAddress123' }, u1)).data.item;
  assert.equal(await bal(u1), 20);
  await call('POST', `/api/admin/requests/${w.id}/decide`, { decision: 'reject', note: 'bad address' }, admin);
  assert.equal(await bal(u1), 50);
  const w2 = (await call('POST', '/api/wallet/withdrawals', { asset: 'USDT', amount: 30, address: 'TAddress123' }, u1)).data.item;
  const ok = await call('POST', `/api/admin/requests/${w2.id}/decide`, { decision: 'approve', note: 'txhash-999' }, admin);
  assert.equal(ok.data.item.status, 'approved'); assert.equal(await bal(u1), 20);
  assert.equal((await call('GET', '/api/wallet/requests', null, u1)).data.total, 3);
  assert.equal((await call('GET', '/api/admin/requests?status=pending', null, admin)).data.items.length, 1);
});
