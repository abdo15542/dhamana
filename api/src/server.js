const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const { readStore, writeStore, hashPassword, verifyPassword } = require('./store');

const app = express();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PAYMENT_METHODS = ['bank_transfer', 'cash', 'crypto', 'digital_service', 'gift_card', 'wallet'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(express.json({ limit: '100kb' }));
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
  if (process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});

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

// public, non-secret settings the UI needs; deposit instructions are set by the operator via env
app.get('/api/config', (req, res) => {
  let deposit = {};
  try { deposit = JSON.parse(process.env.DEPOSIT_INFO || '{}'); } catch (e) { deposit = {}; }
  res.json({
    feeRate: Number(process.env.FEE_RATE ?? 0.01),
    payWindowMinutes: Number(process.env.PAY_WINDOW_MS ?? 30 * 60 * 1000) / 60000,
    maxTradeTotal: Number(process.env.MAX_TRADE_TOTAL) > 0 ? Number(process.env.MAX_TRADE_TOTAL) : null,
    deposit
  });
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


// ---------- Escrow: wallets, ledger, trades ----------
const FEE_RATE = Number(process.env.FEE_RATE ?? 0.01);
const PAY_WINDOW_MS = Number(process.env.PAY_WINDOW_MS ?? 30 * 60 * 1000);
const r8 = (n) => Math.round(n * 1e8) / 1e8;

function move(store, userId, asset, delta, reason, tradeId) {
  store.balances ||= {}; store.ledger ||= [];
  const key = `${userId}:${asset}`;
  const next = r8((store.balances[key] || 0) + delta);
  if (next < 0) { const e = new Error('Insufficient balance.'); e.status = 400; throw e; }
  store.balances[key] = next;
  store.ledger.push({ id: crypto.randomUUID(), userId, asset, delta, reason, tradeId, at: new Date().toISOString() });
}
function notify(store, userId, text, refId) {
  if (!userId || userId === 'system') return;
  store.notifications ||= [];
  store.notifications.push({ id: crypto.randomUUID(), userId, text, refId, read: false, at: new Date().toISOString() });
  if (store.notifications.length > 5000) store.notifications.splice(0, store.notifications.length - 5000);
}
const STATUS_AR = { completed: 'اكتملت', cancelled: 'أُلغيت', expired: 'انتهت مهلتها', refunded: 'أُعيدت أصولها للبائع' };
function notifyBoth(store, t) { [t.buyerId, t.sellerId].forEach((u) => notify(store, u, `الصفقة ${t.quantity} ${t.asset} ${STATUS_AR[t.status] || t.status}.`, t.id)); }
function audit(store, req, action, details) {
  store.audit ||= [];
  store.audit.push({ id: crypto.randomUUID(), at: new Date().toISOString(), adminId: req.user.id, adminEmail: req.user.email, action, details });
  if (store.audit.length > 5000) store.audit.splice(0, store.audit.length - 5000);
}
function log(trade, event, by) { trade.history.push({ event, by, at: new Date().toISOString() }); }
function restoreOffer(store, trade) {
  const offer = store.offers.find((o) => o.id === trade.offerId);
  if (offer) { offer.quantity = r8(offer.quantity + trade.quantity); if (offer.status === 'sold') offer.status = 'open'; }
}
function refund(store, trade, status, by) {
  move(store, trade.sellerId, trade.asset, trade.quantity, 'escrow_refund', trade.id);
  restoreOffer(store, trade); trade.status = status; log(trade, status, by); notifyBoth(store, trade);
}
function release(store, trade, by) {
  move(store, trade.buyerId, trade.asset, r8(trade.quantity - trade.fee), 'escrow_release', trade.id);
  if (trade.fee > 0) move(store, 'admin-001', trade.asset, trade.fee, 'fee', trade.id);
  trade.status = 'completed'; log(trade, 'completed', by); notifyBoth(store, trade);
}
function expire(store) {
  let changed = false;
  for (const t of store.trades || []) {
    if (t.status === 'awaiting_payment' && Date.now() - new Date(t.createdAt) > PAY_WINDOW_MS) { refund(store, t, 'expired', 'system'); changed = true; }
  }
  return changed;
}
// load store, expire stale trades, run fn(store); wraps errors into JSON responses
function tx(handler) {
  return (req, res) => {
    try {
      const store = readStore(); store.trades ||= [];
      expire(store);
      const out = handler(req, res, store);
      if (out !== false) writeStore(store);
    } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : 'Internal server error.' }); }
  };
}
const fail = (status, message) => Object.assign(new Error(message), { status });
const findTrade = (store, req) => {
  const t = store.trades.find((x) => x.id === req.params.id);
  if (!t) throw fail(404, 'Trade not found.');
  if (![t.buyerId, t.sellerId].includes(req.user.id) && req.user.role !== 'admin') throw fail(403, 'Not your trade.');
  return t;
};

