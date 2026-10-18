import { z } from 'zod';

export const cardNetworkSchema = z.enum(['visa', 'mastercard', 'amex', 'discover']);

export const creditCardSchema = z.object({
  id: z.string().min(1),
  cardName: z.string().trim().min(1).max(100),
  network: cardNetworkSchema,
  last4: z.string().regex(/^\d{4}$/),
  balance: z.number().finite().nonnegative().max(1_000_000_000),
  creditLimit: z.number().finite().nonnegative().max(1_000_000_000),
  apr: z.number().finite().nonnegative().max(100),
  dueDate: z.string().max(100),
  minPayment: z.number().finite().nonnegative().max(1_000_000_000),
});

export const transactionSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(80),
  date: z.string().max(100),
  amount: z.number().finite().positive().max(1_000_000_000),
  type: z.enum(['income', 'expense']),
  source: z.string().trim().min(1).max(100),
});

export const billSchema = z.object({
  id: z.string().min(1),
  bill_name: z.string().trim().min(1).max(200),
  due_date: z.string().max(100),
  amount: z.number().finite().nonnegative().max(1_000_000_000),
  paid: z.boolean(),
  category: z.string().trim().min(1).max(80),
});

export const financeContextSchema = z.object({
  cards: z.array(creditCardSchema).max(500).default([]),
  transactions: z.array(transactionSchema).max(10_000).default([]),
  bills: z.array(billSchema).max(2_000).default([]),
  monthlyIncome: z.number().finite().nonnegative().max(1_000_000_000).default(0),
  monthlyExpenses: z.number().finite().nonnegative().max(1_000_000_000).default(0),
  totalBalance: z.number().finite().min(-1_000_000_000).max(1_000_000_000).default(0),
  breakdown: z.array(z.object({
    category: z.string().trim().min(1).max(80),
    amount: z.number().finite().nonnegative(),
  })).max(500).optional(),
}).strict();

export type CreditCard = z.infer<typeof creditCardSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type Bill = z.infer<typeof billSchema>;
export type FinanceContext = z.infer<typeof financeContextSchema>;

const toCents = (value: number, label: string): number => {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100) {
    throw new RangeError(`${label} must be a finite, safely representable amount.`);
  }
  return Math.round(value * 100);
};

const fromCents = (value: number) => value / 100;

const sumAmounts = (values: number[], label: string) =>
  fromCents(values.reduce((sum, value) => {
    const total = sum + toCents(value, label);
    if (!Number.isSafeInteger(total)) throw new RangeError(`${label} total exceeds the safely representable amount.`);
    return total;
  }, 0));

export interface BudgetAllocation {
  needs: number;
  wants: number;
  savingsAndDebt: number;
}

export interface FinancialSummary {
  income: number;
  expenses: number;
  netCashFlow: number;
  cash: number;
  cardDebt: number;
  creditLimit: number;
  utilizationPercent: number;
  netWorth: number;
  unpaidBillTotal: number;
  budget: BudgetAllocation;
  emergencyRunwayMonths: number | null;
  categorySpending: { category: string; amount: number }[];
}

export function allocateBudget(monthlyIncome: number): BudgetAllocation {
  const incomeCents = toCents(monthlyIncome, 'Monthly income');
  if (incomeCents < 0) throw new RangeError('Monthly income cannot be negative.');
  const needs = Math.round(incomeCents * 0.5);
  const wants = Math.round(incomeCents * 0.3);
  return {
    needs: fromCents(needs),
    wants: fromCents(wants),
    savingsAndDebt: fromCents(incomeCents - needs - wants),
  };
}

export function calculateUtilization(cards: Pick<CreditCard, 'balance' | 'creditLimit'>[]) {
  for (const card of cards) {
    if (card.balance < 0 || card.creditLimit < 0) {
      throw new RangeError('Card balances and credit limits cannot be negative.');
    }
  }
  const debt = sumAmounts(cards.map(card => card.balance), 'Card balance');
  const limit = sumAmounts(cards.map(card => card.creditLimit), 'Credit limit');
  return limit === 0 ? 0 : debt / limit * 100;
}

