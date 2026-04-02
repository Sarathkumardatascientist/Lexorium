# Lexorium Android Release

This Android shell wraps the live Lexorium deployment at `https://lexoriumai.com`.

## Before building

1. Open `android-playstore/` in Android Studio.
2. Let Android Studio install the Android SDK, platform tools, and Gradle requirements if prompted.
3. Create a release keystore or use your existing Play signing keystore.
4. Copy `keystore.properties.example` to `keystore.properties`.
5. Fill in the real release keystore values.

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

- Application ID: `ai.sprezzatura.lexorium`
- Target SDK: `35`
- Base URL: `https://lexoriumai.com`
