# Lexorium Android Release

This Android shell wraps the live Lexorium deployment at `https://lexoriumai.com`.

Current release metadata:

- Version code: `2`
- Version name: `1.0.1`
- Application ID: `ai.sprezzatura.lexorium`
- Base URL: `https://lexoriumai.com`
- Default Play subscription product: `lexorium_pro_monthly`

## Before building

1. Open `android-playstore/` in Android Studio.
2. Let Android Studio install the Android SDK, platform tools, and Gradle requirements if prompted.
3. Create a release keystore or use your existing Play signing keystore.
4. Copy `keystore.properties.example` to `keystore.properties`.
5. Fill in the real release keystore values.
6. In Google Play Console, create the subscription product `lexorium_pro_monthly` or update the app build/config to the exact subscription ID you will use.
7. Enable the Google Play Developer API and create a service account that your backend can use to verify subscription purchases.

## Release signing

You can provide signing values in either of these ways:

- `android-playstore/keystore.properties`
- environment variables:
  - `LEXORIUM_ANDROID_STORE_FILE`
  - `LEXORIUM_ANDROID_STORE_PASSWORD`
  - `LEXORIUM_ANDROID_KEY_ALIAS`
  - `LEXORIUM_ANDROID_KEY_PASSWORD`

## Build in Android Studio

1. Open the `android-playstore` project.
2. Sync the project.
3. Choose `Build` -> `Generate Signed Bundle / APK`.
4. Select `Android App Bundle`.
5. Use the release keystore details.
6. Build the `.aab`.

## Play Console

Use the generated `.aab` for:

- internal testing
- closed testing
- production rollout

Package details:

- Target SDK: `35`
- Billing flow: Google Play Billing for `lexorium_pro_monthly`
- Website / privacy policy host: `https://lexoriumai.com`

## Backend environment for Play Billing

Set these on the deployed backend before testing Android upgrades:

- `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY_ID` (optional)
- `GOOGLE_PLAY_PACKAGE_NAME=ai.sprezzatura.lexorium`
- `GOOGLE_PLAY_PRO_SUBSCRIPTION_ID=lexorium_pro_monthly`

## Final upload checklist

Before uploading to Google Play:

1. Build a fresh signed `.aab` from `android-playstore`.
2. Upload that bundle to Internal testing first.
3. Ensure the Vercel backend has the Google Play Billing environment variables above.
4. Ensure the Play Console subscription `lexorium_pro_monthly` is created and active.
5. Use the live privacy policy and terms URLs from `lexoriumai.com`.
