const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = process.env.DHAMANA_DATA_DIR || path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'store.json');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(String(password), salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function makeAdmin() {
  return {
    id: 'admin-001',
    email: 'admin@dhamana.local',
    displayName: 'Admin',
    passwordHash: hashPassword(process.env.ADMIN_PASSWORD || 'admin123456'),
    role: 'admin',
    createdAt: new Date().toISOString()
  };
}

function makeDefaultStore() {
  const now = new Date().toISOString();
  return {
    users: [makeAdmin()],
    sessions: [],
    offers: [
      { id: 'seed-1', userId: 'admin-001', title: 'بيع USDT بسرعة', asset: 'USDT', quantity: 500, price: 3.72, paymentMethod: 'bank_transfer', status: 'open', createdAt: now },
      { id: 'seed-2', userId: 'admin-001', title: 'شراء BNB مع ضمان', asset: 'BNB', quantity: 2.4, price: 2.86, paymentMethod: 'wallet', status: 'open', createdAt: now }
    ]
  };
}

function writeStore(store) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${dataFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, dataFile); // atomic: a crash can't leave a half-written file
}

function readStore() {
  if (!fs.existsSync(dataFile)) {
    const fresh = makeDefaultStore();
    writeStore(fresh);
    return fresh;
  }
  let store;
  try {
    store = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch (error) {
    // keep the broken file instead of silently destroying user data
    fs.renameSync(dataFile, `${dataFile}.corrupt-${Date.now()}`);
    store = makeDefaultStore();
    writeStore(store);
    return store;
  }
  store.users ||= [];
  store.sessions ||= [];
  store.offers ||= [];
  if (!store.users.some((u) => u.role === 'admin')) {
    store.users.push(makeAdmin()); // repairs stores that were created without the admin
    writeStore(store);
  }
  return store;
}

module.exports = { readStore, writeStore, hashPassword, verifyPassword };
