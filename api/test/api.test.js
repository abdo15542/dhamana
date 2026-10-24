const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DHAMANA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dhamana-'));
const app = require('../src/server');

let server, base, token;
const call = async (method, url, body, tok) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json() };
};
const goodOffer = { title: 'x', asset: 'usdt', quantity: 10, price: 3.5, paymentMethod: 'wallet' };

before(async () => { server = app.listen(0); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());

test('health', async () => assert.equal((await call('GET', '/health')).data.ok, true));
test('seeded admin can log in (README credentials)', async () => {
  const r = await call('POST', '/api/auth/login', { email: 'admin@dhamana.local', password: 'admin123456' });
  assert.equal(r.status, 200); assert.equal(r.data.user.role, 'admin');
  assert.equal((await call('GET', '/api/admin/overview', null, r.data.token)).status, 200);
});
test('register validates input and rejects duplicates', async () => {
  assert.equal((await call('POST', '/api/auth/register', { email: 'bad', displayName: 'Ab', password: '1234567890' })).status, 400);
  assert.equal((await call('POST', '/api/auth/register', { email: 'a@b.com', displayName: 'Ab', password: 'short' })).status, 400);
  const ok = await call('POST', '/api/auth/register', { email: 'a@b.com', displayName: 'Ab', password: 'password1234' });
  assert.equal(ok.status, 201); token = ok.data.token;
  assert.equal((await call('POST', '/api/auth/register', { email: 'A@B.com', displayName: 'Ab', password: 'password1234' })).status, 409);
});
test('passwords are stored hashed', () => {
  const store = JSON.parse(fs.readFileSync(path.join(process.env.DHAMANA_DATA_DIR, 'store.json'), 'utf8'));
  assert.ok(store.users.every((u) => u.passwordHash && !u.password));
});
test('wrong password rejected; /me works; logout invalidates token', async () => {
  assert.equal((await call('POST', '/api/auth/login', { email: 'a@b.com', password: 'wrongpassword' })).status, 401);
  assert.equal((await call('GET', '/api/auth/me', null, token)).status, 200);
  const l = await call('POST', '/api/auth/login', { email: 'a@b.com', password: 'password1234' });
  assert.equal((await call('POST', '/api/auth/logout', null, l.data.token)).status, 200);
  assert.equal((await call('GET', '/api/auth/me', null, l.data.token)).status, 401);
});
test('offers: create, list, vendor name, close permissions', async () => {
  assert.equal((await call('POST', '/api/offers', goodOffer)).status, 401);
  const c = await call('POST', '/api/offers', goodOffer, token);
  assert.equal(c.status, 201); assert.equal(c.data.item.asset, 'USDT');
  const pub = await call('GET', '/api/offers');
  assert.ok(pub.data.items.some((o) => o.id === c.data.item.id && o.vendor === 'Ab'));
  const other = await call('POST', '/api/auth/register', { email: 'c@d.com', displayName: 'Cd', password: 'password1234' });
  assert.equal((await call('PATCH', `/api/offers/${c.data.item.id}/close`, null, other.data.token)).status, 403);
  assert.equal((await call('PATCH', `/api/offers/${c.data.item.id}/close`, null, token)).status, 200);
  assert.ok(!(await call('GET', '/api/offers')).data.items.some((o) => o.id === c.data.item.id));
  assert.equal((await call('PATCH', '/api/offers/nope/close', null, token)).status, 404);
});
test('offers: invalid values rejected', async () => {
  for (const bad of [{ price: -1 }, { price: 'zzz' }, { quantity: -5 }, { quantity: 'abc' }, { asset: '<b>' }, { paymentMethod: '<img src=x onerror=alert(1)>' }, { title: ' ' }]) {
    assert.equal((await call('POST', '/api/offers', { ...goodOffer, ...bad }, token)).status, 400, JSON.stringify(bad));
  }
});
test('non-admin blocked from admin route; malformed JSON gives JSON 400', async () => {
  assert.equal((await call('GET', '/api/admin/overview', null, token)).status, 403);
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
  assert.equal(res.status, 400); assert.ok((await res.json()).error);
});
test('API serves the web app and security headers', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200); assert.match(await res.text(), /ضمانة/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
});
test('PWA assets: manifest valid, service worker not cached', async () => {
  const m = await (await fetch(base + '/manifest.webmanifest')).json();
  assert.equal(m.display, 'standalone'); assert.ok(m.icons.some((i) => i.sizes === '512x512'));
  assert.equal((await fetch(base + '/icon-512.png')).status, 200);
  assert.equal((await fetch(base + '/sw.js')).headers.get('cache-control'), 'no-cache');
});
