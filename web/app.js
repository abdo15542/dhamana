const API = window.WATHIQ_API || 'http://localhost:4000';
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

function renderOfferCard(item) {
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
  meta.innerHTML = `
    <span>${item.vendor || 'مستخدم موثوق'}</span>
    <span>•</span>
    <span>${item.quantity || 1}</span>
    <span>•</span>
    <span>${paymentLabels[item.paymentMethod] || item.paymentMethod || 'طريقة الدفع'}</span>
  `;

  const state = document.createElement('div');
  state.className = 'offer-state';
  state.textContent = item.status === 'open' ? 'مفتوح' : item.status;

  el.append(top, meta, state);
  return el;
}

async function loadOffers() {
  try {
    const data = await request('/api/offers');
    offersEl.replaceChildren();
    const items = data.items || [];
    items.forEach((offer) => offersEl.appendChild(renderOfferCard(offer)));
    if (statusEl) statusEl.textContent = `عدد العروض المفتوحة: ${data.total || items.length}`;
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
    items.forEach((offer) => myOffersEl.appendChild(renderOfferCard(offer)));
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
    await loadMyOffers();
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

document.getElementById('refreshMyOffers').addEventListener('click', loadMyOffers);
document.getElementById('logoutWeb').addEventListener('click', () => {
  authToken = '';
  accountEmail = '';
  sessionStorage.removeItem('dhamana_token');
  sessionStorage.removeItem('dhamana_email');
  setAccountStatus('تم تسجيل الخروج.');
  myOffersEl.textContent = 'سجّل الدخول لعرض عروضك.';
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
}

loadOffers();
restoreSession();