export function calculateNetWorth(cash: number, cardDebt: number) {
  return fromCents(toCents(cash, 'Cash balance') - toCents(cardDebt, 'Card debt'));
}

export function calculateFinancialSummary(context: FinanceContext): FinancialSummary {
  const validatedContext = financeContextSchema.parse(context);
  const income = sumAmounts(
    validatedContext.transactions.filter(transaction => transaction.type === 'income').map(transaction => transaction.amount),
    'Income'
  );
  const expenses = sumAmounts(
    validatedContext.transactions.filter(transaction => transaction.type === 'expense').map(transaction => transaction.amount),
    'Expense'
  );
  const cardDebt = sumAmounts(validatedContext.cards.map(card => card.balance), 'Card balance');
  const creditLimit = sumAmounts(validatedContext.cards.map(card => card.creditLimit), 'Credit limit');
  const utilizationPercent = calculateUtilization(validatedContext.cards);
  const unpaidBillTotal = sumAmounts(
    validatedContext.bills.filter(bill => !bill.paid).map(bill => bill.amount),
    'Bill amount'
  );
  const categoryTotals = new Map<string, number[]>();
  for (const transaction of validatedContext.transactions) {
    if (transaction.type !== 'expense') continue;
    const amounts = categoryTotals.get(transaction.category) ?? [];
    amounts.push(transaction.amount);
    categoryTotals.set(transaction.category, amounts);
  }

  return {
    income,
    expenses,
    netCashFlow: fromCents(toCents(income, 'Income') - toCents(expenses, 'Expense')),
    cash: validatedContext.totalBalance,
    cardDebt,
    creditLimit,
    utilizationPercent,
    netWorth: calculateNetWorth(validatedContext.totalBalance, cardDebt),
    unpaidBillTotal,
    budget: allocateBudget(validatedContext.monthlyIncome),
    emergencyRunwayMonths: validatedContext.monthlyExpenses === 0
      ? null
      : Math.max(0, validatedContext.totalBalance) / validatedContext.monthlyExpenses,
    categorySpending: [...categoryTotals.entries()]
      .map(([category, amounts]) => ({ category, amount: sumAmounts(amounts, 'Category expense') }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export function cardPayoffOrder(
  cards: CreditCard[],
  strategy: 'avalanche' | 'snowball'
): CreditCard[] {
  return [...cards].sort((left, right) => {
    const primary = strategy === 'avalanche'
      ? right.apr - left.apr
      : left.balance - right.balance;
    return primary || left.cardName.localeCompare(right.cardName);
  });
}

export function describeFinancialSummary(summary: FinancialSummary) {
  const budget = summary.budget;
  const utilizationNote = summary.creditLimit === 0
    ? 'No credit limit is available to calculate utilization.'
    : `Card utilization is ${summary.utilizationPercent.toFixed(1)}%.`;
  const runwayNote = summary.emergencyRunwayMonths === null
    ? 'Set an average monthly expense amount in your profile to estimate a cash runway.'
    : `Current cash covers about ${summary.emergencyRunwayMonths.toFixed(1)} months at your saved monthly expense rate.`;
  return [
    'Your financial summary:',
    `• Recorded income: $${summary.income.toFixed(2)}; recorded expenses: $${summary.expenses.toFixed(2)}; net cash flow: $${summary.netCashFlow.toFixed(2)}.`,
    `• Cash: $${summary.cash.toFixed(2)}; card debt: $${summary.cardDebt.toFixed(2)}; estimated net worth: $${summary.netWorth.toFixed(2)}.`,
    `• Unpaid bills: $${summary.unpaidBillTotal.toFixed(2)}. ${utilizationNote}`,
    `• 50/30/20 targets from monthly income: needs $${budget.needs.toFixed(2)}, wants $${budget.wants.toFixed(2)}, savings/debt $${budget.savingsAndDebt.toFixed(2)}.`,
    `• ${runwayNote}`,
  ].join('\n');
}
