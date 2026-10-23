# Dhamana — ضمانة

Secure escrow marketplace for crypto trades with trusted mediation and protected settlements.

## Project overview

This repository contains:
- `web/`: responsive Arabic-first marketing and marketplace demo for the Dhamana platform
- `mobile/`: Flutter app skeleton for Android APK generation
- `docs/`: product strategy and feature notes

## Quick start

### Web app

```bash
cd web
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

### Flutter app

```bash
cd mobile
flutter pub get
flutter run
```

To build Android APK:

```bash
flutter build apk --release
```

## Product concept

Dhamana is a trusted escrow marketplace where buyers and sellers do not exchange funds directly. The platform secures the asset in a 2-of-3 multisig escrow vault until both parties confirm or an arbiter decides in a dispute.

Core features include:
- trade offer marketplace
- secure escrow flow
- dispute/arbitration workflow
- real-time price/market indicators
- professional seller verification
- Arabic/English experience
- API-ready foundations for merchants

## Repository status

This is an MVP implementation aimed at product presentation and Android-ready app scaffolding. It is not a financial production system and not legal or security audited.
