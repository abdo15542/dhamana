# نشر ضمانة على خادم حقيقي (Deployment)

## المتطلبات
- خادم VPS (Ubuntu 22.04+، ‏1 GB RAM يكفي للبداية) ودومين تملكه.
- سجل DNS من النوع **A** يشير الدومين إلى عنوان IP الخادم.

## الخطوات
1. ثبّت Docker: `curl -fsSL https://get.docker.com | sh`
2. نزّل المشروع: `git clone https://github.com/abdo15542/dhamana.git && cd dhamana`
3. أنشئ الإعدادات: `cp .env.example .env` ثم عدّل `.env`:
   - `DOMAIN` دومينك، و`ADMIN_PASSWORD` كلمة مرور طويلة (12+ حرفًا)، و`DEPOSIT_INFO` عنوان استلام الإيداعات، و`MAX_TRADE_TOTAL` سقف الصفقة.
4. شغّل: `docker compose -f docker-compose.prod.yml up -d --build` (شهادة HTTPS تُصدر تلقائيًا؛ يلزم فتح المنفذين 80 و443).
5. افتح `https://دومينك` وسجّل الدخول بـ `admin@dhamana.local`.

> `ADMIN_PASSWORD` يُستخدم **عند أول تشغيل فقط**. لتغييرها لاحقًا استخدم "تغيير كلمة المرور" داخل التطبيق، لا ملف `.env`.

## النسخ الاحتياطي (مهم: ملف واحد يحوي كل شيء)
- يدويًا: `docker compose -f docker-compose.prod.yml exec dhamana node api/scripts/backup.js` (يحتفظ بآخر 30 نسخة داخل `/data/backups`).
- تلقائيًا كل ساعة: `crontab -e` وأضف
  `0 * * * * cd /path/to/dhamana && docker compose -f docker-compose.prod.yml exec -T dhamana node api/scripts/backup.js`
- انسخ النسخ خارج الخادم بانتظام (rsync/rclone إلى تخزين آخر). نسخة على نفس القرص ليست حماية كافية.
- الاستعادة: أوقف التطبيق، انسخ الملف المطلوب إلى `/data/store.json`، ثم شغّل التطبيق.

## الأمان قبل الإطلاق
- فعّل جدار الحماية: `ufw allow 22,80,443/tcp && ufw enable`، وعطّل دخول SSH بكلمة مرور (استخدم المفاتيح).
- حدّث الخادم دوريًا (`unattended-upgrades`).
- راجع صفحة سجل التدقيق في لوحة الأدمن بانتظام.
- استشر محاميًا ومختصًا أمنيًا قبل استقبال أموال حقيقية.
