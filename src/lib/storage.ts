import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import {
  billSchema,
  creditCardSchema,
  transactionSchema,
} from './finance';

const financialDataSchema = z.object({
  version: z.literal(2),
  profile: z.object({
    displayName: z.string().max(100),
    monthlyIncome: z.number().finite().nonnegative().max(1_000_000_000),
    monthlyExpenses: z.number().finite().nonnegative().max(1_000_000_000).default(0),
    liquidCash: z.number().finite().min(-1_000_000_000).max(1_000_000_000),
  }),
  theme: z.enum(['dark', 'light']),
  debtStrategy: z.enum(['Avalanche', 'Snowball']),
  cards: z.array(creditCardSchema).max(500),
  transactions: z.array(transactionSchema).max(10_000),
  bills: z.array(billSchema).max(2_000),
});

export type FinancialData = z.infer<typeof financialDataSchema>;

export const defaultFinancialData: FinancialData = {
  version: 2,
  profile: { displayName: '', monthlyIncome: 0, monthlyExpenses: 0, liquidCash: 0 },
  theme: 'dark',
  debtStrategy: 'Avalanche',
  cards: [],
  transactions: [],
  bills: [],
};

export interface StorageAdapter {
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  setItem(key: string, value: string): Promise<void>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

const currentStateKey = 'fin_app_state_v2';
let pendingWrite: Promise<void> = Promise.resolve();
const legacyKeys = [
  'fin_theme',
  'fin_cards',
  'fin_transactions',
  'fin_bills',
  'fin_monthly_income',
  'fin_liquid_cash',
  'fin_user_name',
] as const;

function parseLegacyJson<T>(
  raw: string | null,
  schema: z.ZodType<T, any, any>,
  key: string,
  warnings: string[]
): T | undefined {
  if (raw === null) return undefined;
  try {
    const result = schema.safeParse(JSON.parse(raw));
    if (result.success) return result.data;
    warnings.push(`${key} contains invalid data and was not loaded.`);
    console.error(`Invalid stored ${key}`, result.error);
  } catch (error) {
    warnings.push(`${key} could not be read and was not loaded.`);
    console.error(`Failed to parse stored ${key}`, error);
  }
  return undefined;
}

function parseLegacyNumber(raw: string | null, key: string, warnings: string[]) {
  if (raw === null) return undefined;
  const value = Number(raw);
  const parsed = z.number().finite().nonnegative().max(1_000_000_000).safeParse(value);
  if (parsed.success) return parsed.data;
  warnings.push(`${key} contains an invalid number and was not loaded.`);
  console.error(`Invalid stored number for ${key}`);
  return undefined;
}

export interface LoadedFinancialData {
  data: FinancialData;
  warnings: string[];
}

export async function loadFinancialData(
  storage: StorageAdapter = AsyncStorage
): Promise<LoadedFinancialData> {
  const entries = await storage.multiGet([currentStateKey, ...legacyKeys]);
  const stored = Object.fromEntries(entries);
  const warnings: string[] = [];
  const current = stored[currentStateKey];
  if (current !== null && current !== undefined) {
    const parsed = parseLegacyJson<FinancialData>(current, financialDataSchema, currentStateKey, warnings);
    if (parsed) return { data: parsed, warnings };
    throw new Error(warnings.join(' '));
  }

  const theme = stored.fin_theme;
  const parsedTheme = theme === 'dark' || theme === 'light' ? theme : defaultFinancialData.theme;
  if (theme !== null && theme !== undefined && theme !== 'dark' && theme !== 'light') {
    warnings.push('Saved theme preference is invalid; the default theme was loaded.');
  }

  const legacyName = stored.fin_user_name ?? '';
  const nameResult = z.string().max(100).safeParse(legacyName);
  if (!nameResult.success) warnings.push('Saved profile name is invalid and was not loaded.');

  return {
    data: {
      ...defaultFinancialData,
      theme: parsedTheme,
      profile: {
        displayName: nameResult.success ? nameResult.data : '',
        monthlyIncome: parseLegacyNumber(stored.fin_monthly_income, 'fin_monthly_income', warnings) ?? 0,
        monthlyExpenses: 0,
        liquidCash: (() => {
          if (stored.fin_liquid_cash === null || stored.fin_liquid_cash === undefined) return 0;
          const value = Number(stored.fin_liquid_cash);
          const result = z.number().finite().min(-1_000_000_000).max(1_000_000_000).safeParse(value);
          if (result.success) return result.data;
          warnings.push('fin_liquid_cash contains an invalid number and was not loaded.');
          console.error('Invalid stored number for fin_liquid_cash');
          return 0;
        })(),
      },
      cards: parseLegacyJson(stored.fin_cards, z.array(creditCardSchema).max(500), 'fin_cards', warnings) ?? [],
      transactions: parseLegacyJson(stored.fin_transactions, z.array(transactionSchema).max(10_000), 'fin_transactions', warnings) ?? [],
      bills: parseLegacyJson(stored.fin_bills, z.array(billSchema).max(2_000), 'fin_bills', warnings) ?? [],
    },
    warnings,
  };
}

export async function saveFinancialData(
  data: FinancialData,
  storage: StorageAdapter = AsyncStorage
) {
  const validated = financialDataSchema.parse(data);
  const write = pendingWrite.then(async () => {
    await storage.setItem(currentStateKey, JSON.stringify(validated));
    await storage.multiRemove([...legacyKeys]);
  });
  pendingWrite = write.catch(() => undefined);
  await write;
}

export async function clearFinancialData(storage: StorageAdapter = AsyncStorage) {
  const write = pendingWrite.then(() => storage.multiRemove([currentStateKey, ...legacyKeys]));
  pendingWrite = write.catch(() => undefined);
  await write;
}
