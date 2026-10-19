import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';
import { z, ZodError } from 'zod';
import {
  calculateFinancialSummary,
  financeContextSchema,
  type FinanceContext,
} from './src/lib/finance';
import { runFinanceAgent, type ReasoningService } from './server/financeAgent';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const parsedPort = Number.parseInt(process.env.PORT ?? '3000', 10);
const PORT = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : 3000;
const isProduction = process.env.NODE_ENV === 'production';
const maximumReceiptBytes = 10 * 1024 * 1024;
const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const receiptResultSchema = z.object({
  merchant: z.string().trim().min(1).max(200),
  total: z.number().finite().positive().max(1_000_000_000),
  category: z.string().trim().min(1).max(80),
});

app.use(express.json({ limit: '15mb' }));
app.use(cors());
export { app };

function getGeminiClient() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || key === 'undefined') return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: { headers: { 'User-Agent': 'finagent' } },
  });
}

// ==========================================
// 1. ROUTER AGENT & MODEL (Intent Routing Table & Fast Classification)
// 4th Route: "log_expense"
// ==========================================
export const routerModel = {
  routes: ['expense', 'bills', 'investments', 'log_expense'] as const,
  login: '/login',
  chat: '/api/chat',
  receipt: '/api/receipt',
  log_expense: '/api/log_expense',
  systemInstruction: `Classify the user's financial query into exactly one of these strings: 
    "expense" (spending, budgets, general questions), 
    "bills" (subscriptions, recurring costs, due dates), 
    "investments" (stocks, crypto, portfolio growth),
    "log_expense" (when the user states or speaks an expense, purchase, or money spent to record, OR pastes an automated bank/card transaction SMS alert, email receipt, or payment notification, e.g. "Chase Alert: You made a $24.50 transaction at TRADER JOE'S #542 on Oct 19 with card ending 4321. Avail bal: $2,425.50", "Citi Alert: A charge of $68.12 was approved at SHELL OIL 574423 on 10/19/2026. Ref: TXN987261. Balance: $1,280.00", "Spent $14 on lunch at Subway").
    Return ONLY the single word. Do not include punctuation.`,
  classify: (query: string): 'expense' | 'bills' | 'investments' | 'log_expense' => {
    const clean = query.trim().toLowerCase();
    if (
      /(?:alert|notification|authorized|approved|declined|charge of|card ending|avail(?:able)? bal|balance:|ref:|txn|ref #)/i.test(clean) ||
      /(spent|paid|bought|cost|charged)\s*(\$|\d)/i.test(clean) ||
      /\$\s*\d+.*(on|at|for)/i.test(clean) ||
      /(on lunch|on dinner|for coffee|at subway|at starbucks|at walmart|for groceries)/i.test(clean) ||
      /(?:chase|citi|wells fargo|amex|apple card|venmo|paypal).*(?:\$|\d)/i.test(clean)
    ) {
      return 'log_expense';
    }
    if (/(bill|due|subscription|spotify|netflix|utilities|recurring)/i.test(clean)) {
      return 'bills';
    }
    if (/(stock|crypto|invest|portfolio|401k|dividend|asset)/i.test(clean)) {
      return 'investments';
    }
    return 'expense';
  },
};

export interface ExtractedExpense {
  amount: number;
  merchant: string;
  category: string;
  date: string;
  transaction_id?: string;
  remaining_balance?: number;
  card_or_account?: string;
  is_bank_alert?: boolean;
  ai_reply: string;
}

// Fallback rule-based NLP extraction for offline / no-key mode and bank SMS alert parsing
export function parseExpenseFromNaturalLanguage(text: string): ExtractedExpense {
  if (!text || typeof text !== 'string') {
    return {
      amount: 0,
      merchant: 'Expense',
      category: 'General',
      date: 'Today',
      is_bank_alert: false,
      ai_reply: 'Could not parse expense.'
    };
  }
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // Detect bank alert indicators
  const isBankAlert = /(?:alert|notification|authorized|approved|declined|charge of|transaction of|purchase of|avail(?:able)?\s*bal|ending bal|acct bal|balance:|ref:|txn|ref\s*#|card ending|ending in \d{4})/i.test(clean) ||
    /^(?:chase|citi|wells fargo|bofa|bank of america|amex|apple card|capital one|venmo|paypal|discover)/i.test(clean);

  // 1. Extract remaining/available balance (e.g. "Avail bal: $2,425.50", "Balance: $1,280.00", "Available balance: $3,120.45")
  let remaining_balance: number | undefined;
  const balanceMatch = clean.match(/(?:avail(?:able)?\s*bal(?:ance)?|total\s*bal(?:ance)?|acct\s*bal(?:ance)?|ending\s*bal(?:ance)?|bal(?:ance)?):?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i);
  if (balanceMatch && balanceMatch[1]) {
    const parsedBal = parseFloat(balanceMatch[1].replace(/,/g, ''));
    if (Number.isFinite(parsedBal)) {
      remaining_balance = parsedBal;
    }
  }

  // 2. Extract transaction amount (e.g. "$24.50 transaction", "charge of $68.12", "$14 on lunch")
  let amount = 0;
  const alertAmtMatch = clean.match(/(?:charge of|transaction of|purchase of|made a|payment of|spent|paid|amount:?)\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (alertAmtMatch && alertAmtMatch[1]) {
    amount = parseFloat(alertAmtMatch[1].replace(/,/g, ''));
  } else {
    const allDollarMatches = [...clean.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/gi)];
    for (const m of allDollarMatches) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (remaining_balance != null && Math.abs(val - remaining_balance) < 0.001) {
        continue;
      }
      amount = val;
      break;
    }
    if (!amount) {
      const genericNumber = clean.match(/(?:^|\s)(\d+(?:\.\d{1,2})?)(?:\s*(?:dollars?|bucks?|usd))?/i);
      if (genericNumber) {
        amount = parseFloat(genericNumber[1]);
      }
    }
  }

  // 3. Extract transaction ID / reference code (e.g. "Ref: TXN987261", "Txn ID: 59382", "Ref #12345")
  let transaction_id: string | undefined;
  const txnMatch = clean.match(/(?:ref(?:erence)?\s*(?:#|id|no\.?)?|txn(?:\s*id)?|auth(?:\s*code)?|confirmation\s*#?)\s*[:#]?\s*([A-Za-z0-9-]+)/i);
  if (txnMatch && txnMatch[1]) {
    transaction_id = txnMatch[1].trim();
  }

  // 4. Extract card or account (e.g. "card ending 4321", "card ending in 8899", "Apple Card", "Venmo", "Checking ...1234")
  let card_or_account: string | undefined;
  const cardEndingMatch = clean.match(/(?:card|acct|account)\s*(?:ending(?:\s*in)?|#)?\s*[:#]?\s*(\d{4})/i);
  if (cardEndingMatch && cardEndingMatch[1]) {
    card_or_account = `Card ending ${cardEndingMatch[1].trim()}`;
  } else if (/apple card/i.test(clean)) {
    card_or_account = 'Apple Card';
  } else if (/venmo/i.test(clean)) {
    card_or_account = 'Venmo';
  } else if (/chase/i.test(clean)) {
    card_or_account = 'Chase Checking';
  } else if (/citi/i.test(clean)) {
    card_or_account = 'Citi Card';
  }

  // 5. Extract merchant (e.g. "at TRADER JOE'S #542", "at SHELL OIL 574423", "Paid John Doe $35", "at Subway")
  let merchant = '';
  const atMatch = clean.match(/(?:at|from|to|with|paid)\s+([A-Za-z0-9\s'&.#\-]+?)(?:\s*(?:\.|\$|\s+(?:for|on|yesterday|today|with|using|in|ref|ref:|txn|bal|balance|avail|total)|$))/i);
  if (atMatch && atMatch[1]) {
    merchant = atMatch[1].trim();
  }
  if (!merchant || merchant.toLowerCase() === 'card' || merchant.toLowerCase() === 'you') {
    const commonMerchants = ['subway', 'starbucks', 'walmart', 'target', 'amazon', 'uber', 'lyft', 'shell', 'mcdonalds', 'whole foods', "trader joe's"];
    const found = commonMerchants.find(m => lower.includes(m));
    merchant = found ? (found.charAt(0).toUpperCase() + found.slice(1)) : (isBankAlert ? 'Card Transaction' : 'Expense');
  }

  // Clean store #, POS, terminal digits
  merchant = merchant
    .replace(/\s*(?:#\d+|\b\d{3,}\b|\bstore\b\s*\d*|\bpos\b).*$/i, '')
    .trim();
  merchant = merchant.replace(/[.#\-,]+$/, '').trim();

  if (merchant.length > 2 && merchant === merchant.toUpperCase()) {
    merchant = merchant.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // 6. Extract date (e.g. "on Oct 19", "on 10/19/2026", "on 10/18")
  let date = 'Today';
  const dateMatch = clean.match(/(?:on|date:?)\s+([A-Za-z]{3}\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i);
  if (dateMatch && dateMatch[1]) {
    date = dateMatch[1].trim();
  }

  // 7. Extract category
  let category = 'General';
  const mLower = merchant.toLowerCase();
  if (/groceries|grocery|supermarket|apples|milk|produce|trader joe|whole foods/i.test(lower) || /trader joe|safeway|kroger|aldi|publix/i.test(mLower)) {
    category = 'Groceries';
  } else if (/lunch|dinner|breakfast|meal|food|subway|starbucks|mcdonalds|burger|sandwich|pizza|coffee|cafe|restaurant|dining|snack|drink/i.test(lower) || /starbucks|subway|mcdonald/i.test(mLower)) {
    category = 'Dining';
  } else if (/gas|fuel|shell|chevron|exxon|uber|lyft|taxi|subway fare|train|bus|transport|parking|toll/i.test(lower) || /shell|chevron|exxon|bp|mobil/i.test(mLower)) {
    category = 'Transportation';
  } else if (/movie|cinema|netflix|spotify|game|entertainment|concert|ticket/i.test(lower)) {
    category = 'Entertainment';
  } else if (/clothes|shoes|amazon|target|shopping|mall|electronics|store|retail/i.test(lower) || /target|walmart|amazon/i.test(mLower)) {
    category = 'Shopping';
  } else if (/bill|electric|power|water|internet|utility|utilities|wifi|phone|rent/i.test(lower)) {
    category = 'Utilities';
  } else if (/gym|pharmacy|medicine|doctor|health|dentist/i.test(lower) || /cvs|walgreens/i.test(mLower)) {
    category = 'Healthcare';
  }

  // 8. Generate appropriate AI reply
  let ai_reply = '';
  if (isBankAlert) {
    if (remaining_balance != null) {
      ai_reply = `Bank alert parsed: Logged $${amount.toFixed(2)} at ${merchant} under ${category}. Checking balance reconciled to $${remaining_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}!`;
    } else {
      ai_reply = `Bank alert parsed: Logged $${amount.toFixed(2)} at ${merchant} under ${category}. Added to your transactions!`;
    }
  } else {
    ai_reply = `Logged $${amount.toFixed(2)} at ${merchant} for ${category}. Added to your transactions!`;
  }

  return {
    amount,
    merchant,
    category,
    date,
    transaction_id,
    remaining_balance,
    card_or_account,
    is_bank_alert: isBankAlert,
    ai_reply,
  };
}

// ==========================================
// MOCK DATABASE & PERSISTENT STORAGE
// ==========================================
export interface UserData {
  accounts: {
    checking: number;
    savings: number;
    crypto: number;
    stocks: number;
  };
  monthlyBudget: number;
  recentTransactions: Array<{
    id: number | string;
    date: string;
    merchant: string;
    title?: string;
    amount: number;
    category: string;
    type?: string;
    recurring?: boolean;
  }>;
  upcomingBills: Array<{
    name: string;
    dueDate: string;
    amount: number;
  }>;
}

export const DEFAULT_USER_DATA: UserData = {
  accounts: { checking: 2450.00, savings: 8500.00, crypto: 1200.00, stocks: 4500.00 },
  monthlyBudget: 300.00,
  recentTransactions: [
    { id: 1, date: "2026-10-14", merchant: "Whole Foods", title: "Whole Foods", amount: 120.50, category: "Groceries", type: "expense" },
    { id: 2, date: "2026-10-16", merchant: "Netflix", title: "Netflix", amount: 15.99, category: "Subscriptions", recurring: true, type: "expense" }
  ],
  upcomingBills: [
    { name: "Electricity", dueDate: "2026-10-20", amount: 85.00 },
    { name: "Spotify", dueDate: "2026-10-22", amount: 10.99 }
  ]
};

export let mockUserData: UserData = JSON.parse(JSON.stringify(DEFAULT_USER_DATA));

export function saveUserData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(mockUserData, null, 2), 'utf8');
    console.log(`[Storage] Saved live user data to ${DATA_FILE}`);
  } catch (err: any) {
    console.error('[Storage] Error saving to user_data.json:', err.message);
  }
}

export function loadUserData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        mockUserData = {
          ...DEFAULT_USER_DATA,
          ...parsed,
          accounts: {
            ...DEFAULT_USER_DATA.accounts,
            ...(parsed.accounts || {})
          },
          recentTransactions: Array.isArray(parsed.recentTransactions)
            ? parsed.recentTransactions
            : DEFAULT_USER_DATA.recentTransactions
        };
        console.log(`[Storage] Successfully loaded live user data from ${DATA_FILE}`);
        return;
      }
    }
  } catch (err: any) {
    console.warn('[Storage] Error loading user_data.json, using default data:', err.message);
  }
  saveUserData();
}

loadUserData();

export function recordExpense({
  amount,
  merchant,
  category,
  date,
  transaction_id,
  remaining_balance,
  card_or_account,
  is_bank_alert,
}: {
  amount: number;
  merchant: string;
  category: string;
  date?: string;
  transaction_id?: string;
  remaining_balance?: number;
  card_or_account?: string;
  is_bank_alert?: boolean;
}) {
  const numAmount = Math.max(0, Number(amount) || 0);
  const validMerchant = String(merchant || 'Expense').trim();
  const validCategory = String(category || 'General').trim();
  const validDate = String(date || new Date().toISOString().split('T')[0]).trim();

  const newTx = {
    id: `tx-${Date.now()}`,
    date: validDate,
    merchant: validMerchant,
    title: validMerchant,
    amount: numAmount,
    category: validCategory,
    transaction_id: transaction_id || undefined,
    remaining_balance: (typeof remaining_balance === 'number' && Number.isFinite(remaining_balance)) ? remaining_balance : undefined,
    card_or_account: card_or_account || undefined,
    is_bank_alert: Boolean(is_bank_alert),
    type: 'expense' as const
  };

  if (numAmount > 0 || (typeof remaining_balance === 'number' && remaining_balance >= 0)) {
    mockUserData.recentTransactions.unshift(newTx);

    // If alert provides exact remaining/available balance, automatically reconcile checking account
    if (typeof remaining_balance === 'number' && Number.isFinite(remaining_balance) && remaining_balance >= 0) {
      mockUserData.accounts.checking = Math.round(remaining_balance * 100) / 100;
      console.log(`[Reconciliation] Reconciled checking account to alert balance: $${mockUserData.accounts.checking.toFixed(2)}`);
    } else {
      mockUserData.accounts.checking = Math.max(0, Math.round(((mockUserData.accounts.checking || 0) - numAmount) * 100) / 100);
      console.log(`[Live State] Deducted $${numAmount.toFixed(2)} from checking. New checking: $${mockUserData.accounts.checking.toFixed(2)}`);
    }

    saveUserData();
  }

  return newTx;
}

// --- POST /login ---
app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  // Generate session token
  const access_token = `fin_tok_${Buffer.from(username).toString('base64')}_${Date.now()}`;
  return res.json({
    access_token,
    user: {
      username,
      name: username.charAt(0).toUpperCase() + username.slice(1),
    },
  });
});

// --- POST /api/chat ---
app.post('/api/chat', async (req, res) => {
  const { message, userContext } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Extract ONLY user-entered credit cards, accounts, and financial profile (zero hardcoded mock data)
  const userCards = Array.isArray(userContext?.cards) ? userContext.cards : [];
  const userBalance = typeof userContext?.totalBalance === 'number' && Number.isFinite(userContext.totalBalance) ? userContext.totalBalance : 0;
  const userIncome = typeof userContext?.monthlyIncome === 'number' && Number.isFinite(userContext.monthlyIncome) ? userContext.monthlyIncome : 0;
  const userBills = Array.isArray(userContext?.bills) ? userContext.bills : [];
  const userBreakdown = Array.isArray(userContext?.breakdown) ? userContext.breakdown : [];

  // Calculate card metrics
  const totalCardDebt = userCards.reduce((acc: number, c: any) => acc + (Number(c.balance) || 0), 0);
  const totalCreditLimit = userCards.reduce((acc: number, c: any) => acc + (Number(c.creditLimit) || 0), 0);
  const cardUtilization = totalCreditLimit > 0 ? ((totalCardDebt / totalCreditLimit) * 100).toFixed(1) : '0.0';

  // 4th route: Conversational & Bank Alert Expense Logging
  if (routerModel.classify(message) === 'log_expense') {
    let extracted: ExtractedExpense = parseExpenseFromNaturalLanguage(message);
    const ai = getGeminiClient();
    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `Extract transaction details from user statement or bank SMS alert: "${message}".
Return:
- amount: positive number
- merchant: clean string (remove store hashes, POS codes, terminal numbers)
- category: string (Dining, Groceries, Shopping, Transportation, Entertainment, Utilities, Healthcare, Other)
- date: string (e.g. "Today" or YYYY-MM-DD or readable date)
- transaction_id: string reference ID or auth code if present (or null)
- remaining_balance: number if available/ending balance is reported (or null)
- card_or_account: string if card or account is mentioned (or null)
- is_bank_alert: boolean (true if automated SMS/alert, false if conversational)
- ai_reply: friendly confirmation message acknowledging the transaction and if balance was reconciled.`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                amount: { type: Type.NUMBER },
                merchant: { type: Type.STRING },
                category: { type: Type.STRING },
                date: { type: Type.STRING },
                transaction_id: { type: Type.STRING },
                remaining_balance: { type: Type.NUMBER },
                card_or_account: { type: Type.STRING },
                is_bank_alert: { type: Type.BOOLEAN },
                ai_reply: { type: Type.STRING },
              },
              required: ['amount', 'merchant', 'category', 'ai_reply'],
            },
          },
        });
        if (response.text) {
          const parsed = JSON.parse(response.text.trim());
          const amt = Number(parsed.amount);
          if (Number.isFinite(amt) && amt > 0 && parsed.merchant) {
            extracted = {
              amount: amt,
              merchant: String(parsed.merchant).trim(),
              category: parsed.category ? String(parsed.category).trim() : extracted.category,
              date: parsed.date || extracted.date || 'Today',
              transaction_id: parsed.transaction_id || extracted.transaction_id,
              remaining_balance: typeof parsed.remaining_balance === 'number' && Number.isFinite(parsed.remaining_balance) ? parsed.remaining_balance : extracted.remaining_balance,
              card_or_account: parsed.card_or_account || extracted.card_or_account,
              is_bank_alert: parsed.is_bank_alert ?? extracted.is_bank_alert,
              ai_reply: parsed.ai_reply || extracted.ai_reply,
            };
          }
        }
      } catch (err: any) {
        console.warn('[FinAgent] Gemini chat log_expense fallback active:', err?.message || 'unknown error');
      }
    }

    const newTx = recordExpense({
      amount: extracted.amount,
      merchant: extracted.merchant,
      category: extracted.category,
      date: extracted.date,
      transaction_id: extracted.transaction_id,
      remaining_balance: extracted.remaining_balance,
      card_or_account: extracted.card_or_account,
      is_bank_alert: extracted.is_bank_alert,
    });

    let totalBalance: number;
    if (typeof extracted.remaining_balance === 'number' && Number.isFinite(extracted.remaining_balance) && extracted.remaining_balance >= 0) {
      totalBalance = extracted.remaining_balance;
    } else if (typeof userBalance === 'number' && userBalance > 0) {
      totalBalance = Math.max(0, userBalance - extracted.amount);
    } else {
      totalBalance = Math.round(Object.values(mockUserData.accounts).reduce((a, b) => a + b, 0) * 100) / 100;
    }

    return res.json({
      ai_reply: extracted.ai_reply,
      total_balance: totalBalance,
      accounts: mockUserData.accounts,
      recentTransactions: mockUserData.recentTransactions,
      budget_status: 'On Track',
      category_breakdown: userBreakdown,
      upcoming_bills: userBills,
      portfolio_health: `Credit Utilization: ${cardUtilization}%`,
      logged_expense: {
        ...newTx,
        transaction_id: extracted.transaction_id,
        remaining_balance: extracted.remaining_balance,
        card_or_account: extracted.card_or_account,
        is_bank_alert: extracted.is_bank_alert,
      },
      transaction: newTx,
      intent: 'log_expense',
    });
  }

  // If Gemini API is available, generate response with gemini-3.8-flash
  const ai = getGeminiClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `You are the Taskade AI Personal Finance Manager Agent (taskade.com/agents/personal/personal-finance-manager).
Your persona: Expert personal financial advisor, automated budgeting strategist, and credit card auditor.
User query: "${message}".

User's Real Profile & Credit Cards (USE ONLY THESE ACTUAL USER INPUTS IN YOUR ADVICE. NEVER INVENT OR HARDCODE AMOUNTS):
- Liquid Cash / Checking: $${userBalance.toFixed(2)}
- Stated Monthly Income: $${userIncome.toFixed(2)}
- User's Connected Credit Cards & Accounts: ${JSON.stringify(userCards)}
- Total Credit Card Debt: $${totalCardDebt.toFixed(2)}
- Total Credit Line: $${totalCreditLimit.toFixed(2)}
- Current Overall Utilization: ${cardUtilization}%
- Category Expenses: ${JSON.stringify(userBreakdown)}
- Upcoming Bills: ${JSON.stringify(userBills)}

Directives:
1. Ground your answers 100% in the user's provided numbers. If a value is 0 or unset (e.g. no cards, no income), prompt the user to input it in the app.
2. When asked about cards, debts, limits, or which card to pay first, analyze their specific cards, comparing APRs and balances directly.
3. Emphasize keeping credit utilization below 30% (ideally under 10%).
4. Keep the response friendly, structured, and actionable.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ai_reply: { type: Type.STRING, description: 'Direct conversational reply to user with structured markdown or clear advice' },
              total_balance: { type: Type.NUMBER, description: 'Total available balance in USD' },
              budget_status: { type: Type.STRING, description: 'Short status like "On Track", "Over Budget", "Optimized", "Caution"' },
              category_breakdown: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    amount: { type: Type.NUMBER },
                  },
                  required: ['category', 'amount'],
                },
              },
              upcoming_bills: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    bill_name: { type: Type.STRING },
                    due_date: { type: Type.STRING },
                    amount: { type: Type.NUMBER },
                  },
                  required: ['bill_name', 'due_date', 'amount'],
                },
              },
              portfolio_health: { type: Type.STRING, description: 'Short portfolio assessment' },
            },
            required: ['ai_reply', 'total_balance', 'budget_status'],
          },
        },
      });

      if (response.text) {
        const parsed = JSON.parse(response.text.trim());
        return res.json({
          ai_reply: parsed.ai_reply || 'Here is your current financial analysis.',
          total_balance: parsed.total_balance ?? userBalance,
          budget_status: parsed.budget_status || (Number(cardUtilization) > 30 ? 'High Utilization' : 'On Track'),
          category_breakdown: parsed.category_breakdown || userBreakdown,
          upcoming_bills: parsed.upcoming_bills || userBills,
          portfolio_health: parsed.portfolio_health || `Credit Utilization: ${cardUtilization}%`,
        });
      }
    } catch (err: any) {
      console.warn('[FinAgent] Gemini chat fallback active:', err?.message || 'unknown error');
    }
  }

  // Local fallback response engine with live user credit cards and accounts
  const lower = message.toLowerCase();
  let replyText = "I've analyzed your financial profile and accounts.";
  let status = Number(cardUtilization) > 30 ? 'Review Utilization' : 'On Track';
  let portfolio = `Card Utilization: ${cardUtilization}%`;

  if (lower.includes('card') || lower.includes('credit') || lower.includes('utilization') || lower.includes('apr') || lower.includes('debt')) {
    if (userCards.length === 0) {
      replyText = `💳 **Credit Cards & Debt Analysis**\n\nYou currently haven't added any credit cards yet. Go to the **Cards** tab to add your credit cards (balance, limit, APR, due date) so I can calculate your credit utilization ratio and optimal debt payoff strategy!`;
    } else {
      const highestAprCard = [...userCards].sort((a: any, b: any) => (Number(b.apr) || 0) - (Number(a.apr) || 0))[0];

      replyText = `💳 **Credit Cards & Debt Optimization Audit**\n\n• **Connected Cards**: ${userCards.length} (${userCards.map((c: any) => `${c.cardName} ending in ${c.last4 || '••••'}`).join(', ')})\n• **Total Outstanding Balance**: $${totalCardDebt.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n• **Total Credit Limit**: $${totalCreditLimit.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n• **Overall Utilization Ratio**: **${cardUtilization}%** (${Number(cardUtilization) <= 30 ? '✅ Healthy (Under 30% threshold)' : '⚠️ Warning: Above recommended 30% ceiling'})\n• **Highest APR Card**: **${highestAprCard.cardName}** at **${highestAprCard.apr}% APR** ($${Number(highestAprCard.balance).toFixed(2)} balance). I recommend prioritizing this card first (Avalanche Method) to minimize compound interest fees!`;
    }
  } else if (lower.includes('/budget') || lower.includes('50/30/20') || lower.includes('budget plan') || lower.includes('create monthly budget') || lower.includes('budget')) {
    if (userIncome <= 0) {
      replyText = `📊 **50/30/20 Monthly Budget Plan**\n\nYou haven't configured a monthly income yet. Please go to the **Budget** tab and enter your monthly income so I can calculate your exact 50% Needs, 30% Wants, and 20% Savings targets!`;
    } else {
      const needs50 = userIncome * 0.5;
      const wants30 = userIncome * 0.3;
      const savings20 = userIncome * 0.2;
      replyText = `📊 **50/30/20 Monthly Budget Plan (Based on your $${userIncome.toLocaleString()} Income)**\n\n• **Needs (50% Target: $${needs50.toFixed(2)})**: Housing, Groceries, Utilities, Minimum Debt Payments.\n• **Wants (30% Target: $${wants30.toFixed(2)})**: Dining out, Entertainment, Subscriptions.\n• **Savings & Debt Elimination (20% Target: $${savings20.toFixed(2)})**: High-yield emergency fund and extra credit card principal reduction.\n\nYour stated liquid cash reserve is **$${userBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}**.`;
      status = 'Optimized';
    }
  } else if (lower.includes('/trends') || lower.includes('overspend') || lower.includes('habit') || lower.includes('spending habit')) {
    replyText = `💡 **Spending Habits & Credit Utilization Audit**\n\n• **Credit Utilization**: Currently standing at **${cardUtilization}%** across all registered credit cards.\n• **Cash-to-Debt Ratio**: You have $${userBalance.toFixed(2)} liquid cash vs $${totalCardDebt.toFixed(2)} total credit card balances.\n• **Recommendation**: Keeping individual card utilization below 10% on reporting dates optimizes FICO score gains.`;
  } else if (lower.includes('/goal') || lower.includes('emergency fund') || lower.includes('savings goal') || lower.includes('target') || lower.includes('saving')) {
    if (userIncome <= 0) {
      replyText = `🎯 **Savings Goal & Milestone Forecast**\n\n• **Liquid Reserves**: $${userBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n\nPlease configure your monthly income in the **Budget** tab so I can project your emergency fund runway and savings timeline.`;
    } else {
      replyText = `🎯 **Savings Goal & Milestone Forecast**\n\n• **Liquid Reserves**: $${userBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n• **Safety Margin**: At your monthly income of $${userIncome.toLocaleString()}, your current cash represents **${(userBalance / (userIncome * 0.7)).toFixed(1)} months** of essential baseline runway.\n• **Next Milestone**: Aim for 3 to 6 months of essential reserves before investing aggressively in non-tax-advantaged accounts.`;
    }
  } else if (lower.includes('/report') || lower.includes('health report') || lower.includes('summary') || lower.includes('financial report')) {
    replyText = `📈 **Personal Finance Executive Health Report**\n\n• **Net Liquid Balance**: $${userBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n• **Total Credit Card Debt**: $${totalCardDebt.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n• **Aggregate Credit Utilization**: ${cardUtilization}%\n• **Net Worth Estimate**: $${(userBalance - totalCardDebt).toLocaleString('en-US', { minimumFractionDigits: 2 })}\n• **Health Assessment**: ${Number(cardUtilization) <= 30 ? 'Strong stability with controlled credit exposure.' : 'Focus on paying down high-APR credit card balances.'}`;
  } else if (lower.includes('bill') || lower.includes('upcoming') || lower.includes('due') || lower.includes('subscription')) {
    if (userBills.length === 0) {
      replyText = `🔔 **Upcoming Bills & Payment Schedule**\n\nYou currently have no upcoming bills recorded. Go to the **Bills** tab to add your recurring subscriptions and payments to track due dates!`;
    } else {
      const totalDue = userBills.reduce((acc: number, b: any) => acc + (Number(b.amount) || 0), 0);
      replyText = `🔔 **Upcoming Bills & Payment Schedule**\n\nYou have ${userBills.length} recorded obligations totaling **$${totalDue.toFixed(2)}**:\n${userBills.slice(0, 5).map((b: any) => `• ${b.bill_name}: $${Number(b.amount).toFixed(2)} (${b.due_date || 'Due soon'})`).join('\n')}\n\nYour liquid balance of $${userBalance.toLocaleString()} provides coverage for your recorded dues.`;
    }
  } else {
    if (userCards.length === 0 && userBalance === 0 && userIncome === 0) {
      replyText = `Hello! I am your **FinAgent AI Financial Advisor**.\n\nYou have not entered any accounts, credit cards, or monthly income yet. Add your accounts in the app tabs or enter your numbers directly in chat, and I will analyze your finances using 100% real data!`;
    } else {
      replyText = `Hello! I'm your **FinAgent AI Financial Advisor**.\n\nI'm customized with your real credit cards and financial inputs:\n• **${userCards.length} Credit Cards** registered (Overall Utilization: **${cardUtilization}%**)\n• **Liquid Cash Balance**: $${userBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n• **Monthly Income**: $${userIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n\nAsk me anything about which card to pay first, reducing interest, or optimizing your 50/30/20 budget!`;
    }
  }

  return res.json({
    ai_reply: replyText,
    total_balance: userBalance,
    budget_status: status,
    category_breakdown: userBreakdown,
    upcoming_bills: userBills,
    portfolio_health: portfolio,
  });
});

