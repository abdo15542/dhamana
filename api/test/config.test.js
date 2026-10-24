const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
process.env.DHAMANA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dhamana-cfg-'));
process.env.DEPOSIT_INFO = JSON.stringify({ USDT: 'TRC20: TTestAddress123' });
process.env.MAX_TRADE_TOTAL = '100';
const app = require('../src/server');
let server, base;
const call = async (m, u, b, t) => { const r = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, data: await r.json() }; };
before(() => { server = app.listen(0); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());

test('config exposes deposit info, fee and limit', async () => {
  const c = (await call('GET', '/api/config')).data;
  assert.equal(c.deposit.USDT, 'TRC20: TTestAddress123'); assert.equal(c.feeRate, 0.01); assert.equal(c.maxTradeTotal, 100);
});
test('trade value limit is enforced', async () => {
  const reg = async (e) => (await call('POST', '/api/auth/register', { email: e, displayName: 'user', password: 'password1234' })).data.token;
  const admin = (await call('POST', '/api/auth/login', { email: 'admin@dhamana.local', password: 'admin123456' })).data.token;
  const seller = await reg('s@x.com'); const buyer = await reg('b@x.com');
  await call('POST', '/api/admin/credit', { email: 's@x.com', asset: 'USDT', amount: 500 }, admin);
  const o = (await call('POST', '/api/offers', { title: 't', asset: 'USDT', quantity: 500, price: 2, paymentMethod: 'wallet' }, seller)).data.item;
  assert.equal((await call('POST', `/api/offers/${o.id}/trades`, { quantity: 60 }, buyer)).status, 400);  // 120 > 100
  assert.equal((await call('POST', `/api/offers/${o.id}/trades`, { quantity: 50 }, buyer)).status, 201);  // 100 ok
});
