# Deployment Notes

## Web deployment

Deploy the static pages and `api/` routes on the same origin. Configure:

- `PUBLIC_APP_URL`
- `SESSION_SECRET`
- Firebase Admin credentials
- `PAYMENT_PROVIDER=cashfree`
- `CASHFREE_APP_ID`
- `CASHFREE_SECRET_KEY`
- `CASHFREE_ENV`
- `PRO_PLAN_PRICE_PAISE`
- `FREE_DAILY_LIMIT`
- `PRO_DAILY_LIMIT`
- `ENTERPRISE_DAILY_LIMIT`
- `GOOGLE_FORM_ACTION_URL`
- `GOOGLE_FORM_ENTRY_FULL_NAME`
- `GOOGLE_FORM_ENTRY_WORK_EMAIL`
- `GOOGLE_FORM_ENTRY_ORGANIZATION`
- `GOOGLE_FORM_ENTRY_REQUIREMENTS`
- `LEXORIUM_DISABLED_MODELS`

Important:

- Do not commit `.env` to GitHub.
- Rotate any Cashfree or other production secrets that have ever been exposed outside your private deployment environment.
- Set `PUBLIC_APP_URL` to your live `https://` origin before enabling production checkout.
- Use `npm start` in production. Do not use the localhost-only `npm run dev` script on your deployed host.
- Do not deploy Lexorium on GitHub Pages or other static-only hosting. It requires live `/api/*` backend routes for sign-in, sessions, chat, billing, and enterprise contact handling.

## Puter

- The landing page signs users in through Puter.js.
- The browser token is synced into the Lexorium session at `/api/auth/session`.
- Chat requests send the Puter token back to the backend so Puter.js can run server-side on behalf of the signed-in user.

## Cashfree

- Use the production or sandbox Cashfree environment consistently.
- In production, `PUBLIC_APP_URL` must be a public `https://` origin, not `localhost`.
- Point the payment return URL to `PUBLIC_APP_URL/app.html?cashfree_order_id={order_id}`.
- Point Cashfree webhooks to `/api/billing/webhook`.
- Self-serve checkout is designed for Pro only. Enterprise remains contact-sales-led.

## Google Forms

- Point `GOOGLE_FORM_ACTION_URL` to the Google Form `formResponse` URL.
- Add the matching `entry.*` ids for the enterprise form fields.

## Firestore

Production should use Firestore for user records, plan state, and conversation history. Localhost can use the local dev store when `LEXORIUM_LOCAL_DEV=1`.

## Routing and plans

- Routing is centralized in the backend model registry and router layers under `api/_lib/`.
- Free, Pro, and Enterprise are enforced server-side through `api/_lib/plan-access.js`.
- Draft Mode, Summarise, and Research Tool remain locked until Pro or above.

## Desktop build

Before packaging the desktop app:

1. Set your deployed web app URL in `desktop/app-config.json`.
2. Install desktop dependencies.
3. Run:

```powershell
npm run desktop:build
```

The packaged Windows app is emitted into `downloads/`, and the single-file Windows installer is `downloads/Lexorium-Setup.exe`.

Note: large installer binaries such as `.exe` and `.zip` are ignored in git so the repository can be pushed to GitHub successfully. Publish the built installer through GitHub Releases or another file host after packaging.
