import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultFinancialData,
  loadFinancialData,
  saveFinancialData,
  type StorageAdapter,
} from '../src/lib/storage';

class MemoryStorage implements StorageAdapter {
  readonly values = new Map<string, string>();

  async multiGet(keys: readonly string[]) {
    return keys.map(key => [key, this.values.get(key) ?? null] as const);
  }

  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  async multiRemove(keys: readonly string[]) {
    keys.forEach(key => this.values.delete(key));
  }
}

test('loads empty defaults for a new install', async () => {
  const storage = new MemoryStorage();
  const loaded = await loadFinancialData(storage);
  assert.deepEqual(loaded.data, defaultFinancialData);
  assert.deepEqual(loaded.warnings, []);
});

test('migrates valid legacy AsyncStorage keys and persists the unified record', async () => {
  const storage = new MemoryStorage();
  storage.values.set('fin_user_name', 'Taylor');
  storage.values.set('fin_monthly_income', '4200');
  storage.values.set('fin_liquid_cash', '900');
  storage.values.set('fin_theme', 'light');
  storage.values.set('fin_cards', JSON.stringify([{
    id: 'card-1', cardName: 'Everyday', network: 'visa', last4: '1234',
    balance: 120, creditLimit: 1_000, apr: 19.9, dueDate: '', minPayment: 25,
  }]));

  const loaded = await loadFinancialData(storage);
  assert.equal(loaded.data.profile.displayName, 'Taylor');
  assert.equal(loaded.data.profile.monthlyIncome, 4_200);
  assert.equal(loaded.data.profile.monthlyExpenses, 0);
  assert.equal(loaded.data.theme, 'light');
  assert.equal(loaded.data.cards.length, 1);

  await saveFinancialData(loaded.data, storage);
  assert.ok(storage.values.has('fin_app_state_v2'));
  assert.equal(storage.values.has('fin_cards'), false);
  assert.deepEqual((await loadFinancialData(storage)).data, loaded.data);
});

test('fails closed on an invalid current record without overwriting it', async () => {
  const storage = new MemoryStorage();
  storage.values.set('fin_app_state_v2', '{"version":2,"cards":"not-an-array"}');
  await assert.rejects(loadFinancialData(storage), /contains invalid data/);
  assert.equal(storage.values.get('fin_app_state_v2'), '{"version":2,"cards":"not-an-array"}');
});

test('validates before writing and leaves previous data intact on failure', async () => {
  const storage = new MemoryStorage();
  storage.values.set('fin_app_state_v2', 'previous');
  await assert.rejects(
    saveFinancialData({ ...defaultFinancialData, profile: { ...defaultFinancialData.profile, monthlyIncome: -1 } }, storage)
  );
  assert.equal(storage.values.get('fin_app_state_v2'), 'previous');
});
