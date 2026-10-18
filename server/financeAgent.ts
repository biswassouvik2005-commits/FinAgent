import { END, START, StateGraph, StateSchema, type Runtime } from '@langchain/langgraph';
import { z } from 'zod';
import {
  calculateFinancialSummary,
  cardPayoffOrder,
  describeFinancialSummary,
  financeContextSchema,
  type FinanceContext,
} from '../src/lib/finance';

export type AgentIntent =
  | 'arithmetic'
  | 'affordability'
  | 'budget'
  | 'bills'
  | 'income'
  | 'spending'
  | 'runway'
  | 'summary'
  | 'debt'
  | 'advice';

export type ReasoningService = (message: string, context: FinanceContext) => Promise<string>;

const AgentState = new StateSchema({
  message: z.string().min(1).max(2_000),
  context: financeContextSchema,
  intent: z.enum(['arithmetic', 'affordability', 'budget', 'bills', 'income', 'spending', 'runway', 'summary', 'debt', 'advice']).default('advice'),
  reply: z.string().default(''),
  error: z.string().optional(),
});
const AgentRuntimeContext = z.object({
  reasoningService: z.custom<ReasoningService>().optional(),
});
type AgentStateType = typeof AgentState.State;

function hasTerm(message: string, pattern: RegExp) {
  return pattern.test(message);
}

export function classifyIntent(message: string): AgentIntent {
  const normalized = message.trim().toLowerCase();
  if (!normalized) throw new Error('Enter a question for FinAgent.');
  if (getArithmeticInput(normalized)) return 'arithmetic';
  if (hasTerm(normalized, /\b(budget|50\s*\/\s*30\s*\/\s*20|50\s*30\s*20)\b/)) return 'budget';
  if (hasTerm(normalized, /\b(bills?|upcoming|due dates?|subscriptions?)\b/)) return 'bills';
  if (hasTerm(normalized, /\b(emergency fund|runway|months? of cash|cash reserve)\b/)) return 'runway';
  if (hasTerm(normalized, /\b(income|salary|earnings?)\b/)) return 'income';
  if (hasTerm(normalized, /\b(spending|spent|expenses?|spend|groceries|dining|housing|utilities|transportation|entertainment)\b/)) return 'spending';
  if (hasTerm(normalized, /\b(summary|summarize|report|balance|balances|net worth|cash flow|financial health|overall finances)\b/)) return 'summary';
  if (hasTerm(normalized, /\b(cards?|credit|utilization|apr|debt|payoff|pay off|interest)\b/)) return 'debt';
  if (hasTerm(normalized, /\b(afford|affordable)\b/) && /\$?\d[\d,]*(?:\.\d{1,2})?/.test(normalized)) return 'affordability';
  return 'advice';
}

function getArithmeticInput(message: string): string | null {
  const percentage = message.match(/^(?:(?:what is|calculate|compute|solve)\s+)?(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)\??$/i);
  if (percentage) return `${percentage[1]}% of ${percentage[2]}`;

  const normalized = message
    .replace(/\b(?:what is|calculate|compute|solve)\b/i, '')
    .replace(/\b(?:plus|add)\b/gi, '+')
    .replace(/\b(?:minus|subtract)\b/gi, '-')
    .replace(/\b(?:times|multiplied by)\b/gi, '*')
    .replace(/\b(?:divided by|over)\b/gi, '/')
    .trim();
  const expression = normalized.match(/^([0-9\s.+*/()\-×÷]+)\??$/)?.[1]?.trim();
  if (!expression || !(/[+*/×÷]/.test(expression) || /\d\s*-\s*\d/.test(expression))) return null;
  return expression;
}