// --- POST /api/log_expense & /log_expense (Conversational Expense Logging via Text & Voice) ---
async function handleLogExpense(req: express.Request, res: express.Response) {
  const { message, text, userContext } = req.body || {};
  const query = message || text;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Message or text query is required' });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return response.status(503).json({ error: 'Receipt scanning is unavailable because the server AI service is not configured.' });
  }

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Image } },
          { text: 'Read the receipt image. Return the printed merchant, final amount charged as a positive number, and a concise spending category. Do not guess missing or unreadable values.' },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            merchant: { type: Type.STRING },
            total: { type: Type.NUMBER },
            category: { type: Type.STRING },
          },
          required: ['merchant', 'total', 'category'],
        },
      },
    });
    if (!result.text) throw new Error('The receipt service returned an empty response.');
    const parsed = receiptResultSchema.parse(JSON.parse(result.text.trim()));
    return response.json({ ...parsed, date: new Date().toLocaleDateString('en-US') });
  } catch (error) {
    console.error('[FinAgent] receipt analysis failed', error);
    return response.status(502).json({
      error: 'FinAgent could not read that receipt. Try a clearer image.',
    });
  }
});

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({ error: 'Request body must contain valid JSON.' });
    return;
  }
  if (error?.type === 'entity.too.large') {
    response.status(413).json({ error: 'Request body is too large.' });
    return;
  }
  console.error('[FinAgent] request failed', error);
  response.status(500).json({ error: 'The server could not process this request.' });
};

async function startServer() {
  if (isProduction) {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_request, response) => {
      response.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.use(errorHandler);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FinAgent] Server listening on http://0.0.0.0:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch(error => {
    console.error('Failed to start FinAgent server:', error);
    process.exitCode = 1;
  });
}
