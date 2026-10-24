# Dhamana — ضمانة

Dhamana is a real escrow marketplace MVP designed for secure peer-to-peer digital asset exchange. It keeps seller funds protected in a 2-of-3 escrow model until both parties confirm or an arbiter resolves a dispute.

## Included in this repository

- `web/`: responsive Arabic-first marketplace landing page and user dashboard
- `api/`: Express API with register/login, offer creation, offer listing, and auth flows
- `mobile/`: Flutter app skeleton for Android APK generation
- `docs/overview.md`: product overview and business model

## Deploy (one command)

```bash
cp .env.example .env   # set a strong ADMIN_PASSWORD
docker compose up -d --build
```
App + API on http://localhost:4000 (data persists in the `dhamana-data` volume). Put it behind HTTPS (Caddy/Nginx/Cloudflare) before exposing it. In production the server refuses to start with a weak or default admin password.

## Run backend (development)

```bash
cd api
npm install
npm start
```

The API runs at:
- http://localhost:4000/health
- http://localhost:4000/api/auth/register
- http://localhost:4000/api/auth/login
- http://localhost:4000/api/offers

## Run web app

```bash
cd web
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Mobile app (installable PWA)

Open the deployed HTTPS URL in Chrome on Android -> menu -> *Install app*. It runs full-screen, uses the same API/accounts, and caches only the app shell (never API data). Requires HTTPS (localhost works for testing).

## Flutter app (static scaffold, not connected to the API)

```bash
cd mobile
flutter pub get
flutter run
```

Build Android APK:

```bash
flutter build apk --release
```

## Admin login

```txt
Email: admin@dhamana.local
Password: admin123456
```

## Escrow flow (implemented)

Seller offer -> buyer opens trade (seller funds locked) -> buyer marks paid -> seller confirms (release to buyer minus `FEE_RATE`, default 1%) | cancel/expiry (`PAY_WINDOW_MS`, default 30 min) refunds seller | dispute -> admin resolves via `POST /api/admin/trades/:id/resolve` (`release` or `refund`). Wallet balances and an append-only ledger live in the API store; admins credit deposits with `POST /api/admin/credit` because **no payment gateway or blockchain custody is integrated** — that part needs your payment provider/wallet infrastructure and legal review.

## Configuration (optional env vars)

- `PORT` (default 4000), `CORS_ORIGIN` (comma-separated allowed origins), `ADMIN_PASSWORD` (initial admin password), `DHAMANA_DATA_DIR`
- Run tests: `cd api && npm test`
- `api/data/store.json` is created on first run and is git-ignored. **Change the admin password before any real use.**

## Notes

This is a genuine MVP implementation, not an audited production financial system. It is intended for working prototype development, local testing, and APK-ready app scaffolding.
