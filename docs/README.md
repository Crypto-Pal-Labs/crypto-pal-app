## Transak Session Integration (Local Dev)

1. Install Netlify CLI:

```
npm i -g netlify-cli
```

2. Create a `.env` file at project root with:

```
TRANSAK_ACCESS_TOKEN=your_transak_partner_access_token
TRANSAK_API_KEY=your_transak_widget_api_key
TRANSAK_ENV=staging
REFERRER_DOMAIN=cryptopal.app
REDIRECT_URL=https://cryptopal.app/transak/return
```

3. Run functions locally:

```
npm run dev:functions
```

4. Start the app and open the Buy tab.

# Crypto Pal – Release Pack

**Date:** 2025-10-14

This pack contains a one-page README plus a few assets you can upload to the Play Store and your website.

---

## What’s inside

- `README.md` – This file (step‑by‑step for Internal Test and Production)
- `legal/cryptopal-privacy-policy.html` – Non‑custodial privacy policy (ready to host)
- `store/feature-graphic-1024x500.png` – Play Store feature graphic (1024×500)
- `store/listing-suggested-text.txt` – Suggested short/long description and bullets

> Your **app icon** and **adaptive icon** already live in your repo `assets/` folder, so they are **not** duplicated here.

---

## 1) Final pre‑flight (once only)

- **Package IDs (permanent):**
  - Android: `cryptopal.trade.app`
  - iOS: `cryptopal.trade.app`
- **Required assets in repo (`assets/`):**
  - `icon.png` (CP monogram)
  - `adaptive-icon.png`
  - `splash.png`
- **EAS env in `eas.json`:**
  - EXPO_PUBLIC_* keys are defined for: development, preview, internal, production

---

## 2) Internal Test on Google Play (AAB + rollout)

From the project root:

```powershell
# Build the AAB for Internal track
yarn build:internal

# (If you have the Play service account JSON in project root)
yarn submit:internal
```

**If you need to create the Play service account:**
1. Play Console → **API access** → Link Google Cloud project.
2. **Create service account** (in Google Cloud): name `eas-submit`; role **Release Manager**.
3. Create **JSON key** → download → save as `play-service-account.json` in your project root (do not commit).
4. Back in Play Console → ensure the service account has access to your app.

**Roll out to testers:**
- Play Console → **Testing → Internal testing**
- Attach the uploaded AAB (or use the release created by CLI)
- Add tester emails / Google Group
- **Roll out** and share the opt‑in link

---

## 3) Store Listing (fast baseline)

**Feature graphic:** upload `store/feature-graphic-1024x500.png`

**Short description (≤80 chars):**
Self‑custody wallet to buy, hold, send & receive safely.

**Full description (suggested bullets):**
- Non‑custodial: your keys stay on your device
- Buy, hold, send & receive crypto
- QR scan & address book
- Price, charts, and history
- Powered by trusted providers (Covalent, Transak)

**Screenshots (recommend 4–6):**
Wallet • Send • Receive • Buy • History

**Content rating:** Finance; no gambling  
**Target audience:** Adults; not directed to children  
**Data safety (current build):**
- Data collected: **None**
- Data shared: **None**
- Encrypted in transit: **Yes**
- Data deletion: **N/A**
- Device/Other IDs: **No**
- Camera permission: **Used only for QR scanning**

**Privacy policy URL:** host `legal/cryptopal-privacy-policy.html` publicly (e.g., GitHub Pages or your website) and paste that URL into Play Console → App content → Privacy policy.

---

## 4) Production later

When Internal testing is green and the listing is ready:

```powershell
# Bump version for a new release when needed
eas build:version:set -p android

# Build and submit to Production
yarn build:aab
yarn submit:prod
```

**Versioning discipline:**
- Tag each stable checkpoint in git
- Keep a mini changelog in `/docs/releases/` with commit SHA + EAS build ID

---

## 5) Troubleshooting quick fixes

- **ENOENT: assets/adaptive-icon.png** → Ensure single `.png` name, committed and visible on GitHub at `/assets/adaptive-icon.png`.
- **Submit permission error** → Service account needs **Release Manager** role and access to the app in Play Console.
- **Icons don’t update on device** → Rebuild APK/AAB and reinstall.
- **Charts intermittently empty** → Add simple retry/backoff & small cache (planned Phase 2 hardening).

---

## 6) Contact

Support: **support@cryptopal.trade**  
© 2025 Crypto Pal Labs. All rights reserved.
