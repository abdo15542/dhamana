const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path'); const { execFileSync } = require('child_process');
process.env.DHAMANA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dhamana-acc-'));
const app = require('../src/server');
let server, base;
const call = async (m, u, b, t) => { const r = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, data: await r.json() }; };
before(() => { server = app.listen(0); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());

test('password change: needs current password, signs out other devices, new password works', async () => {
  const a = (await call('POST', '/api/auth/login', { email: 'admin@dhamana.local', password: 'admin123456' })).data.token;
  const other = (await call('POST', '/api/auth/login', { email: 'admin@dhamana.local', password: 'admin123456' })).data.token;
  assert.equal((await call('POST', '/api/auth/password', { currentPassword: 'wrong-password', newPassword: 'NewStrongPass123' }, a)).status, 401);
  assert.equal((await call('POST', '/api/auth/password', { currentPassword: 'admin123456', newPassword: 'short' }, a)).status, 400);
  assert.equal((await call('POST', '/api/auth/password', { currentPassword: 'admin123456', newPassword: 'NewStrongPass123' }, a)).status, 200);
  assert.equal((await call('GET', '/api/auth/me', null, a)).status, 200);      // current session stays
  assert.equal((await call('GET', '/api/auth/me', null, other)).status, 401);  // other device signed out
  assert.equal((await call('POST', '/api/auth/login', { email: 'admin@dhamana.local', password: 'admin123456' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { email: 'admin@dhamana.local', password: 'NewStrongPass123' })).status, 200);
});
test('backup script writes a valid copy and keeps only the newest N', () => {
  const env = { ...process.env, BACKUP_KEEP: '2' };
  for (let i = 0; i < 3; i += 1) execFileSync('node', [path.join(__dirname, '..', 'scripts', 'backup.js')], { env });
  const dir = path.join(process.env.DHAMANA_DATA_DIR, 'backups'); const files = fs.readdirSync(dir);
  assert.equal(files.length, 2); JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
});
