# FinAgent — AI-Powered Personal Finance Assistant

> A cross-platform mobile app (iOS, Android, Web) that puts your entire financial picture in one place, with a conversational AI agent that answers questions, scans receipts, and helps you stay on budget.

---

## ✨ What is FinAgent?

FinAgent is a personal finance assistant built with **Expo / React Native**. It runs natively on Android and iOS, and also on the web — all from a single codebase.

Users set up their financial baseline once (income, cash reserve, credit cards) and from that moment on the app tracks spending, bills, and debt payoff — and lets them ask natural-language questions like:
- *"Am I on budget this month?"*
- *"Which card should I pay off first?"*
- *"How many months of runway do I have?"*
- *"Scan this receipt and log the expense."*

---

## 📱 Features

### 🏠 Home Dashboard
- Personalised greeting with your name
- **Daily safe-to-spend** — how much you can spend today without blowing the month
- Live 50 / 30 / 20 budget ring (Needs / Wants / Savings & Debt)
- Quick-action buttons: Add Card, Scan Receipt, Ask AI, Log Transaction
- Net-worth summary card (Cash vs. Card Debt)
- Recent activity feed with category icons

### 💳 Cards & Debt
- Add Visa, Mastercard, Amex, and Discover cards with balance, credit limit, APR, and due date
- **Total credit utilisation** displayed in real time
- **Payoff order optimiser** — choose Avalanche (highest APR first) or Snowball (lowest balance first) strategy
- Make payments and watch balances update instantly

### 🤖 FinAgent AI Chat
A LangGraph-powered agent classifies every question into one of nine intents and routes it to the right tool:

| Intent | What it does |
|---|---|
| **Arithmetic** | Safe, sandboxed calculator (no hallucinated numbers) |
| **Budget** | 50/30/20 targets from your monthly income |
| **Bills** | Lists unpaid bills with amounts and due dates |
| **Income** | Income vs. expenses, net cash flow |
| **Spending** | Category breakdown from your transaction ledger |
| **Runway** | How many months your cash covers at your expense rate |
| **Summary** | Full financial health report |
| **Debt** | Card utilisation + avalanche/snowball payoff order |
| **Advice** | Open-ended questions answered by Gemini with only aggregate, anonymised data |

> Gemini is only shown an **aggregate summary** — never individual transactions, full card numbers, or raw balances.

### 📊 Budget & Activity
- 50/30/20 progress bars showing real vs. target spending
- **Spending by category** pie chart
- Full **transaction ledger** with search and type filter (Income / Expense)
- Add, edit, and delete transactions manually

### 📅 Bills
- Track recurring bills and subscriptions with due dates, amounts, and paid/unpaid state
- Mark bills as paid with a single tap
- Upcoming bill totals surface in the AI chat as a rich widget

### 🧾 Receipt Scanner
- Take a photo or pick from your library
- **Gemini Vision** extracts the merchant name, total amount, and spending category automatically
- One tap logs the scanned receipt as an expense in your ledger
- Works without storing images in the cloud

### 🌐 Multi-language Support
The entire UI is translated into **9 languages** — your selection is persisted on-device:

English · Español · Français · Deutsch · Português · हिन्दी · 中文 · 日本語 · العربية

### 🎨 Dark / Light Theme
Toggle between a dark (OLED-friendly) and light theme at any time. Your preference is saved automatically.

---

## 🏗️ Architecture

```
FinAgent (Expo / React Native)
│
├── app/                        # Expo Router — screen entry points
└── src/
    ├── components/
    │   ├── FinAgentApp.tsx      # Main app shell (all screens, navigation, modals)
    │   ├── NetWorthChart.tsx    # Animated SVG net-worth trend chart
    │   └── PieChart.tsx        # Category spending pie chart
    └── lib/
        ├── api.ts              # Axios client → deployed API
        ├── finance.ts          # Pure financial calculations (Zod-validated)
        ├── i18n.ts             # i18next translations (9 languages)
        └── storage.ts          # AsyncStorage helpers
```

The AI backend is deployed separately. The app communicates with it over HTTPS — no API keys or server code are bundled in the app.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- Expo CLI (`npm install -g expo-cli`) — or use `npx`

### 1. Install dependencies

```sh
npm install
```

### 2. Configure the API URL

Copy the example env file and update the URL if you're running the backend locally:

```sh
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | Deployed Vercel URL | Base URL for the FinAgent API |

### 3. Start the Expo dev server

```sh
npm start
```

Press **`a`** for Android, **`i`** for iOS, **`w`** to open in a browser.

---

## 🔒 Privacy & Data Storage

- All financial data (cards, transactions, bills, profile) is stored **on-device** using `AsyncStorage` — never on a server.
- Only an **aggregate summary** (totals, not individual transactions) is sent to Gemini when you ask a natural-language question.
- Receipt images are sent to Gemini for OCR extraction and are **not stored** in the cloud.
- FinAgent stores only the **last 4 digits** of card numbers. Never enter full card numbers.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Mobile App | Expo SDK 57 · React Native 0.86 · Expo Router |
| Language | TypeScript |
| UI | React Native core components · Ionicons · react-native-svg |
| State | React `useState` / `useRef` + AsyncStorage |
| Internationalisation | i18next · react-i18next |
| HTTP Client | Axios |
| Validation | Zod |
| Build & Distribution | EAS Build |

---

## 📦 Build & Distribution

### Development build

```sh
npx eas build --profile development --platform android
# or
npx eas build --profile development --platform ios
```

### Production build

```sh
npx eas build --profile production --platform all
```

A pre-built APK (`FinsAI.apk`) is included in this repository for quick demo installation on Android.

---

## ✅ Quality Checks

```sh
npm run lint   # TypeScript type-check
npm test       # Unit tests (finance calculations, i18n, API client, storage)
```

---

## 📄 License

MIT — see [LICENSE](LICENSE).
