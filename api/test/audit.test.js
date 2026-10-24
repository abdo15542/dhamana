const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
process.env.DHAMANA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dhamana-aud-'));
const app = require('../src/server');
let server, base;
const call = async (m, u, b, t) => { const r = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, data: await r.json() }; };
before(() => { server = app.listen(0); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());

test('every admin money action is audited; audit is admin-only', async () => {
  const admin = (await call('POST', '/api/auth/login', { email: 'admin@dhamana.local', password: 'admin123456' })).data.token;
  const u = (await call('POST', '/api/auth/register', { email: 'a@x.com', displayName: 'user', password: 'password1234' })).data.token;
  await call('POST', '/api/admin/credit', { email: 'a@x.com', asset: 'USDT', amount: 40 }, admin);
  const d = (await call('POST', '/api/wallet/deposits', { asset: 'USDT', amount: 10, reference: 'REF-12345' }, u)).data.item;
  await call('POST', `/api/admin/requests/${d.id}/decide`, { decision: 'approve', note: 'seen on chain' }, admin);
  const w = (await call('POST', '/api/wallet/withdrawals', { asset: 'USDT', amount: 5, address: 'TAddr12345' }, u)).data.item;
  await call('POST', `/api/admin/requests/${w.id}/decide`, { decision: 'reject' }, admin);
  assert.equal((await call('GET', '/api/admin/audit', null, u)).status, 403);
  const a = (await call('GET', '/api/admin/audit', null, admin)).data;
  assert.deepEqual(a.items.map((x) => x.action).reverse(), ['balance_adjustment', 'deposit_approved', 'withdrawal_rejected']);
  assert.equal(a.items[0].adminEmail, 'admin@dhamana.local');
});
