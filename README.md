# Lexorium

Lexorium is a legal intelligence product built around Puter-powered auth and AI, account-based chat history, three commercial plans, legal-only guardrails, Cashfree-powered Pro upgrades, and a Windows desktop wrapper.

## Local setup

1. Copy `.env.example` to `.env` if needed.
2. Set `SESSION_SECRET`, Firebase Admin values, Cashfree credentials, and Google Form entry ids for the enterprise lead form.
3. Run on Node.js 24+ for Puter.js backend support.
4. Start the web app:

```powershell
npm run dev
```

5. Open `http://localhost:3000`.

## GitHub and production readiness

- Commit `.env.example`, never commit `.env`.
- Rotate any secrets that were ever pasted into chat or shared outside your private environment before going live.
- Set `PUBLIC_APP_URL` to your real `https://` production domain before enabling Cashfree production checkout.
- Use `npm start` in production. It no longer forces localhost or local-dev mode.
- Before packaging the desktop app for release, set `desktop/app-config.json` to your deployed HTTPS app URL.
- GitHub Pages or other static-only hosting will not run Lexorium correctly because sign-in, chat, billing, and history depend on live `/api/*` backend routes.

## Plans

- Free: 30 queries per rolling 24-hour window with basic legal chat only.
- Pro: INR 799/month, 500 queries per rolling 24-hour window, advanced legal reasoning, contract drafting, summarisation, research tools, and exports.
- Enterprise: custom commercial plan with unlimited queries, team access, and custom workflow support.

## Routing

- Puter-backed routing is centralized in `api/_lib/model-registry.js`, `api/_lib/query-classifier.js`, `api/_lib/model-router.js`, and `api/_lib/puter-client.js`.
- The public app exposes Free and Pro model choices from `api/auth/config`.
- Enterprise uses the enterprise routing tier and contact-sales flow rather than self-serve checkout.

## Payments

- Checkout is wired for Cashfree.
- `api/billing/create-order` creates the self-serve Pro checkout order.
- `api/billing/verify-payment` verifies order status server-side and upgrades the user plan.
- `api/billing/webhook` accepts Cashfree webhook events and activates the purchased plan after signature verification.

## Enterprise leads

- `api/contact/enterprise` posts enterprise submissions into a Google Form `formResponse` endpoint.
- Add the form action URL plus the `entry.*` field ids in `.env`.

## Desktop app

- `npm run desktop:dev` opens the Electron desktop wrapper against `http://localhost:3000`.
- `npm run desktop:build` creates `downloads/Lexorium-Setup.exe`, a single-file Windows installer wrapper for the desktop app.
- The raw unpacked Electron bundle is still emitted in `downloads/win-unpacked/` during the build pipeline.
- Before a production desktop build, update `desktop/app-config.json` to your deployed HTTPS Lexorium URL so the desktop app connects to the hosted backend without shipping server secrets locally.
- Large desktop installer binaries are intentionally ignored in git. Publish `downloads/Lexorium-Setup.exe` through GitHub Releases or external storage after building.

## Notes

- Puter sign-in is synced into the Lexorium session at `api/auth/session`.
- Keep `.env` and Firebase Admin service-account files out of source control.
- Firestore is optional for localhost if `LEXORIUM_LOCAL_DEV=1` is used; production should use Firestore.
