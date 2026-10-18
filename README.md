# FinAgent

FinAgent is an Expo finance app for tracking cards, transactions, budgets, bills, and receipt scans. The Expo Router route in `app/` uses React Native components and supports Android, iOS, and web.

## Run the app

Install dependencies and start Expo:

```sh
npm install
npx expo start
```

Press `w` in the Expo terminal to open the same app in a browser.

## Connect the API

The advisor and receipt scanner use the Express API in `server.ts`. Start the API in a second terminal:

```sh
npm run dev
```

For a physical Expo Go device, set `EXPO_PUBLIC_API_URL` in the project-root `.env.local` (or `.env`) to the computer's reachable LAN address:

```text
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000
```

Replace `192.168.1.20` with the computer's current Wi-Fi IPv4 address. `.env.local` takes priority over `.env`, so update or remove any stale URL in `.env.local`. Keep the phone and computer on the same Wi-Fi network, allow incoming connections to port 3000 in the computer's firewall, and fully restart Expo and reload the app after changing the URL. The API binds to `0.0.0.0`.

Natural-language financial advice and receipt reading require a Gemini key set only in the API server environment. For PowerShell:

```powershell
$env:GEMINI_API_KEY = "your-server-side-key"
npm run dev
```

Do not add the key to an `EXPO_PUBLIC_*` variable or commit it. Deterministic calculations (arithmetic, budget allocation, balances, utilization, category totals, bill totals, cash-only affordability checks, and debt ordering) run in code without Gemini. For natural-language advice, only an aggregate financial summary is sent to Gemini; receipt images are sent for receipt extraction. When Gemini is unavailable, calculations continue to work and the API returns a clear unavailable response for advice or receipt scanning.

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
