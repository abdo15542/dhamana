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
const accountStatusEl = document.getElementById('accountStatus');
const authForm = document.getElementById('authForm');
const displayName = document.getElementById('displayName');
const authMode = document.getElementById('authMode');
const myOffersEl = document.getElementById('myOffers');

const demoOffers = [
  { id: 1, title: 'بيع USDT بسرعة', asset: 'USDT', price: 3.72, paymentMethod: 'bank_transfer', status: 'open', vendor: 'أحمد', region: 'الرياض' },
  { id: 2, title: 'شراء BNB مع ضمان', asset: 'BNB', price: 2.86, paymentMethod: 'wallet', status: 'open', vendor: 'فاطمة', region: 'جدة' },
  { id: 3, title: 'تبادل BTC مقابل تحويل بنكي', asset: 'BTC', price: 12.1, paymentMethod: 'bank_transfer', status: 'open', vendor: 'سعود', region: 'دبي' },
  { id: 4, title: 'بطاقات هدايا متجر إلكتروني', asset: 'Gift Card', price: 1.9, paymentMethod: 'gift_card', status: 'featured', vendor: 'متجر', region: 'الدمام' },
];

let authToken = sessionStorage.getItem('dhamana_token') || '';
let accountEmail = sessionStorage.getItem('dhamana_email') || '';

function renderOfferCard(item) {
  const el = document.createElement('article');
  el.className = 'offer-item';

  const top = document.createElement('div');
  top.className = 'offer-top';

  const title = document.createElement('h4');
  title.textContent = item.title;

  const price = document.createElement('div');
  price.className = 'offer-price';
  price.textContent = `${item.price.toFixed(2)} ${item.asset}`;

  top.append(title, price);

  const meta = document.createElement('div');
  meta.className = 'offer-meta';
  meta.innerHTML = `
    <span>${item.vendor || 'مستخدم موثوق'}</span>
    <span>•</span>
    <span>${item.region || 'عالمي'}</span>
    <span>•</span>
    <span>${paymentLabels[item.paymentMethod] || item.paymentMethod || 'طريقة الدفع'}</span>
  `;

  const state = document.createElement('div');
  state.className = 'offer-state';
  state.textContent = item.status === 'featured' ? 'عرض مميز' : item.status === 'open' ? 'مفتوح' : item.status;

  el.append(top, meta, state);
  return el;
}

function renderOffers(items) {
  offersEl.replaceChildren();
  items.forEach((item) => offersEl.appendChild(renderOfferCard(item)));
}

function setAccountStatus(message) {
  if (!accountStatusEl) return;
  accountStatusEl.textContent = message;
}

async function loadOffers() {
  try {
    renderOffers(demoOffers);
    if (statusEl) statusEl.textContent = 'وضع تجريبي — العروض الحالية';
  } catch (error) {
    if (statusEl) statusEl.textContent = 'تعذر تحميل السوق.';
  }
}

async function loadMyOffers() {
  if (!myOffersEl) return;
  if (!authToken) {
    myOffersEl.textContent = 'سجّل الدخول لعرض عروضك.';
    return;
  }

  myOffersEl.replaceChildren();
  demoOffers.slice(0, 2).forEach((item) => myOffersEl.appendChild(renderOfferCard(item)));
}

authMode.addEventListener('change', (event) => {
  if (!displayName) return;
  const isRegister = event.target.value === 'register';
  displayName.hidden = !isRegister;
  displayName.required = isRegister;
});

if (displayName) {
  displayName.hidden = authMode.value !== 'register';
  displayName.required = authMode.value === 'register';
}

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(authForm);
  const mode = authMode.value;
  const email = form.get('email');
  const password = form.get('password');

  authToken = 'demo-token';
  accountEmail = email;
  sessionStorage.setItem('dhamana_token', authToken);
  sessionStorage.setItem('dhamana_email', accountEmail);

  setAccountStatus(`تم ${mode === 'register' ? 'إنشاء الحساب' : 'تسجيل الدخول'}: ${accountEmail}`);
  await loadMyOffers();
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

loadOffers();
if (authToken) {
  setAccountStatus('تم التحقق من الجلسة: ' + accountEmail);
  loadMyOffers();
} else {
  setAccountStatus('لم تسجّل الدخول بعد.');
}
