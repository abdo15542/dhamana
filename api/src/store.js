const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'store.json');

const defaultStore = {
  users: [
    {
      id: 'admin-001',
      email: 'admin@dhamana.local',
      displayName: 'Admin',
      password: 'admin123456',
      role: 'admin',
      createdAt: new Date().toISOString()
    }
  ],
  sessions: [],
  offers: [
    {
      id: 1,
      userId: 'admin-001',
      title: 'بيع USDT بسرعة',
      asset: 'USDT',
      quantity: 500,
      price: 3.72,
      paymentMethod: 'bank_transfer',
      status: 'open',
      createdAt: new Date().toISOString()
    },
    {
      id: 2,
      userId: 'admin-001',
      title: 'شراء BNB مع ضمان',
      asset: 'BNB',
      quantity: 2.4,
      price: 2.86,
      paymentMethod: 'wallet',
      status: 'open',
      createdAt: new Date().toISOString()
    }
  ]
};

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(defaultStore, null, 2));
  }
}

function readStore() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    fs.writeFileSync(dataFile, JSON.stringify(defaultStore, null, 2));
    return structuredClone(defaultStore);
  }
}

function writeStore(store) {
  ensureDataFile();
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
}

module.exports = { readStore, writeStore, defaultStore };
