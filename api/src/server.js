const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { readStore, writeStore, hashPassword, verifyPassword } = require('./store');

const app = express();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PAYMENT_METHODS = ['bank_transfer', 'cash', 'crypto', 'digital_service', 'gift_card', 'wallet'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(express.json({ limit: '100kb' }));

function sanitizeUser(user) {
  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role || 'user', createdAt: user.createdAt };
}

// naive in-memory brute-force guard for auth routes: 20 tries / 15 min / IP
const attempts = new Map();
function authLimiter(req, res, next) {
  const now = Date.now();
  const entry = attempts.get(req.ip) || { count: 0, reset: now + 15 * 60 * 1000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 15 * 60 * 1000; }
  entry.count += 1;
  attempts.set(req.ip, entry);
  if (entry.count > 20) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  next();
}

function createSession(store, userId) {
  const now = Date.now();
  store.sessions = store.sessions.filter((s) => now - new Date(s.createdAt).getTime() < SESSION_TTL_MS);
  const token = crypto.randomBytes(24).toString('hex');
  store.sessions.push({ token, userId, createdAt: new Date(now).toISOString() });
  return token;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  const store = readStore();
  const session = store.sessions.find((s) => s.token === token);
  if (!session || Date.now() - new Date(session.createdAt).getTime() > SESSION_TTL_MS) {
    return res.status(401).json({ error: 'Session expired or invalid.' });
  }
  const user = store.users.find((u) => u.id === session.userId);
  if (!user) return res.status(401).json({ error: 'User not found.' });

  req.user = user;
  req.token = token;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
}

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'dhamana-api', timestamp: new Date().toISOString() });
});

app.post('/api/auth/register', authLimiter, (req, res) => {
  const { email, displayName, password } = req.body || {};
  if (!email || !displayName || !password) {
    return res.status(400).json({ error: 'Email, display name, and password are required.' });
  }
  const emailLower = String(email).trim().toLowerCase();
  const name = String(displayName).trim();
  if (!EMAIL_RE.test(emailLower)) return res.status(400).json({ error: 'Invalid email address.' });
  if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'Display name must be 2-80 characters.' });
  if (String(password).length < 10 || String(password).length > 200) {
    return res.status(400).json({ error: 'Password must be 10-200 characters.' });
  }

  const store = readStore();
  if (store.users.some((u) => u.email.toLowerCase() === emailLower)) {
    return res.status(409).json({ error: 'Account already exists.' });
  }
  const user = {
    id: crypto.randomUUID(),
    email: emailLower,
    displayName: name,
    passwordHash: hashPassword(password),
    role: 'user',
    createdAt: new Date().toISOString()
  };
  store.users.push(user);
  const token = createSession(store, user.id);
  writeStore(store);
  res.status(201).json({ token, user: sanitizeUser(user) });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const store = readStore();
  const user = store.users.find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase());

  let ok = false;
  if (user?.passwordHash) {
    ok = verifyPassword(password, user.passwordHash);
  } else if (user?.password) { // legacy plaintext record: verify, then upgrade to a hash
    ok = user.password === String(password);
    if (ok) { user.passwordHash = hashPassword(password); delete user.password; }
  }
  if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

  const token = createSession(store, user.id);
  writeStore(store);
  res.json({ token, user: sanitizeUser(user) });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const store = readStore();
  store.sessions = store.sessions.filter((s) => s.token !== req.token);
  writeStore(store);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

app.get('/api/offers', (req, res) => {
  const store = readStore();
  const names = new Map(store.users.map((u) => [u.id, u.displayName]));
  const items = store.offers
    .filter((o) => o.status === 'open')
    .sort(byNewest)
    .map((o) => ({ ...o, vendor: names.get(o.userId) || undefined }));
  res.json({ items, total: items.length });
});

app.get('/api/my/offers', requireAuth, (req, res) => {
  const items = readStore().offers.filter((o) => o.userId === req.user.id).sort(byNewest);
  res.json({ items, total: items.length });
});

app.post('/api/offers', requireAuth, (req, res) => {
  const { title, asset, quantity, price, paymentMethod } = req.body || {};
  const cleanTitle = String(title ?? '').trim();
  const cleanAsset = String(asset ?? '').trim().toUpperCase();
  const qty = quantity === undefined || quantity === '' ? 1 : Number(quantity);
  const unitPrice = Number(price);

  if (!cleanTitle || cleanTitle.length > 120) return res.status(400).json({ error: 'Title is required (max 120 characters).' });
  if (!/^[A-Z0-9]{2,10}$/.test(cleanAsset)) return res.status(400).json({ error: 'Asset must be 2-10 letters or digits.' });
  if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'Quantity must be a positive number.' });
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return res.status(400).json({ error: 'Price must be a positive number.' });
  if (!PAYMENT_METHODS.includes(paymentMethod)) return res.status(400).json({ error: 'Unsupported payment method.' });

  const store = readStore();
  const offer = {
    id: crypto.randomUUID(),
    userId: req.user.id,
    title: cleanTitle,
    asset: cleanAsset,
    quantity: qty,
    price: unitPrice,
    paymentMethod,
    status: 'open',
    createdAt: new Date().toISOString()
  };
  store.offers.push(offer);
  writeStore(store);
  res.status(201).json({ item: offer });
});

app.patch('/api/offers/:id/close', requireAuth, (req, res) => {
  const store = readStore();
  const offer = store.offers.find((o) => String(o.id) === String(req.params.id));
  if (!offer) return res.status(404).json({ error: 'Offer not found.' });
  if (offer.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You cannot close this offer.' });
  }
  offer.status = 'closed';
  writeStore(store);
  res.json({ ok: true, item: offer });
});

app.get('/api/admin/overview', requireAuth, requireAdmin, (req, res) => {
  const { users, offers } = readStore();
  res.json({
    totalUsers: users.length,
    totalOffers: offers.length,
    openOffers: offers.filter((o) => o.status === 'open').length,
    closedOffers: offers.filter((o) => o.status === 'closed').length
  });
});

app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));

// malformed JSON etc. -> clean JSON error instead of an HTML stack trace
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status === 400 ? 'Invalid request body.' : status >= 500 ? 'Internal server error.' : err.message });
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 4000;
  app.listen(port, () => console.log(`Dhamana API running on http://localhost:${port}`));
}

module.exports = app;
