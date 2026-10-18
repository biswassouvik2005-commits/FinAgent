// ============================================================================
// FinAgent Server & Conversational Expense Logging Entrypoint (server.js)
// 4th route: "log_expense"
// ============================================================================

export const routerModel = {
  routes: ['expense', 'bills', 'investments', 'log_expense'],
  login: '/login',
  chat: '/api/chat',
  receipt: '/api/receipt',
  log_expense: '/api/log_expense',
  systemInstruction: `Classify the user's financial query into exactly one of these strings: 
    "expense" (spending, budgets, general questions), 
    "bills" (subscriptions, recurring costs, due dates), 
    "investments" (stocks, crypto, portfolio growth),
    "log_expense" (when the user states or speaks an expense, purchase, or money spent to record, e.g. "Spent $14 on lunch at Subway", "Bought coffee for $5 at Starbucks").
    Return ONLY the single word. Do not include punctuation.`,
  classify: (query) => {
    const clean = String(query || '').trim().toLowerCase();
    if (
      /(spent|paid|bought|cost|charged)\s*(\$|\d)/i.test(clean) ||
      /\$\s*\d+.*(on|at|for)/i.test(clean) ||
      /(on lunch|on dinner|for coffee|at subway|at starbucks|at walmart|for groceries)/i.test(clean)
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
  }
};

export function fallbackParseExpense(text) {
  if (!text || typeof text !== 'string') {
    return { amount: 0, merchant: 'Expense', category: 'General', date: 'Today', ai_reply: 'Could not parse expense.' };
  }
  const clean = text.trim();

  // Extract amount
  let amount = 0;
  const explicitDollar = clean.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  const spentPattern = clean.match(/(?:spent|paid|bought|cost|charged)\s*(?:\$)?\s*(\d+(?:\.\d{1,2})?)/i);
  const genericNumber = clean.match(/(?:^|\s)(\d+(?:\.\d{1,2})?)(?:\s*(?:dollars?|bucks?|usd))?/i);
  if (explicitDollar) {
    amount = parseFloat(explicitDollar[1]);
  } else if (spentPattern) {
    amount = parseFloat(spentPattern[1]);
  } else if (genericNumber) {
    amount = parseFloat(genericNumber[1]);
  }

  // Extract merchant
  let merchant = '';
  const atMatch = clean.match(/(?:at|from|to|with)\s+([A-Za-z0-9\s'&]+?)(?:\s+(?:for|on|yesterday|today|with|using|in|\.|$)|$)/i);
  if (atMatch && atMatch[1]) {
    merchant = atMatch[1].trim();
  } else {
    const commonMerchants = ['subway', 'starbucks', 'walmart', 'target', 'amazon', 'uber', 'lyft', 'shell', 'mcdonalds', 'whole foods', "trader joe's"];
    const found = commonMerchants.find(m => clean.toLowerCase().includes(m));
    merchant = found ? (found.charAt(0).toUpperCase() + found.slice(1)) : 'Expense';
  }

  // Extract category
  const lower = clean.toLowerCase();
  let category = 'General';
  if (/groceries|grocery|supermarket|apples|milk|produce/i.test(lower)) {
    category = 'Groceries';
  } else if (/lunch|dinner|breakfast|meal|food|subway|starbucks|mcdonalds|burger|sandwich|pizza|coffee|cafe|restaurant|dining|snack|drink/i.test(lower)) {
    category = 'Dining';
  } else if (/gas|fuel|shell|chevron|exxon|uber|lyft|taxi|subway fare|train|bus|transport|parking|toll/i.test(lower)) {
    category = 'Transportation';
  } else if (/movie|cinema|netflix|spotify|game|entertainment|concert|ticket/i.test(lower)) {
    category = 'Entertainment';
  } else if (/clothes|shoes|amazon|target|shopping|mall|electronics|store|retail/i.test(lower)) {
    category = 'Shopping';
  } else if (/bill|electric|power|water|internet|utility|utilities|wifi|phone|rent/i.test(lower)) {
    category = 'Utilities';
  } else if (/gym|pharmacy|medicine|doctor|health|dentist/i.test(lower)) {
    category = 'Healthcare';
  }

  return {
    amount,
    merchant,
    category,
    date: 'Today',
    ai_reply: `Logged $${amount.toFixed(2)} at ${merchant} under ${category}. Added to your transactions automatically!`,
  };
}

export const DEFAULT_USER_DATA = {
  accounts: { checking: 2450.00, savings: 8500.00, crypto: 1200.00, stocks: 4500.00 },
  monthlyBudget: 300.00,
  recentTransactions: [
    { id: 1, date: "2026-10-14", merchant: "Whole Foods", amount: 120.50, category: "Groceries", type: "expense" },
    { id: 2, date: "2026-10-16", merchant: "Netflix", amount: 15.99, category: "Subscriptions", recurring: true, type: "expense" }
  ],
  upcomingBills: [
    { name: "Electricity", dueDate: "2026-10-20", amount: 85.00 },
    { name: "Spotify", dueDate: "2026-10-22", amount: 10.99 }
  ]
};

export let mockUserData = JSON.parse(JSON.stringify(DEFAULT_USER_DATA));

export function recordExpense({ amount, merchant, category, date }) {
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
    type: 'expense'
  };

  if (numAmount > 0) {
    mockUserData.recentTransactions.unshift(newTx);
    mockUserData.accounts.checking = Math.max(0, Math.round(((mockUserData.accounts.checking || 0) - numAmount) * 100) / 100);
  }

  return newTx;
}

export default routerModel;

