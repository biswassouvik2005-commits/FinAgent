# FinAgent

FinAgent is an Expo finance app for tracking cards, transactions, budgets, bills, and receipt scans. The Expo Router route in `app/` uses React Native components and supports Android, iOS, and web.

## Run the app

Install dependencies and start Expo:

```sh
npm install
npx expo start
```

Use the Expo CLI to open an Android or iOS development environment, or press `w` to run the web version.

## Connect the API

The AI advisor and receipt scanner use the Express API in `server.ts`. Start it with:

```sh
npm run dev
```

When Expo runs on a device or on its separate web development server, set `EXPO_PUBLIC_API_URL` in `.env` to the address where the API can be reached, for example:

```text
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000
```

Replace the example address with the host's LAN address when testing on a physical device. The app keeps card, transaction, bill, theme, income, and cash values in AsyncStorage.

## Checks

```sh
npm run lint
npx expo-doctor
npx expo export --platform web
```
