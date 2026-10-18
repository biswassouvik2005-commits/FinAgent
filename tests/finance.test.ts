import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allocateBudget,
  calculateFinancialSummary,
  calculateUtilization,
  financeContextSchema,
} from '../src/lib/finance';

test('allocates a 50/30/20 budget deterministically in cents', () => {
  assert.deepEqual(allocateBudget(5_000), {
    needs: 2_500,
    wants: 1_500,
    savingsAndDebt: 1_000,
  });
  assert.deepEqual(allocateBudget(0), { needs: 0, wants: 0, savingsAndDebt: 0 });
  assert.throws(() => allocateBudget(-1), /cannot be negative/);
  assert.throws(() => allocateBudget(Number.NaN), /finite/);
});

test('calculates utilization safely when there are no credit limits', () => {
  assert.equal(calculateUtilization([]), 0);
  assert.equal(calculateUtilization([{ balance: 300, creditLimit: 1_000 }]), 30);
  assert.throws(() => calculateUtilization([{ balance: -1, creditLimit: 0 }]), /cannot be negative/);
});

test('summarizes validated finance context and uses explicit monthly expenses for runway', () => {
  const context = financeContextSchema.parse({
    monthlyIncome: 5_000,
    monthlyExpenses: 2_000,
    totalBalance: 3_000,
    cards: [{
      id: 'card-1',
      cardName: 'Everyday',
      network: 'visa',
      last4: '1234',
      balance: 500,
      creditLimit: 2_000,
      apr: 20,
      dueDate: '',
      minPayment: 25,
    }],
    transactions: [
      { id: 'income-1', title: 'Paycheck', category: 'Income', date: 'Today', amount: 4_000, type: 'income', source: 'Checking' },
      { id: 'expense-1', title: 'Market', category: 'Groceries', date: 'Today', amount: 100, type: 'expense', source: 'Everyday' },
      { id: 'expense-2', title: 'Cafe', category: 'Dining', date: 'Today', amount: 50, type: 'expense', source: 'Checking' },
    ],
    bills: [{ id: 'bill-1', bill_name: 'Power', due_date: 'Friday', amount: 80, paid: false, category: 'Utilities' }],
  });
  const summary = calculateFinancialSummary(context);

  assert.equal(summary.income, 4_000);
  assert.equal(summary.expenses, 150);
  assert.equal(summary.netCashFlow, 3_850);
  assert.equal(summary.utilizationPercent, 25);
  assert.equal(summary.netWorth, 2_500);
  assert.equal(summary.unpaidBillTotal, 80);
  assert.equal(summary.emergencyRunwayMonths, 1.5);
  assert.deepEqual(summary.categorySpending, [
    { category: 'Groceries', amount: 100 },
    { category: 'Dining', amount: 50 },
  ]);
});

test('does not infer a monthly runway from undated transaction history', () => {
  const context = financeContextSchema.parse({ totalBalance: 100, transactions: [
    { id: 'expense-1', title: 'One-time expense', category: 'Other', date: 'Today', amount: 20, type: 'expense', source: 'Checking' },
  ] });
  assert.equal(calculateFinancialSummary(context).emergencyRunwayMonths, null);
});

test('rejects malformed calculation inputs', () => {
  assert.throws(() => financeContextSchema.parse({
    transactions: [{ id: 'bad', title: 'Bad', category: 'Other', date: '', amount: Number.NaN, type: 'expense', source: 'Checking' }],
  }));
});