function evaluateArithmetic(expression: string): number {
  const tokens: (number | string)[] = [];
  const tokenizer = /\s*(\d+(?:\.\d+)?|[()+\-*/×÷])\s*/gy;
  let position = 0;
  while (position < expression.length) {
    tokenizer.lastIndex = position;
    const token = tokenizer.exec(expression);
    if (!token || token[0].length === 0) throw new Error('Use a valid arithmetic expression with numbers and +, -, *, /, or parentheses.');
    tokens.push(/[0-9]/.test(token[1]) ? Number(token[1]) : token[1]);
    position = tokenizer.lastIndex;
  }

  let cursor = 0;
  const primary = (): number => {
    const token = tokens[cursor++];
    if (token === '+' || token === '-') {
      const value = primary();
      return token === '-' ? -value : value;
    }
    if (token === '(') {
      const value = expressionValue();
      if (tokens[cursor++] !== ')') throw new Error('Add a closing parenthesis to complete the expression.');
      return value;
    }
    if (typeof token !== 'number') throw new Error('The expression is incomplete or invalid.');
    return token;
  };
  const term = (): number => {
    let value = primary();
    while (tokens[cursor] === '*' || tokens[cursor] === '/' || tokens[cursor] === '×' || tokens[cursor] === '÷') {
      const operator = tokens[cursor++];
      const next = primary();
      if ((operator === '/' || operator === '÷') && next === 0) throw new Error('Division by zero is undefined.');
      value = operator === '*' || operator === '×' ? value * next : value / next;
      if (!Number.isFinite(value)) throw new Error('The result is outside the supported numeric range.');
    }
    return value;
  };
  const expressionValue = (): number => {
    let value = term();
    while (tokens[cursor] === '+' || tokens[cursor] === '-') {
      const operator = tokens[cursor++];
      const next = term();
      value = operator === '+' ? value + next : value - next;
      if (!Number.isFinite(value)) throw new Error('The result is outside the supported numeric range.');
    }
    return value;
  };

  const result = expressionValue();
  if (cursor !== tokens.length) throw new Error('The expression is incomplete or invalid.');
  return result;
}

function calculateResponse(intent: Exclude<AgentIntent, 'advice'>, message: string, context: FinanceContext) {
  const summary = calculateFinancialSummary(context);
  switch (intent) {
    case 'arithmetic': {
      const expression = getArithmeticInput(message);
      if (!expression) return 'I could not read that arithmetic expression. Use numbers with +, -, *, /, or parentheses.';
      try {
        const value = expression.includes('% of ')
          ? Number(expression.split('% of ')[0]) / 100 * Number(expression.split('% of ')[1])
          : evaluateArithmetic(expression);
        if (!Number.isFinite(value)) return 'The result is outside the supported numeric range.';
        return `Result: ${Number(value.toFixed(8)).toLocaleString('en-US', { maximumFractionDigits: 8 })}`;
      } catch (error) {
        return error instanceof Error ? error.message : 'The calculation could not be completed.';
      }
    }
    case 'affordability': {
      const match = message.match(/\$?([\d,]+(?:\.\d{1,2})?)/);
      if (!match) return 'Enter a purchase amount so I can compare it with cash available after unpaid bills.';
      const purchase = Number(match[1].replaceAll(',', ''));
      if (!Number.isFinite(purchase) || purchase <= 0) return 'Enter a purchase amount greater than zero.';
      const available = context.totalBalance - summary.unpaidBillTotal;
      const remaining = available - purchase;
      return `A cash-only check: $${available.toFixed(2)} remains after unpaid bills; a $${purchase.toFixed(2)} purchase would leave $${remaining.toFixed(2)}. ${remaining >= 0 ? 'It fits within this recorded cash amount.' : 'It exceeds this recorded cash amount.'} This does not account for other upcoming needs.`;
    }
    case 'budget':
      return [
        `50/30/20 targets for monthly income of $${context.monthlyIncome.toFixed(2)}:`,
        `• Needs (50%): $${summary.budget.needs.toFixed(2)}`,
        `• Wants (30%): $${summary.budget.wants.toFixed(2)}`,
        `• Savings and debt payoff (20%): $${summary.budget.savingsAndDebt.toFixed(2)}`,
      ].join('\n');
    case 'bills': {
      const pending = context.bills.filter(bill => !bill.paid);
      if (pending.length === 0) return 'You have no unpaid bills recorded.';
      return [
        `${pending.length} unpaid bill${pending.length === 1 ? '' : 's'} total $${summary.unpaidBillTotal.toFixed(2)}:`,
        ...pending.map(bill => `• ${bill.bill_name}: $${bill.amount.toFixed(2)} (due ${bill.due_date || 'date not set'})`),
      ].join('\n');
    }
    case 'income':
      return `Recorded income is $${summary.income.toFixed(2)} and recorded expenses are $${summary.expenses.toFixed(2)}, for net cash flow of $${summary.netCashFlow.toFixed(2)}. Your monthly income setting is $${context.monthlyIncome.toFixed(2)}.`;
    case 'spending': {
      const matchedCategory = summary.categorySpending.find(item =>
        message.toLowerCase().includes(item.category.toLowerCase())
      );
      if (matchedCategory) {
        return `Recorded spending in ${matchedCategory.category} is $${matchedCategory.amount.toFixed(2)}.`;
      }
      if (summary.categorySpending.length === 0) return 'There are no expense transactions recorded yet.';
      return [
        `Recorded expenses total $${summary.expenses.toFixed(2)}. Spending by category:`,
        ...summary.categorySpending.map(item => `• ${item.category}: $${item.amount.toFixed(2)}`),
      ].join('\n');
    }
    case 'runway':
      return summary.emergencyRunwayMonths === null
        ? 'I cannot estimate a cash runway until you set an average monthly expense amount in your profile.'
        : `With $${summary.cash.toFixed(2)} cash and your saved monthly expense rate, your cash covers about ${summary.emergencyRunwayMonths.toFixed(1)} months. This is an estimate, not a forecast.`;
    case 'summary':
      return describeFinancialSummary(summary);
    case 'debt': {
      if (context.cards.length === 0) return 'No credit cards are recorded yet. Add cards with current balances and credit limits to calculate utilization and payoff order.';
      const strategy = /\b(snowball|lowest balance|smallest balance)\b/i.test(message) ? 'snowball' : 'avalanche';
      const orderedCards = cardPayoffOrder(context.cards, strategy);
      const priority = orderedCards[0];
      const strategyName = strategy === 'avalanche' ? 'highest APR first (avalanche)' : 'lowest balance first (snowball)';
      const utilization = summary.creditLimit === 0 ? 'unavailable because total credit limit is zero' : `${summary.utilizationPercent.toFixed(1)}%`;
      return [
        `Card debt totals $${summary.cardDebt.toFixed(2)} across $${summary.creditLimit.toFixed(2)} in credit limits; utilization is ${utilization}.`,
        `Using ${strategyName}, prioritize ${priority.cardName} (${priority.apr.toFixed(2)}% APR, $${priority.balance.toFixed(2)} balance).`,
        ...orderedCards.map((card, index) => `${index + 1}. ${card.cardName}: ${card.apr.toFixed(2)}% APR, $${card.balance.toFixed(2)} balance`),
      ].join('\n');
    }
  }
}

