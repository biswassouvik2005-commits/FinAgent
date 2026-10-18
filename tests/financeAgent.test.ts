import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyIntent, runFinanceAgent } from '../server/financeAgent';

test('classifies deterministic finance intents', () => {
  assert.equal(classifyIntent('Show my 50/30/20 budget'), 'budget');
  assert.equal(classifyIntent('What bills are due?'), 'bills');
  assert.equal(classifyIntent('How many months of cash runway do I have?'), 'runway');
  assert.equal(classifyIntent('How much did I spend on dining?'), 'spending');
  assert.equal(classifyIntent('Which card should I pay first?'), 'debt');
  assert.equal(classifyIntent('What is 20% of 500?'), 'arithmetic');
  assert.equal(classifyIntent('Can I afford a $400 flight?'), 'affordability');
  assert.equal(classifyIntent('What is my cash balance?'), 'summary');
  assert.equal(classifyIntent('Can I afford to move?'), 'advice');
  assert.throws(() => classifyIntent('  '), /Enter a question/);
});

test('evaluates arithmetic and affordability deterministically, including invalid division', async () => {
  let calls = 0;
  const reason = async () => {
    calls += 1;
    return 'AI should not be used';
  };
  const arithmetic = await runFinanceAgent('What is 20% of 500?', {}, reason);
  assert.equal(arithmetic.intent, 'arithmetic');
  assert.match(arithmetic.ai_reply, /Result: 100/);

  const division = await runFinanceAgent('Calculate 10 / 0', {}, reason);
  assert.match(division.ai_reply, /Division by zero/);

  const affordability = await runFinanceAgent(
    'Can I afford a $400 flight?',
    { totalBalance: 1_000, bills: [{ id: 'bill-1', bill_name: 'Power', due_date: '', amount: 100, paid: false, category: 'Utilities' }] },
    reason
  );
  assert.equal(affordability.intent, 'affordability');
  assert.match(affordability.ai_reply, /would leave \$500\.00/);
  assert.equal(calls, 0);
});

test('routes calculations through code without invoking the reasoning service', async () => {
  let calls = 0;
  const result = await runFinanceAgent(
    'Show my budget',
    { monthlyIncome: 5_000 },
    async () => {
      calls += 1;
      return 'incorrectly used AI';
    }
  );

  assert.equal(calls, 0);
  assert.equal(result.intent, 'budget');
  assert.match(result.ai_reply, /Needs \(50%\): \$2500\.00/);
});

test('returns a useful message if the advice service is unavailable', async () => {
  const unavailable = await runFinanceAgent('Can I afford a move?', {});
  assert.equal(unavailable.intent, 'advice');
  assert.match(unavailable.ai_reply, /not configured/);
  assert.ok(unavailable.error);

  const failed = await runFinanceAgent('Can I afford a move?', {}, async () => {
    throw new Error('provider unavailable');
  });
  assert.match(failed.ai_reply, /temporarily unavailable/);
  assert.ok(failed.error);
});

test('rejects invalid financial context before graph execution', async () => {
  await assert.rejects(
    runFinanceAgent('Show my budget', { monthlyIncome: -10 }),
    /Too small|greater than or equal to 0/i
  );
});
