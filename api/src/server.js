const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { readStore, writeStore } = require('./store');

const app = express();
const DEFAULT_PORT = 4000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role || 'user',
    createdAt: user.createdAt
  };
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const store = readStore();
  const session = store.sessions.find((item) => item.token === token);
  if (!session) {
    return res.status(401).json({ error: 'Session expired or invalid.' });
  }

  const user = store.users.find((item) => item.id === session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found.' });
  }

  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'dhamana-api', timestamp: new Date().toISOString() });
});

app.post('/api/auth/register', async (req, res) => {
  const { email, displayName, password } = req.body || {};

  if (!email || !displayName || !password) {
    return res.status(400).json({ error: 'Email, display name, and password are required.' });
  }

  if (String(password).length < 10) {
    return res.status(400).json({ error: 'Password must be at least 10 characters.' });
  }

  const store = readStore();
  const emailLower = String(email).trim().toLowerCase();
  const existing = store.users.find((user) => user.email.toLowerCase() === emailLower);

  if (existing) {
    return res.status(409).json({ error: 'Account already exists.' });
  }

  const user = {
    id: crypto.randomUUID(),
    email: emailLower,
    displayName: String(displayName).trim(),
    password: String(password),
    role: 'user',
    createdAt: new Date().toISOString()
  };

  store.users.push(user);
  const token = crypto.randomBytes(24).toString('hex');
  store.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
  writeStore(store);

  res.status(201).json({
    token,
    user: sanitizeUser(user)
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const store = readStore();
  const user = store.users.find((item) => item.email.toLowerCase() === String(email).trim().toLowerCase());

  if (!user || user.password !== String(password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  store.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
  writeStore(store);

  res.json({
    token,
    user: sanitizeUser(user)
  });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

app.get('/api/offers', async (req, res) => {
  const store = readStore();
  const active = [...store.offers]
    .filter((offer) => offer.status === 'open')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ items: active, total: active.length });
});

app.get('/api/my/offers', requireAuth, async (req, res) => {
  const store = readStore();
  const myOffers = [...store.offers]
    .filter((offer) => offer.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ items: myOffers, total: myOffers.length });
});

app.post('/api/offers', requireAuth, async (req, res) => {
  const { title, asset, quantity, price, paymentMethod } = req.body || {};

  if (!title || !asset || !price || !paymentMethod) {
    return res.status(400).json({ error: 'Offer title, asset, price, and payment method are required.' });
  }

  const store = readStore();
  const offer = {
    id: Date.now(),
    userId: req.user.id,
    title: String(title).trim(),
    asset: String(asset).trim(),
    quantity: Number(quantity || 1),
    price: Number(price),
    paymentMethod: String(paymentMethod),
    status: 'open',
    createdAt: new Date().toISOString()
  };

  store.offers.push(offer);
  writeStore(store);

  res.status(201).json({ item: offer });
});

app.patch('/api/offers/:id/close', requireAuth, async (req, res) => {
  const { id } = req.params;
  const store = readStore();
  const offer = store.offers.find((item) => String(item.id) === String(id));

  if (!offer) {
    return res.status(404).json({ error: 'Offer not found.' });
  }

  if (offer.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You cannot close this offer.' });
  }

  offer.status = 'closed';
  writeStore(store);

  res.json({ ok: true, item: offer });
});

app.get('/api/admin/overview', requireAuth, requireAdmin, async (req, res) => {
  const store = readStore();
  res.json({
    totalUsers: store.users.length,
    totalOffers: store.offers.length,
    openOffers: store.offers.filter((offer) => offer.status === 'open').length,
    closedOffers: store.offers.filter((offer) => offer.status === 'closed').length
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

const port = Number(process.env.PORT) || DEFAULT_PORT;
app.listen(port, () => {
  console.log(`Dhamana API running on http://localhost:${port}`);
});
