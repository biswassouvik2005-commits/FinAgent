import { GoogleGenAI, Type } from '@google/genai';
import cors from 'cors';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Increase payload limit for base64 image receipt uploads
app.use(express.json({ limit: '15mb' }));
app.use(cors());

// Retrieve Google GenAI client dynamically from current environment
function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || typeof key !== 'string' || key.trim() === '' || key.trim() === 'undefined') {
    return null;
  }
  return new GoogleGenAI({
    apiKey: key.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
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
    "log_expense" (when the user states or speaks an expense, purchase, or money spent to record, e.g. "Spent $14 on lunch at Subway", "Bought coffee for $5 at Starbucks").
    Return ONLY the single word. Do not include punctuation.`,
  classify: (query: string): 'expense' | 'bills' | 'investments' | 'log_expense' => {
    const clean = query.trim().toLowerCase();
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
  },
};

export interface ExtractedExpense {
  amount: number;
  merchant: string;
  category: string;
  date: string;
  ai_reply: string;
}

// Fallback rule-based NLP extraction for offline / no-key mode
export function parseExpenseFromNaturalLanguage(text: string): ExtractedExpense {
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

  // 4th route: Conversational Expense Logging ("Spent $14 on lunch at Subway")
  if (routerModel.classify(message) === 'log_expense') {
    let extracted: ExtractedExpense = parseExpenseFromNaturalLanguage(message);
    const ai = getGeminiClient();
    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `Extract transaction details from user statement: "${message}".
Return amount (positive number), merchant (string), category (string e.g. Dining, Groceries, Shopping, Transportation, Entertainment, Utilities, Healthcare, Other), and a friendly ai_reply confirming the expense has been recorded.`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                amount: { type: Type.NUMBER },
                merchant: { type: Type.STRING },
                category: { type: Type.STRING },
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
              date: 'Today',
              ai_reply: parsed.ai_reply || `Logged $${amt.toFixed(2)} at ${parsed.merchant} under ${parsed.category || extracted.category}. Added to your transactions automatically!`,
            };
          }
        }
      } catch (err: any) {
        console.warn('[FinAgent] Gemini chat log_expense fallback active:', err?.message || 'unknown error');
      }
    }

    const newTx = {
      id: `tx-${Date.now()}`,
      title: extracted.merchant,
      merchant: extracted.merchant,
      amount: extracted.amount,
      category: extracted.category,
      date: extracted.date,
      type: 'expense' as const,
    };
    const newBalance = Math.max(0, userBalance - extracted.amount);

    return res.json({
      ai_reply: extracted.ai_reply,
      total_balance: newBalance,
      budget_status: 'On Track',
      category_breakdown: userBreakdown,
      upcoming_bills: userBills,
      portfolio_health: `Credit Utilization: ${cardUtilization}%`,
      logged_expense: newTx,
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
  let extracted: ExtractedExpense = parseExpenseFromNaturalLanguage(query);

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `You are the Conversational Expense Logging Agent.
When a user types or speaks an expense (e.g. "Spent $14 on lunch at Subway"), extract:
1. amount: exact numeric amount spent (e.g. 14)
2. merchant: vendor, store or restaurant name (e.g. "Subway")
3. category: budget category (e.g. Dining, Groceries, Transportation, Shopping, Entertainment, Utilities, Healthcare, Other)
4. ai_reply: a friendly confirmation confirming the expense is logged and added to transactions.

User query: "${query}"`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              amount: { type: Type.NUMBER, description: 'Dollar amount spent' },
              merchant: { type: Type.STRING, description: 'Store, merchant or vendor name' },
              category: { type: Type.STRING, description: 'Budget category' },
              ai_reply: { type: Type.STRING, description: 'Short friendly confirmation message' },
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
            date: 'Today',
            ai_reply: parsed.ai_reply || `Logged $${amt.toFixed(2)} at ${parsed.merchant} under ${parsed.category || extracted.category}. Added to your transactions automatically!`,
          };
        }
      }
    } catch (err: any) {
      console.warn('[FinAgent] Gemini log_expense fallback active:', err?.message || 'unknown error');
    }
  }

  const newTx = {
    id: `tx-${Date.now()}`,
    title: extracted.merchant,
    merchant: extracted.merchant,
    amount: extracted.amount,
    category: extracted.category,
    date: extracted.date,
    type: 'expense' as const,
  };

  const userBalance = typeof userContext?.totalBalance === 'number' ? userContext.totalBalance : 0;
  const newBalance = Math.max(0, userBalance - extracted.amount);

  return res.json({
    success: true,
    ai_reply: extracted.ai_reply,
    amount: extracted.amount,
    merchant: extracted.merchant,
    category: extracted.category,
    transaction: newTx,
    logged_expense: newTx,
    total_balance: newBalance,
  });
}

app.post('/api/log_expense', handleLogExpense);
app.post('/log_expense', handleLogExpense);


// --- POST /api/receipt ---
app.post('/api/receipt', async (req, res) => {
  const { base64Image, mimeType = 'image/jpeg' } = req.body || {};

  if (!base64Image) {
    return res.status(400).json({ error: 'base64Image is required' });
  }

  // If Gemini API is available, analyze receipt with Vision
  const ai = getGeminiClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Image,
              },
            },
            {
              text: 'Extract the merchant name, total receipt amount as a number, and expense category (e.g. Groceries, Dining, Electronics, Transportation, Utilities, Shopping) from this receipt image. Return ONLY what is visible on the image.',
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              merchant: { type: Type.STRING, description: 'Store or vendor name' },
              total: { type: Type.NUMBER, description: 'Total charge amount' },
              category: { type: Type.STRING, description: 'Budget category' },
            },
            required: ['merchant', 'total', 'category'],
          },
        },
      });

      if (response.text) {
        const parsed = JSON.parse(response.text.trim());
        const total = Number(parsed.total);
        if (Number.isFinite(total) && total > 0 && parsed.merchant) {
          return res.json({
            merchant: String(parsed.merchant).trim(),
            total,
            category: parsed.category || 'Shopping',
          });
        }
      }
    } catch (err: any) {
      console.warn('[FinAgent] Gemini receipt OCR error:', err?.message || 'unknown error');
    }
  }

  // No mock/fake vendor fallback: return clear error prompting user input
  return res.status(422).json({
    error: 'Could not extract valid receipt details from image. Please enter the transaction details manually.',
  });
});

// Mount Vite or static server
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AI Studio] FinAgent server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start FinAgent server:', err);
  process.exit(1);
});
