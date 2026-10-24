const API = window.WATHIQ_API ?? '';
const paymentLabels = {
  bank_transfer: 'تحويل بنكي',
  cash: 'نقدًا خارج المنصة',
  crypto: 'عملة رقمية',
  digital_service: 'خدمة رقمية',
  gift_card: 'بطاقة هدايا',
  wallet: 'محفظة إلكترونية',
};

const statusEl = document.getElementById('status');
const offersEl = document.getElementById('offers');
const authForm = document.getElementById('authForm');
const offerForm = document.getElementById('offerForm');
const accountStatus = document.getElementById('accountStatus');
const myOffersEl = document.getElementById('myOffers');
const authMode = document.getElementById('authMode');
const displayNameInput = document.getElementById('displayName');

let authToken = sessionStorage.getItem('dhamana_token') || '';
let accountEmail = sessionStorage.getItem('dhamana_email') || '';

function setAccountStatus(message) {
  if (accountStatus) accountStatus.textContent = message;
}

function apiUrl(path) {
  return `${API.replace(/\/+$/, '')}${path}`;
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  if (options.body) headers['content-type'] = 'application/json';

  const response = await fetch(apiUrl(path), { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

function renderOfferCard(item, { onClose, onBuy } = {}) {
  const el = document.createElement('article');
  el.className = 'offer-item';

  const top = document.createElement('div');
  top.className = 'offer-top';

  const title = document.createElement('h4');
  title.textContent = item.title;

  const price = document.createElement('div');
  price.className = 'offer-price';
  price.textContent = `${Number(item.price).toFixed(2)} ${item.asset}`;

  top.append(title, price);

  const meta = document.createElement('div');
  meta.className = 'offer-meta';
  const parts = [
    item.vendor || 'مستخدم موثوق',
    item.quantity || 1,
    paymentLabels[item.paymentMethod] || item.paymentMethod || 'طريقة الدفع',
  ];
  parts.forEach((text, i) => {
    if (i) {
      const dot = document.createElement('span');
      dot.textContent = '•';
      meta.append(dot);
    }
    const span = document.createElement('span');
    span.textContent = String(text);
    meta.append(span);
  });

  const state = document.createElement('div');
  state.className = 'offer-state';
  state.textContent = item.status === 'open' ? 'مفتوح' : item.status;

  el.append(top, meta, state);
  if (onClose && item.status === 'open') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost-btn small';
    btn.textContent = 'إغلاق العرض';
    btn.addEventListener('click', () => onClose(item));
    el.append(btn);
  }
  if (onBuy && item.status === 'open') {
    const buy = document.createElement('button');
    buy.type = 'button'; buy.className = 'primary-btn'; buy.textContent = 'شراء بالضمان';
    buy.addEventListener('click', () => onBuy(item));
    el.append(buy);
  }
  return el;
}

const tradeLabels = { awaiting_payment: 'بانتظار الدفع', paid: 'تم الدفع - بانتظار تأكيد البائع', completed: 'مكتملة', cancelled: 'ملغاة', expired: 'منتهية', disputed: 'نزاع - بانتظار التحكيم', refunded: 'مستردة للبائع' };
let myId = '';
async function tradeAction(id, action, body) {
  try { await request(`/api/trades/${id}/${action}`, { method: 'POST', body: JSON.stringify(body || {}) }); } catch (e) { setAccountStatus(e.message); }
  await loadTrades(); await loadWallet();
}
async function buyOffer(item) {
  if (!authToken) return setAccountStatus('سجّل الدخول أولًا للشراء.');
  const q = Number(prompt(`الكمية (المتاح ${item.quantity})`, item.quantity));
  if (!q) return;
  try { await request(`/api/offers/${encodeURIComponent(item.id)}/trades`, { method: 'POST', body: JSON.stringify({ quantity: q }) }); setAccountStatus('تم فتح الصفقة وقفل الأصول في الضمان.'); }
  catch (e) { setAccountStatus(e.message); }
  await loadOffers(); await loadTrades();
}
async function loadWallet() {
  const el = document.getElementById('wallet'); if (!el) return;
  if (!authToken) { el.textContent = ''; return; }
  try { const d = await request('/api/wallet'); const e = Object.entries(d.balances); el.textContent = e.length ? 'الرصيد: ' + e.map(([a, v]) => `${v} ${a}`).join(' • ') : 'الرصيد: 0'; } catch (e) { el.textContent = ''; }
}
async function loadAdmin(isAdmin) {
  const el = document.getElementById('adminPanel'); if (!el) return;
  el.hidden = !isAdmin; if (!isAdmin) return;
  const box = document.getElementById('adminDisputes'); box.replaceChildren();
  try {
    await loadAdminRequests();
    const o = await request('/api/admin/overview');
    document.getElementById('adminStats').textContent = `المستخدمون: ${o.totalUsers} • العروض: ${o.totalOffers} (مفتوحة ${o.openOffers})`;
    const { items } = await request('/api/admin/trades?status=disputed');
    if (!items.length) box.textContent = 'لا توجد نزاعات معلّقة.';
    items.forEach((t) => {
      const card = document.createElement('article'); card.className = 'offer-item';
      const h = document.createElement('h4'); h.textContent = `${t.quantity} ${t.asset} (${t.total}) — ${t.disputeReason || ''}`;
      card.append(h);
      (t.messages || []).slice(-5).forEach((m) => { const p = document.createElement('p'); p.className = 'offer-meta'; p.textContent = `${m.byName}: ${m.text}`; card.append(p); });
      [['تحرير للمشتري', 'release'], ['استرداد للبائع', 'refund']].forEach(([label, outcome]) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost-btn small'; b.textContent = label;
        b.addEventListener('click', async () => { try { await request(`/api/admin/trades/${t.id}/resolve`, { method: 'POST', body: JSON.stringify({ outcome }) }); } catch (e) { setAccountStatus(e.message); } loadTrades(); });
        card.append(b);
      });
      const msg = document.createElement('button'); msg.type = 'button'; msg.className = 'ghost-btn small'; msg.textContent = 'رسالة للطرفين';
      msg.addEventListener('click', () => { const x = prompt('رسالة التحكيم'); if (x) request(`/api/trades/${t.id}/messages`, { method: 'POST', body: JSON.stringify({ text: x }) }).then(loadTrades).catch((e) => setAccountStatus(e.message)); });
      card.append(msg); box.append(card);
    });
  } catch (e) { box.textContent = e.message; }
}
document.getElementById('creditForm')?.addEventListener('submit', async (event) => {
  event.preventDefault(); const f = new FormData(event.target);
  try { await request('/api/admin/credit', { method: 'POST', body: JSON.stringify({ email: f.get('email'), asset: f.get('asset'), amount: Number(f.get('amount')) }) }); setAccountStatus('تم تعديل الرصيد.'); event.target.reset(); await loadWallet(); }
  catch (e) { setAccountStatus(e.message); }
});

const reqLabels = { pending: 'قيد المراجعة', approved: 'تمت الموافقة', rejected: 'مرفوض' };
async function loadRequests() {
  const el = document.getElementById('myRequests'); if (!el) return;
  el.replaceChildren(); if (!authToken) return;
  try {
    const { items } = await request('/api/wallet/requests');
    items.slice(0, 10).forEach((r) => { const p = document.createElement('p'); p.className = 'offer-meta'; p.textContent = `${r.type === 'deposit' ? 'إيداع' : 'سحب'} ${r.amount} ${r.asset} — ${reqLabels[r.status] || r.status}${r.note ? ' (' + r.note + ')' : ''}`; el.append(p); });
  } catch (e) { /* ignore */ }
}
['depositForm', 'withdrawForm'].forEach((id) => document.getElementById(id)?.addEventListener('submit', async (event) => {
  event.preventDefault(); const f = new FormData(event.target); const dep = id === 'depositForm';
  try {
    await request(dep ? '/api/wallet/deposits' : '/api/wallet/withdrawals', { method: 'POST', body: JSON.stringify({ asset: f.get('asset'), amount: Number(f.get('amount')), [dep ? 'reference' : 'address']: f.get(dep ? 'reference' : 'address') }) });
    setAccountStatus(dep ? 'تم إرسال طلب الإيداع للمراجعة.' : 'تم إرسال طلب السحب وقفل المبلغ.'); event.target.reset(); await loadWallet(); await loadRequests();
  } catch (e) { setAccountStatus(e.message); }
}));
async function loadAdminRequests() {
  const box = document.getElementById('adminRequests'); if (!box) return; box.replaceChildren();
  const { items } = await request('/api/admin/requests?status=pending');
  if (!items.length) box.textContent = 'لا توجد طلبات إيداع أو سحب معلّقة.';
  items.forEach((r) => {
    const card = document.createElement('article'); card.className = 'offer-item';
    const h = document.createElement('h4'); h.textContent = `${r.type === 'deposit' ? 'إيداع' : 'سحب'} ${r.amount} ${r.asset} — ${r.userEmail} — ${r.reference || r.address}`; card.append(h);
    [['موافقة', 'approve'], ['رفض', 'reject']].forEach(([label, decision]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost-btn small'; b.textContent = label;
      b.addEventListener('click', async () => { const note = prompt(decision === 'approve' && r.type === 'withdrawal' ? 'رقم عملية التحويل (txid)' : 'ملاحظة (اختياري)') || ''; try { await request(`/api/admin/requests/${r.id}/decide`, { method: 'POST', body: JSON.stringify({ decision, note }) }); } catch (e) { setAccountStatus(e.message); } loadAdminRequests(); });
      card.append(b);
    });
    box.append(card);
  });
}

async function loadTrades() {
  const el = document.getElementById('myTrades'); if (!el) return;
  if (!authToken) { el.textContent = 'سجّل الدخول لعرض صفقاتك.'; loadAdmin(false); return; }
  try {
    const me = (await request('/api/auth/me')).user; myId = me.id; loadAdmin(me.role === 'admin');
    const { items } = await request('/api/trades');
    el.replaceChildren();
    if (!items.length) el.textContent = 'لا توجد صفقات بعد.';
    items.forEach((t) => {
      const card = document.createElement('article'); card.className = 'offer-item';
      const isBuyer = t.buyerId === myId;
      const h = document.createElement('h4'); h.textContent = `${t.quantity} ${t.asset} × ${t.price} = ${t.total} (${isBuyer ? 'شراء' : 'بيع'})`;
      const st = document.createElement('div'); st.className = 'offer-state'; st.textContent = tradeLabels[t.status] || t.status;
      card.append(h, st);
      (t.messages || []).slice(-5).forEach((m) => { const p = document.createElement('p'); p.className = 'offer-meta'; p.textContent = `${m.admin ? '[تحكيم] ' : ''}${m.byName}: ${m.text}`; card.append(p); });
      const add = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost-btn small'; b.textContent = label; b.addEventListener('click', fn); card.append(b); };
      if (isBuyer && t.status === 'awaiting_payment') { add('تم الدفع', () => tradeAction(t.id, 'paid', { note: prompt('مرجع/ملاحظة الدفع') || '' })); add('إلغاء', () => tradeAction(t.id, 'cancel')); }
      if (!isBuyer && t.status === 'paid') add('تأكيد استلام الدفع', () => tradeAction(t.id, 'confirm'));
      if (t.status === 'paid') add('فتح نزاع', () => { const r = prompt('سبب النزاع'); if (r) tradeAction(t.id, 'dispute', { reason: r }); });
      add('رسالة', () => { const x = prompt('اكتب رسالتك'); if (x) tradeAction(t.id, 'messages', { text: x }); });
      if (t.status === 'completed' && !(t.ratings || {})[myId]) add('تقييم 5★', () => tradeAction(t.id, 'rate', { score: 5 }));
      el.append(card);
    });
  } catch (e) { el.textContent = e.message; }
}

let allOffers = [];

function applyFilters() {
  const asset = document.getElementById('filterAsset')?.value || '';
  const pay = document.getElementById('filterPayment')?.value || '';
  const items = allOffers.filter((o) => (!asset || o.asset === asset) && (!pay || o.paymentMethod === pay));
  offersEl.replaceChildren();
  items.forEach((offer) => offersEl.appendChild(renderOfferCard(offer, { onBuy: buyOffer })));
  if (!items.length) offersEl.textContent = 'لا توجد عروض مطابقة.';
  if (statusEl) statusEl.textContent = `عدد العروض المفتوحة: ${items.length}`;
}

async function closeOffer(item) {
  try {
    await request(`/api/offers/${encodeURIComponent(item.id)}/close`, { method: 'PATCH' });
    setAccountStatus('تم إغلاق العرض.');
    await loadOffers();
    await loadMyOffers();
  } catch (error) {
    setAccountStatus(error.message || 'تعذر إغلاق العرض.');
  }
}

async function loadOffers() {
  try {
    const data = await request('/api/offers');
    allOffers = data.items || [];
    applyFilters();
  } catch (error) {
    if (statusEl) statusEl.textContent = 'تعذر الاتصال بالخادم. تأكد من تشغيل API على المنفذ 4000.';
    console.error(error);
  }
}

async function loadMyOffers() {
  if (!myOffersEl) return;
  if (!authToken) {
    myOffersEl.textContent = 'سجّل الدخول لعرض عروضك.';
    return;
  }

  try {
    const data = await request('/api/my/offers');
    myOffersEl.replaceChildren();
    const items = data.items || [];
    items.forEach((offer) => myOffersEl.appendChild(renderOfferCard(offer, { onClose: closeOffer })));
    if (!items.length) myOffersEl.textContent = 'ليس لديك عروض حتى الآن.';
  } catch (error) {
    myOffersEl.textContent = error.message || 'تعذر تحميل عروضك.';
  }
}

authMode.addEventListener('change', (event) => {
  if (displayNameInput) {
    const isRegister = event.target.value === 'register';
    displayNameInput.hidden = !isRegister;
    displayNameInput.required = isRegister;
  }
});

if (displayNameInput) {
  displayNameInput.hidden = authMode.value !== 'register';
  displayNameInput.required = authMode.value === 'register';
}

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(authForm);
  const mode = authMode.value;
  const body = {
    email: form.get('email'),
    password: form.get('password'),
  };

  if (mode === 'register') {
    body.displayName = form.get('displayName');
  }

  try {
    const data = await request(mode === 'register' ? '/api/auth/register' : '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    authToken = data.token;
    accountEmail = data.user.email;
    sessionStorage.setItem('dhamana_token', authToken);
    sessionStorage.setItem('dhamana_email', accountEmail);
    setAccountStatus(`تم ${mode === 'register' ? 'إنشاء الحساب' : 'تسجيل الدخول'}: ${accountEmail}`);
    await loadMyOffers(); await loadTrades(); await loadWallet(); await loadRequests();
  } catch (error) {
    setAccountStatus(error.message || 'تعذر التسجيل.');
  }
});

offerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!authToken) {
    setAccountStatus('سجّل الدخول أولًا لإضافة عرض.');
    return;
  }

  const form = new FormData(offerForm);

  try {
    await request('/api/offers', {
      method: 'POST',
      body: JSON.stringify({
        title: form.get('title'),
        asset: form.get('asset'),
        quantity: Number(form.get('quantity')),
        price: Number(form.get('price')),
        paymentMethod: form.get('paymentMethod'),
      }),
    });
    setAccountStatus('تم إنشاء العرض بنجاح.');
    offerForm.reset();
    await loadOffers();
    await loadMyOffers();
  } catch (error) {
    setAccountStatus(error.message || 'تعذر إنشاء العرض.');
  }
});

['filterAsset', 'filterPayment'].forEach((id) => document.getElementById(id)?.addEventListener('change', applyFilters));
document.getElementById('refreshOffers')?.addEventListener('click', loadOffers);
document.getElementById('refreshMyOffers').addEventListener('click', loadMyOffers);
document.getElementById('logoutWeb').addEventListener('click', async () => {
  if (authToken) await request('/api/auth/logout', { method: 'POST' }).catch(() => {});
  authToken = '';
  accountEmail = '';
  sessionStorage.removeItem('dhamana_token');
  sessionStorage.removeItem('dhamana_email');
  setAccountStatus('تم تسجيل الخروج.');
  myOffersEl.textContent = 'سجّل الدخول لعرض عروضك.';
  loadTrades(); loadWallet(); loadRequests();
});

