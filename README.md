# FinAgent

FinAgent is an Expo finance app for tracking cards, transactions, budgets, bills, and receipt scans. The Expo Router route in `app/` uses React Native components and supports Android, iOS, and web.

## Run the app

Install dependencies and start Expo:

```sh
npm install
npx expo start
```

Press `w` in the Expo terminal to open the same app in a browser.

## Languages

The interface supports English, Spanish, French, German, Portuguese, Hindi, Simplified Chinese, Japanese, and Arabic. Use the globe button in the app header to change languages. Your selection is saved on the device and restored the next time you open the app.

## Connect the API

Chat and receipt-scanning requests use the deployed Express API:

```text
https://fin-agent-server-bioa.vercel.app
```

The app uses this fixed URL on web, iOS, and Android; local host detection, `EXPO_PUBLIC_API_URL`, and saved server-address overrides are not used. Configure `GEMINI_API_KEY` in the Vercel project's server-side environment settings to enable natural-language advice and receipt scanning. Deterministic calculations continue to work without Gemini.

When changing the backend, redeploy it to Vercel so the fixed API URL serves the updated code. Do not put the Gemini key in an `EXPO_PUBLIC_*` variable or commit it. For natural-language advice, only an aggregate financial summary is sent to Gemini; receipt images are sent for receipt extraction. When Gemini is unavailable, calculations continue to work and the API returns a clear unavailable response for advice or receipt scanning.

## Data and privacy

Cards, transactions, bills, theme, payoff strategy, and profile values are stored asynchronously in Expo AsyncStorage on the device. Existing `fin_*` AsyncStorage keys are migrated to the versioned `fin_app_state_v2` record. A new installation starts with empty financial records. The Profile & Settings screen lets users manage saved profile values and clear device data; the Budget and Bills screens manage transactions and bills.

AsyncStorage is not encrypted storage. FinAgent stores only a card's last four digits, and users should not enter full card numbers, account credentials, or other authentication secrets.

## Checks

```sh
npm run lint
npm test
npm run build
npx expo export --platform web
npx expo-doctor
```