app.get('/api/wallet', requireAuth, tx((req, res, store) => {
  const prefix = `${req.user.id}:`;
  const balances = Object.fromEntries(Object.entries(store.balances || {}).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
  res.json({ balances, ledger: (store.ledger || []).filter((l) => l.userId === req.user.id).slice(-50).reverse() });
}));

// No payment rail is integrated: deposits are credited by an admin after verifying funds off-platform.
app.post('/api/admin/credit', requireAuth, requireAdmin, tx((req, res, store) => {
  const { email, asset, amount } = req.body || {};
  const user = store.users.find((u) => u.email === String(email || '').trim().toLowerCase());
  const a = String(asset || '').toUpperCase(); const n = Number(amount);
  if (!user || !/^[A-Z0-9]{2,10}$/.test(a) || !Number.isFinite(n) || n === 0) throw fail(400, 'email, asset and a non-zero amount are required.');
  move(store, user.id, a, n, 'admin_adjustment');
  audit(store, req, 'balance_adjustment', { email: user.email, asset: a, amount: n });
  res.json({ ok: true });
}));

app.post('/api/offers/:id/trades', requireAuth, tx((req, res, store) => {
  const offer = store.offers.find((o) => String(o.id) === req.params.id);
  if (!offer || offer.status !== 'open') throw fail(404, 'Offer not available.');
  if (offer.userId === req.user.id) throw fail(400, 'You cannot trade with your own offer.');
  const qty = req.body?.quantity === undefined ? offer.quantity : Number(req.body.quantity);
  if (!Number.isFinite(qty) || qty <= 0 || qty > offer.quantity) throw fail(400, 'Invalid quantity.');
  const maxTotal = Number(process.env.MAX_TRADE_TOTAL);
  if (maxTotal > 0 && r8(qty * offer.price) > maxTotal) throw fail(400, `Trade value exceeds the platform limit (${maxTotal}).`);
  move(store, offer.userId, offer.asset, -qty, 'escrow_lock'); // seller funds locked here
  offer.quantity = r8(offer.quantity - qty); if (offer.quantity === 0) offer.status = 'sold';
  const trade = { id: crypto.randomUUID(), offerId: offer.id, sellerId: offer.userId, buyerId: req.user.id, asset: offer.asset,
    quantity: qty, price: offer.price, total: r8(qty * offer.price), fee: r8(qty * FEE_RATE), paymentMethod: offer.paymentMethod,
    status: 'awaiting_payment', createdAt: new Date().toISOString(), history: [], ratings: {} };
  log(trade, 'opened', req.user.id); store.trades.push(trade);
  notify(store, trade.sellerId, `صفقة جديدة على عرضك: ${qty} ${offer.asset} — الأصول مقفلة في الضمان.`, trade.id);
  res.status(201).json({ item: trade });
}));

app.get('/api/trades', requireAuth, tx((req, res, store) => {
  const items = store.trades.filter((t) => t.buyerId === req.user.id || t.sellerId === req.user.id).sort(byNewest);
  res.json({ items, total: items.length });
}));
app.get('/api/trades/:id', requireAuth, tx((req, res, store) => { res.json({ item: findTrade(store, req) }); return false; }));

const step = (path, check, apply) => app.post(`/api/trades/:id/${path}`, requireAuth, tx((req, res, store) => {
  const t = findTrade(store, req); check(t, req); apply(store, t, req); res.json({ item: t });
}));
step('paid', (t, r) => { if (t.buyerId !== r.user.id) throw fail(403, 'Only the buyer can mark payment.'); if (t.status !== 'awaiting_payment') throw fail(409, 'Trade is not awaiting payment.'); },
  (s, t, r) => { t.status = 'paid'; t.paymentNote = String(r.body?.note || '').slice(0, 500); log(t, 'paid', r.user.id); notify(s, t.sellerId, `المشتري أكد الدفع للصفقة ${t.quantity} ${t.asset}. تحقق ثم أكّد الاستلام.`, t.id); });
step('confirm', (t, r) => { if (t.sellerId !== r.user.id) throw fail(403, 'Only the seller can confirm receipt.'); if (t.status !== 'paid') throw fail(409, 'Payment has not been marked yet.'); },
  (s, t, r) => release(s, t, r.user.id));
step('cancel', (t, r) => { if (t.buyerId !== r.user.id) throw fail(403, 'Only the buyer can cancel.'); if (t.status !== 'awaiting_payment') throw fail(409, 'Trade can no longer be cancelled.'); },
  (s, t, r) => refund(s, t, 'cancelled', r.user.id));
step('dispute', (t, r) => { if (t.status !== 'paid') throw fail(409, 'Only paid trades can be disputed.'); if (r.user.role === 'admin') throw fail(403, 'Admins resolve disputes.'); if (!String(r.body?.reason || '').trim()) throw fail(400, 'A reason is required.'); },
  (s, t, r) => { t.status = 'disputed'; t.disputeReason = String(r.body.reason).slice(0, 1000); t.disputedBy = r.user.id; log(t, 'disputed', r.user.id); notify(s, r.user.id === t.buyerId ? t.sellerId : t.buyerId, `تم فتح نزاع على الصفقة ${t.quantity} ${t.asset}.`, t.id); });
step('rate', (t, r) => { if (t.status !== 'completed') throw fail(409, 'Only completed trades can be rated.'); const n = Number(r.body?.score); if (!Number.isInteger(n) || n < 1 || n > 5) throw fail(400, 'Score must be 1-5.'); if (t.ratings[r.user.id]) throw fail(409, 'Already rated.'); },
  (s, t, r) => { t.ratings[r.user.id] = Number(r.body.score); });

app.post('/api/trades/:id/messages', requireAuth, tx((req, res, store) => {
  const t = findTrade(store, req);
  const text = String(req.body?.text || '').trim();
  if (!text || text.length > 1000) throw fail(400, 'Message must be 1-1000 characters.');
  t.messages ||= [];
  if (t.messages.length >= 200) throw fail(429, 'Message limit reached for this trade.');
  t.messages.push({ id: crypto.randomUUID(), by: req.user.id, byName: req.user.displayName, admin: req.user.role === 'admin', text, at: new Date().toISOString() });
  [t.buyerId, t.sellerId].filter((u) => u !== req.user.id).forEach((u) => notify(store, u, `رسالة جديدة في صفقة ${t.quantity} ${t.asset}.`, t.id));
  res.status(201).json({ item: t });
}));

app.get('/api/admin/trades', requireAuth, requireAdmin, tx((req, res, store) => {
  const status = req.query.status ? String(req.query.status) : null;
  const items = store.trades.filter((t) => !status || t.status === status).sort(byNewest);
  res.json({ items, total: items.length });
  return false;
}));

// ---------- Deposits & withdrawals (manual, admin-reviewed) ----------
const ASSET_RE = /^[A-Z0-9]{2,10}$/;
function parseMoney(body) {
  const asset = String(body?.asset || '').trim().toUpperCase(); const amount = Number(body?.amount);
  if (!ASSET_RE.test(asset) || !Number.isFinite(amount) || amount <= 0 || amount > 1e9) throw fail(400, 'Valid asset and positive amount are required.');
  return { asset, amount: r8(amount) };
}
function newRequest(store, req, type, extra) {
  store.requests ||= [];
  if (store.requests.filter((r) => r.userId === req.user.id && r.status === 'pending').length >= 10) throw fail(429, 'Too many pending requests.');
  const item = { id: crypto.randomUUID(), userId: req.user.id, userEmail: req.user.email, type, status: 'pending', createdAt: new Date().toISOString(), ...extra };
  store.requests.push(item); return item;
}
const cleanText = (v, min, label) => { const x = String(v || '').trim().slice(0, 200); if (x.length < min) throw fail(400, `${label} is required.`); return x; };

app.post('/api/wallet/deposits', requireAuth, tx((req, res, store) => {
  const { asset, amount } = parseMoney(req.body);
  const item = newRequest(store, req, 'deposit', { asset, amount, reference: cleanText(req.body?.reference, 5, 'Transfer reference/hash') });
  res.status(201).json({ item });
}));

app.post('/api/wallet/withdrawals', requireAuth, tx((req, res, store) => {
  const { asset, amount } = parseMoney(req.body);
  const address = cleanText(req.body?.address, 5, 'Destination address');
  const item = newRequest(store, req, 'withdrawal', { asset, amount, address });
  move(store, req.user.id, asset, -amount, 'withdrawal_lock', item.id); // funds leave the balance immediately
  res.status(201).json({ item });
}));

app.get('/api/wallet/requests', requireAuth, tx((req, res, store) => {
  const items = (store.requests || []).filter((r) => r.userId === req.user.id).sort(byNewest);
  res.json({ items, total: items.length }); return false;
}));

app.get('/api/admin/requests', requireAuth, requireAdmin, tx((req, res, store) => {
  const status = req.query.status ? String(req.query.status) : null;
  const items = (store.requests || []).filter((r) => !status || r.status === status).sort(byNewest);
  res.json({ items, total: items.length }); return false;
}));

app.post('/api/admin/requests/:id/decide', requireAuth, requireAdmin, tx((req, res, store) => {
  const r = (store.requests || []).find((x) => x.id === req.params.id);
  if (!r) throw fail(404, 'Request not found.');
  if (r.status !== 'pending') throw fail(409, 'Request already decided.');
  const approve = req.body?.decision === 'approve';
  if (!approve && req.body?.decision !== 'reject') throw fail(400, "decision must be 'approve' or 'reject'.");
  r.note = String(req.body?.note || '').slice(0, 300); r.decidedBy = req.user.id; r.decidedAt = new Date().toISOString();
  if (r.type === 'deposit' && approve) {
    if (store.requests.some((x) => x.type === 'deposit' && x.status === 'approved' && x.asset === r.asset && x.reference.toLowerCase() === r.reference.toLowerCase())) throw fail(409, 'This transfer reference was already credited.');
    move(store, r.userId, r.asset, r.amount, 'deposit', r.id);
  }
  if (r.type === 'withdrawal' && !approve) move(store, r.userId, r.asset, r.amount, 'withdrawal_refund', r.id);
  r.status = approve ? 'approved' : 'rejected';
  notify(store, r.userId, `طلب ${r.type === 'deposit' ? 'الإيداع' : 'السحب'} (${r.amount} ${r.asset}): ${approve ? 'تمت الموافقة' : 'تم الرفض'}.`, r.id);
  audit(store, req, `${r.type}_${r.status}`, { requestId: r.id, user: r.userEmail, asset: r.asset, amount: r.amount, note: r.note });
  res.json({ item: r });
}));

app.get('/api/notifications', requireAuth, tx((req, res, store) => {
  const mine = (store.notifications || []).filter((n) => n.userId === req.user.id);
  res.json({ items: mine.slice(-50).reverse(), unread: mine.filter((n) => !n.read).length }); return false;
}));
app.post('/api/notifications/read', requireAuth, tx((req, res, store) => {
  (store.notifications || []).forEach((n) => { if (n.userId === req.user.id) n.read = true; });
  res.json({ ok: true });
}));

app.get('/api/admin/audit', requireAuth, requireAdmin, tx((req, res, store) => {
  const items = (store.audit || []).slice(-100).reverse();
  res.json({ items, total: (store.audit || []).length }); return false;
}));

app.post('/api/admin/trades/:id/resolve', requireAuth, requireAdmin, tx((req, res, store) => {
  const t = store.trades.find((x) => x.id === req.params.id);
  if (!t) throw fail(404, 'Trade not found.');
  if (t.status !== 'disputed') throw fail(409, 'Trade is not disputed.');
  if (req.body?.outcome === 'release') release(store, t, req.user.id);
  else if (req.body?.outcome === 'refund') refund(store, t, 'refunded', req.user.id);
  else throw fail(400, "outcome must be 'release' or 'refund'.");
  audit(store, req, `dispute_${req.body.outcome}`, { tradeId: t.id, asset: t.asset, quantity: t.quantity });
  res.json({ item: t });
}));

app.get('/api/users/:id/reputation', (req, res) => {
  const store = readStore(); let sum = 0; let n = 0; let done = 0;
  for (const t of store.trades || []) {
    if (t.sellerId !== req.params.id && t.buyerId !== req.params.id) continue;
    if (t.status === 'completed') done += 1;
    const other = t.sellerId === req.params.id ? t.buyerId : t.sellerId;
    if (t.ratings?.[other]) { sum += t.ratings[other]; n += 1; }
  }
  res.json({ completedTrades: done, ratings: n, average: n ? Math.round((sum / n) * 10) / 10 : null });
});

// the API also serves the web app, so one URL/port is enough in production
app.use(express.static(path.join(__dirname, '..', '..', 'web'), { maxAge: '5m', setHeaders: (res, file) => { if (file.endsWith('sw.js')) res.set('Cache-Control', 'no-cache'); } }));

app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));

// malformed JSON etc. -> clean JSON error instead of an HTML stack trace
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status === 400 ? 'Invalid request body.' : status >= 500 ? 'Internal server error.' : err.message });
});

if (require.main === module) {
  if (process.env.NODE_ENV === 'production' && (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'admin123456' || process.env.ADMIN_PASSWORD.length < 12)) {
    console.error('Refusing to start: set ADMIN_PASSWORD (12+ characters, not the default) when NODE_ENV=production.');
    process.exit(1);
  }
  const port = Number(process.env.PORT) || 4000;
  app.listen(port, () => console.log(`Dhamana API running on http://localhost:${port}`));
}

module.exports = app;