document.getElementById('connect').addEventListener('click', () => {
  const accountSection = document.getElementById('account');
  if (accountSection) accountSection.scrollIntoView({ behavior: 'smooth' });
});

async function restoreSession() {
  if (authToken) {
    try {
      const data = await request('/api/auth/me');
      accountEmail = data.user.email || accountEmail;
      setAccountStatus(`تم التحقق من الجلسة: ${accountEmail}`);
    } catch (error) {
      authToken = '';
      accountEmail = '';
      sessionStorage.removeItem('dhamana_token');
      sessionStorage.removeItem('dhamana_email');
      setAccountStatus('انتهت الجلسة أو لم تعد صالحة. سجّل الدخول مجددًا.');
    }
  } else {
    setAccountStatus('لم تسجّل الدخول بعد.');
  }

  await loadMyOffers();
  await loadTrades();
  await loadWallet();
  await loadRequests();
}

async function loadConfig() {
  try {
    const c = await request('/api/config'); const el = document.getElementById('depositInfo'); if (!el) return;
    const lines = Object.entries(c.deposit || {}).map(([a, info]) => `${a}: ${info}`);
    const limit = c.maxTradeTotal ? ` • الحد الأقصى للصفقة: ${c.maxTradeTotal}` : '';
    el.textContent = (lines.length ? `عنوان/حساب الإيداع — ${lines.join(' | ')}` : 'تواصل مع الإدارة للحصول على عنوان الإيداع.') + ` • عمولة الصفقة ${(c.feeRate * 100).toFixed(1)}%` + limit;
  } catch (e) { /* ignore */ }
}
loadConfig();
loadOffers();
restoreSession();
