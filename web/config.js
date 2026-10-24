// Server address. In a browser the app uses its own origin. Inside the Android app
// (Capacitor) the user enters the server URL once; it is checked and then remembered.
(function () {
  var cap = window.Capacitor;
  var native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  if (!native) { if (window.WATHIQ_API === undefined) window.WATHIQ_API = ''; return; }
  var saved = '';
  try { saved = localStorage.getItem('dhamana_api') || ''; } catch (e) {}
  var url = saved || window.WATHIQ_DEFAULT_API || '';
  window.WATHIQ_API = url.replace(/\/+$/, '');

  function showSetup() {
    var o = document.createElement('div');
    o.id = 'dhSetup';
    o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;direction:rtl;font-family:sans-serif';
    o.innerHTML = '<div style="max-width:420px;width:100%"><h2 style="margin:0 0 8px">ربط التطبيق بالخادم</h2>' +
      '<p style="opacity:.8;line-height:1.7">اكتب رابط خادم ضمانة، ويجب أن يبدأ بـ https://</p>' +
      '<input id="dhSrv" type="url" dir="ltr" placeholder="https://dhamana.example.com" style="width:100%;box-sizing:border-box;padding:12px;border-radius:8px;border:0;font-size:16px;margin:8px 0">' +
      '<button id="dhGo" style="width:100%;padding:12px;border-radius:8px;border:0;background:#22c55e;color:#04210f;font-size:16px;font-weight:700">اتصال</button>' +
      '<p id="dhMsg" style="min-height:24px;color:#fca5a5"></p></div>';
    document.body.appendChild(o);
    var input = document.getElementById('dhSrv'), msg = document.getElementById('dhMsg');
    input.value = window.WATHIQ_API || '';
    document.getElementById('dhGo').onclick = function () {
      var u = input.value.trim().replace(/\/+$/, '');
      if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
      if (!/^https:\/\//i.test(u)) { msg.textContent = 'يجب أن يبدأ الرابط بـ https://'; return; }
      msg.style.color = '#fff'; msg.textContent = 'جارٍ الاتصال...';
      fetch(u + '/health', { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('bad'); try { localStorage.setItem('dhamana_api', u); } catch (e) {} location.reload(); })
        .catch(function () { msg.style.color = '#fca5a5'; msg.textContent = 'تعذر الاتصال بالخادم. تأكد من الرابط ومن اتصال الإنترنت.'; });
    };
  }
  if (!url) showSetup();
  var b = document.createElement('button');
  b.textContent = '⚙ الخادم';
  b.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:9999;opacity:.55;font-size:12px;padding:4px 8px;border-radius:6px;border:0';
  b.onclick = showSetup;
  document.body.appendChild(b);
})();