const graph = new StateGraph(AgentState, AgentRuntimeContext)
  .addNode('route_intent', (state: AgentStateType) => ({
    intent: classifyIntent(state.message),
  }))
  .addNode('calculate', (state: AgentStateType) => ({
    reply: calculateResponse(state.intent as Exclude<AgentIntent, 'advice'>, state.message, state.context),
  }))
  .addNode('reason', async (state: AgentStateType, runtime: Runtime<z.infer<typeof AgentRuntimeContext>>) => {
    const service = runtime.context?.reasoningService;
    if (!service) {
      return {
        reply: 'I can answer calculations directly, but natural-language financial advice is unavailable because the AI service is not configured. Set GEMINI_API_KEY on the server to enable it.',
        error: 'AI service is not configured.',
      };
    }
    try {
      const reply = await service(state.message, state.context);
      if (!reply.trim()) throw new Error('The AI service returned an empty response.');
      return { reply };
    } catch (error) {
      console.error('[FinAgent] reasoning service failed', error);
      return {
        reply: 'The AI advice service is temporarily unavailable. You can still ask for a budget, spending, income, bill, net-worth, or card-payoff calculation.',
        error: 'AI advice service is temporarily unavailable.',
      };
    }
  })
  .addEdge(START, 'route_intent')
  .addConditionalEdges(
    'route_intent',
    (state: AgentStateType) => state.intent === 'advice' ? 'reason' : 'calculate',
    { reason: 'reason', calculate: 'calculate' }
  )
  .addEdge('calculate', END)
  .addEdge('reason', END)
  .compile();

export interface AgentResult {
  ai_reply: string;
  intent: AgentIntent;
  total_balance: number;
  budget_status: string;
  category_breakdown: { category: string; amount: number }[];
  upcoming_bills: FinanceContext['bills'];
  portfolio_health: string;
  error?: string;
}

export async function runFinanceAgent(
  message: string,
  rawContext: unknown,
  reasoningService?: ReasoningService
): Promise<AgentResult> {
  const parsedMessage = z.string().trim().min(1, 'Message is required.').max(2_000, 'Message must be 2,000 characters or fewer.').parse(message);
  const context = financeContextSchema.parse(rawContext ?? {});
  const result = await graph.invoke(
    { message: parsedMessage, context },
    { context: { reasoningService } }
  );
  const summary = calculateFinancialSummary(context);
  return {
    ai_reply: result.reply,
    intent: result.intent,
    total_balance: context.totalBalance,
    budget_status: summary.utilizationPercent > 30 ? 'Review Utilization' : 'On Track',
    category_breakdown: summary.categorySpending,
    upcoming_bills: context.bills,
    portfolio_health: `Card utilization: ${summary.utilizationPercent.toFixed(1)}%`,
    ...(result.error ? { error: result.error } : {}),
  };
}

export function parseFinanceContext(context: unknown): FinanceContext {
  return financeContextSchema.parse(context ?? {});
}
