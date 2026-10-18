import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart2,
  Bot,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  Edit3,
  ExternalLink,
  Home,
  Layers,
  Mic,
  MicOff,
  Moon,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Store,
  Sun,
  Tag,
  Trash2,
  TrendingUp,
  User,
  Wallet
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NetWorthChart } from './components/NetWorthChart.web';
import { PieChart } from './components/PieChart.web';

export interface CreditCardItem {
  id: string;
  cardName: string;
  network: 'visa' | 'mastercard' | 'amex' | 'discover';
  last4: string;
  balance: number;
  creditLimit: number;
  apr: number;
  dueDate: string;
  minPayment: number;
  colorTheme: string;
}

export interface TransactionItem {
  id: string;
  title: string;
  category: string;
  date: string;
  amount: number;
  type: 'income' | 'expense';
  source: string;
}

export interface UpcomingBill {
  id: string;
  bill_name: string;
  due_date: string;
  amount: number;
  paid: boolean;
  category: string;
}

export interface ChatMessageData {
  intent?: 'expense' | 'bills' | 'investments' | 'log_expense' | string;
  total_balance?: number;
  budget_status?: string;
  category_breakdown?: Array<{ category: string; amount: number }>;
  upcoming_bills?: Array<{ bill_name: string; due_date: string; amount: number }>;
  portfolio_health?: string;
  logged_expense?: {
    amount: number;
    merchant: string;
    category: string;
    date?: string;
    id?: string | number;
  };
  safe_to_spend?: {
    dailySafeToSpend: number;
    daysLeft: number;
    status: string;
    statusLabel?: string;
    monthlyBudget?: number;
    spentSoFar?: number;
    upcomingBills?: number;
  };
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'ai' | 'user';
  timestamp: string;
  imagePreview?: string;
  data?: ChatMessageData;
}

const parseStoredArray = <T,>(value: string | null, fallback: T[], key: string): T[] => {
  if (!value) return fallback;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      throw new Error(`Stored value for ${key} is not an array`);
    }
    return parsed as T[];
  } catch (error) {
    console.error(`Failed to parse ${key} from AsyncStorage`, error);
    return fallback;
  }
};

// Initial defaults
const defaultCards: CreditCardItem[] = [];
const defaultTransactions: TransactionItem[] = [];
const defaultBills: UpcomingBill[] = [];

function ChatDataWidgetWeb({
  data,
  isDark,
  setActiveScreen,
}: {
  data: ChatMessageData;
  isDark: boolean;
  setActiveScreen: (screen: 'home' | 'cards' | 'agent' | 'budget' | 'bills' | 'ocr') => void;
}) {
  if (!data) return null;

  // 1. Auto-Logged Expense Card
  if (data.logged_expense) {
    const exp = data.logged_expense;
    return (
      <div
        className={`mt-3 p-3.5 rounded-2xl border text-left shadow-xs transition-all ${
          isDark
            ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-100'
            : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
              Transaction Auto-Logged
            </span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
              isDark
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
                : 'bg-emerald-100 text-emerald-800 border-emerald-300'
            }`}
          >
            Saved Live
          </span>
        </div>

        <div className="flex items-baseline gap-2 mb-2.5">
          <span className="text-2xl font-black font-mono text-rose-400 tabular-nums">
            -${exp.amount.toFixed(2)}
          </span>
          <span className="text-xs text-neutral-400">deducted from Checking</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-2.5 text-xs">
          <div
            className={`px-2.5 py-1 rounded-lg border flex items-center gap-1 font-semibold ${
              isDark ? 'bg-neutral-900/80 border-neutral-800 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
            }`}
          >
            <Store className="w-3.5 h-3.5 text-neutral-400" />
            <span>{exp.merchant}</span>
          </div>

          <div
            className={`px-2.5 py-1 rounded-lg border flex items-center gap-1 font-semibold ${
              isDark ? 'bg-violet-950/40 border-violet-800/40 text-violet-300' : 'bg-violet-50 border-violet-200 text-violet-700'
            }`}
          >
            <Tag className="w-3.5 h-3.5 text-violet-400" />
            <span>{exp.category}</span>
          </div>

          <div
            className={`px-2.5 py-1 rounded-lg border flex items-center gap-1 text-neutral-400 ${
              isDark ? 'bg-neutral-900/80 border-neutral-800' : 'bg-white border-neutral-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{exp.date || 'Today'}</span>
          </div>
        </div>

        {typeof data.total_balance === 'number' && (
          <div
            className="flex items-center justify-between text-xs pt-2 border-t font-mono mb-2"
            style={{ borderColor: isDark ? '#05966930' : '#a7f3d0' }}
          >
            <span className="text-neutral-400">Updated Checking Reserve:</span>
            <span className="font-bold text-emerald-400">${data.total_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setActiveScreen('budget')}
          className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            isDark
              ? 'bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700/40'
              : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>View in Ledger & Activity &rarr;</span>
        </button>
      </div>
    );
  }

  // 2. Budget & Category Breakdown Card
  if (data.category_breakdown && data.category_breakdown.length > 0) {
    const totalSpent = data.category_breakdown.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const isOver = data.budget_status === 'Over Budget';
    const isNear = data.budget_status === 'Nearing Limit';
    const statusColorClass = isOver ? 'text-rose-400 border-rose-500/30 bg-rose-950/40' : (isNear ? 'text-amber-400 border-amber-500/30 bg-amber-950/40' : 'text-emerald-400 border-emerald-500/30 bg-emerald-950/40');

    return (
      <div
        className={`mt-3 p-3.5 rounded-2xl border text-left shadow-xs transition-all ${
          isDark
            ? 'bg-neutral-900/60 border-neutral-800 text-neutral-100'
            : 'bg-white border-neutral-200 text-neutral-900'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5">
            <BarChart2 className="w-4 h-4 text-violet-400" />
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
              Expense Analyst Breakdown
            </span>
          </div>
          {data.budget_status ? (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${statusColorClass}`}>
              {data.budget_status}
            </span>
          ) : null}
        </div>

        <div className="space-y-2 mb-3">
          {data.category_breakdown.map((item, idx) => {
            const pct = totalSpent > 0 ? (item.amount / totalSpent) * 100 : 0;
            return (
              <div key={`${item.category}-${idx}`} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">{item.category}</span>
                  <span className="font-mono text-neutral-400">
                    ${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ({pct.toFixed(0)}%)
                  </span>
                </div>
                <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-neutral-800' : 'bg-neutral-100'}`}>
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {data.safe_to_spend ? (
          <div
            className={`p-2 rounded-xl text-xs flex items-center justify-between mb-2.5 border ${
              isDark ? 'bg-neutral-950/50 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-neutral-400">Daily Safe-to-Spend:</span>
            </div>
            <span className="font-bold font-mono text-emerald-400">
              ${data.safe_to_spend.dailySafeToSpend.toFixed(2)}/day
            </span>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setActiveScreen('budget')}
          className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            isDark
              ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
              : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-violet-400" />
          <span>Open 50/30/20 Targets & Ledger &rarr;</span>
        </button>
      </div>
    );
  }

  // 3. Upcoming Bills & Subscriptions Card
  if (data.upcoming_bills && data.upcoming_bills.length > 0) {
    const totalDue = data.upcoming_bills.reduce((s, b) => s + (Number(b.amount) || 0), 0);
    return (
      <div
        className={`mt-3 p-3.5 rounded-2xl border text-left shadow-xs transition-all ${
          isDark
            ? 'bg-neutral-900/60 border-neutral-800 text-neutral-100'
            : 'bg-white border-neutral-200 text-neutral-900'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
              Upcoming Bills & Subscriptions
            </span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
              isDark ? 'bg-amber-950/40 text-amber-400 border-amber-500/30' : 'bg-amber-100 text-amber-800 border-amber-300'
            }`}
          >
            {data.upcoming_bills.length} Due Soon
          </span>
        </div>

        <div className="space-y-1.5 mb-2.5">
          {data.upcoming_bills.map((bill, idx) => (
            <div
              key={`${bill.bill_name}-${idx}`}
              className={`p-2 rounded-xl border flex items-center justify-between text-xs ${
                isDark ? 'bg-neutral-950/50 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
              }`}
            >
              <div>
                <div className="font-bold">{bill.bill_name}</div>
                <div className="text-[10px] text-neutral-400">Due {bill.due_date}</div>
              </div>
              <div className="font-mono font-bold text-amber-400">
                ${bill.amount.toFixed(2)}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-xs px-1 mb-2.5">
          <span className="text-neutral-400">Total Upcoming Bills:</span>
          <span className="font-bold font-mono text-rose-400">${totalDue.toFixed(2)}</span>
        </div>

        <button
          type="button"
          onClick={() => setActiveScreen('bills')}
          className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            isDark
              ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
              : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-amber-400" />
          <span>Manage & Schedule Bills &rarr;</span>
        </button>
      </div>
    );
  }

  // 4. Portfolio Health & Investment Card
  if (data.portfolio_health) {
    const isHealthy = data.portfolio_health.toLowerCase().includes('healthy') || data.portfolio_health.toLowerCase().includes('good');
    return (
      <div
        className={`mt-3 p-3.5 rounded-2xl border text-left shadow-xs transition-all ${
          isDark
            ? 'bg-neutral-900/60 border-neutral-800 text-neutral-100'
            : 'bg-white border-neutral-200 text-neutral-900'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-violet-400" />
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
              Portfolio Health
            </span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
              isHealthy
                ? isDark ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : isDark ? 'bg-amber-950/40 text-amber-400 border-amber-500/30' : 'bg-amber-100 text-amber-800 border-amber-300'
            }`}
          >
            {data.portfolio_health}
          </span>
        </div>

        {typeof data.total_balance === 'number' && (
          <div className="flex items-baseline gap-2 mb-2.5">
            <span className="text-2xl font-black font-mono tracking-tight tabular-nums">
              ${data.total_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-neutral-400">Combined Assets</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setActiveScreen('cards')}
          className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            isDark
              ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
              : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5 text-violet-400" />
          <span>View Cards & Debt Strategy &rarr;</span>
        </button>
      </div>
    );
  }

  // 5. Standalone Safe-to-Spend Card
  if (data.safe_to_spend) {
    const sts = data.safe_to_spend;
    const isGood = sts.dailySafeToSpend > 0;
    return (
      <div
        className={`mt-3 p-3.5 rounded-2xl border text-left shadow-xs transition-all ${
          isDark
            ? 'bg-neutral-900/60 border-neutral-800 text-neutral-100'
            : 'bg-white border-neutral-200 text-neutral-900'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
              Safe-to-Spend Snapshot
            </span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
              isGood
                ? isDark ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : isDark ? 'bg-rose-950/40 text-rose-400 border-rose-500/30' : 'bg-rose-100 text-rose-800 border-rose-300'
            }`}
          >
            {sts.statusLabel || (isGood ? 'Guilt-Free' : 'Deficit')}
          </span>
        </div>

        <div className="flex items-baseline gap-2 mb-2.5">
          <span className={`text-2xl font-black font-mono tracking-tight tabular-nums ${isGood ? 'text-emerald-400' : 'text-rose-400'}`}>
            ${sts.dailySafeToSpend.toFixed(2)}
          </span>
          <span className="text-xs text-neutral-400">/ day ({sts.daysLeft} days remaining)</span>
        </div>

        <button
          type="button"
          onClick={() => setActiveScreen('budget')}
          className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            isDark
              ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
              : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300'
          }`}
        >
          <BarChart2 className="w-3.5 h-3.5 text-violet-400" />
          <span>Audit Daily Allowance &rarr;</span>
        </button>
      </div>
    );
  }

  return null;
}

export default function App() {
  const [storageReady, setStorageReady] = useState(false);

  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const isDark = theme === 'dark';

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
  };

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Main active screen & history
  const [activeScreen, setActiveScreen] = useState<'home' | 'cards' | 'agent' | 'budget' | 'bills' | 'ocr'>('home');
  const [screenHistory, setScreenHistory] = useState<('home' | 'cards' | 'agent' | 'budget' | 'bills' | 'ocr')[]>(['home']);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const chatAbortControllerRef = useRef<AbortController | null>(null);

  const navigateToScreen = (nextScreen: 'home' | 'cards' | 'agent' | 'budget' | 'bills' | 'ocr') => {
    if (nextScreen === activeScreen) return;
    setScreenHistory((prev) => [...prev, nextScreen]);
    setActiveScreen(nextScreen);
  };

  const goBack = () => {
    if (screenHistory.length <= 1) return;
    setScreenHistory((prev) => {
      const updated = [...prev];
      updated.pop();
      const target = updated[updated.length - 1] ?? 'home';
      setActiveScreen(target);
      return updated;
    });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (deltaX > 70 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && screenHistory.length > 1) {
      goBack();
    }
  };

  const stopAgent = () => {
    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort();
      chatAbortControllerRef.current = null;
    }
    setIsLoadingChat(false);
    setMessages((prev) => [
      ...prev,
      {
        id: `stop-${Date.now()}`,
        sender: 'ai',
        text: '⏹ FinAgent response stopped.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  // User Profile & Onboarding State
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [userName, setUserName] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState<number>(0);
  const [liquidCash, setLiquidCash] = useState<number>(0);

  // Onboarding Wizard Temporary State
  const [onboardStep, setOnboardStep] = useState<1 | 2 | 3>(1);
  const [onboardName, setOnboardName] = useState('');
  const [onboardIncome, setOnboardIncome] = useState('');
  const [onboardCash, setOnboardCash] = useState('');
  const [onboardCards, setOnboardCards] = useState<CreditCardItem[]>([]);
  const [onboardCardName, setOnboardCardName] = useState('');
  const [onboardCardNetwork, setOnboardCardNetwork] = useState<'visa' | 'mastercard' | 'amex' | 'discover'>('visa');
  const [onboardCardBalance, setOnboardCardBalance] = useState('');
  const [onboardCardLimit, setOnboardCardLimit] = useState('');
  const [onboardCardApr, setOnboardCardApr] = useState('');
  const [onboardCardLast4, setOnboardCardLast4] = useState('');
  const [onboardCardDueDate, setOnboardCardDueDate] = useState('');

  // Cards & Transactions
  const [cards, setCards] = useState<CreditCardItem[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [bills, setBills] = useState<UpcomingBill[]>([]);

  useEffect(() => {
    let isMounted = true;

    const loadStoredState = async () => {
      try {
        const entries = await AsyncStorage.multiGet([
          'fin_theme',
          'fin_onboarded',
          'fin_cards',
          'fin_transactions',
          'fin_bills',
          'fin_monthly_income',
          'fin_liquid_cash',
          'fin_user_name',
        ]);
        if (!isMounted) return;

        const stored = Object.fromEntries(entries);
        if (stored.fin_theme === 'dark' || stored.fin_theme === 'light') {
          setTheme(stored.fin_theme);
        }

        const onboarded = stored.fin_onboarded === 'true';
        setIsOnboarded(onboarded);

        if (onboarded) {
          if (stored.fin_user_name) setUserName(stored.fin_user_name);
          if (stored.fin_monthly_income) setMonthlyIncome(Number(stored.fin_monthly_income) || 0);
          if (stored.fin_liquid_cash) setLiquidCash(Number(stored.fin_liquid_cash) || 0);
          setCards(parseStoredArray(stored.fin_cards, [], 'fin_cards'));
          setTransactions(parseStoredArray(stored.fin_transactions, [], 'fin_transactions'));
          setBills(parseStoredArray(stored.fin_bills, [], 'fin_bills'));
        } else {
          // If not onboarded yet, purge any lingering legacy defaults from storage so the user starts fresh
          setUserName('');
          setMonthlyIncome(0);
          setLiquidCash(0);
          setCards([]);
          setTransactions([]);
          setBills([]);
        }
        setStorageReady(true);
      } catch (error) {
        console.error('Failed to load app state from AsyncStorage', error);
      }
    };

    void loadStoredState();
    return () => {
      isMounted = false;
    };
  }, []);

  // Persist only after stored values have been hydrated.
  useEffect(() => {
    if (!storageReady) return;
    void AsyncStorage.setItem('fin_theme', theme).catch(error => {
      console.error('Failed to save fin_theme to AsyncStorage', error);
    });
  }, [storageReady, theme]);

  useEffect(() => {
    if (!storageReady || !isOnboarded) return;
    void AsyncStorage.multiSet([
      ['fin_onboarded', 'true'],
      ['fin_user_name', userName],
      ['fin_monthly_income', String(monthlyIncome)],
      ['fin_liquid_cash', String(liquidCash)],
      ['fin_cards', JSON.stringify(cards)],
      ['fin_transactions', JSON.stringify(transactions)],
      ['fin_bills', JSON.stringify(bills)],
    ]).catch(error => {
      console.error('Failed to save app state to AsyncStorage', error);
    });
  }, [storageReady, isOnboarded, userName, monthlyIncome, liquidCash, cards, transactions, bills]);

  // Onboarding Helpers
  const handleAddOnboardCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onboardCardName.trim()) return;

    const bal = parseFloat(onboardCardBalance) || 0;
    const lim = parseFloat(onboardCardLimit) || 1000;
    const apr = parseFloat(onboardCardApr) || 21.99;

    const gradientMap: Record<string, string> = {
      visa: 'from-blue-900 via-indigo-900 to-slate-900',
      mastercard: 'from-zinc-700 via-neutral-800 to-stone-900',
      amex: 'from-amber-700 via-yellow-800 to-amber-950',
      discover: 'from-teal-800 via-emerald-900 to-slate-900',
    };

    const newCard: CreditCardItem = {
      id: `c-onboard-${Date.now()}`,
      cardName: onboardCardName.trim(),
      network: onboardCardNetwork,
      last4: onboardCardLast4.trim() || '0000',
      balance: bal,
      creditLimit: lim,
      apr,
      dueDate: onboardCardDueDate.trim() || 'End of month',
      minPayment: Math.round(Math.max(15, bal * 0.025)),
      colorTheme: gradientMap[onboardCardNetwork],
    };

    setOnboardCards(prev => [...prev, newCard]);
    setOnboardCardName('');
    setOnboardCardBalance('');
    setOnboardCardLimit('');
    setOnboardCardApr('');
    setOnboardCardLast4('');
    setOnboardCardDueDate('');
    showToast(`Added ${newCard.cardName}`);
  };

  const handleRemoveOnboardCard = (id: string) => {
    setOnboardCards(prev => prev.filter(c => c.id !== id));
  };

  const handleCompleteOnboarding = async () => {
    const finalName = onboardName.trim();
    if (!finalName) {
      setOnboardStep(1);
      return;
    }

    const finalIncome = parseFloat(onboardIncome) || 0;
    const finalCash = parseFloat(onboardCash) || 0;

    setUserName(finalName);
    setMonthlyIncome(finalIncome);
    setLiquidCash(finalCash);
    setCards(onboardCards);
    setIsOnboarded(true);

    try {
      await AsyncStorage.multiSet([
        ['fin_onboarded', 'true'],
        ['fin_user_name', finalName],
        ['fin_monthly_income', String(finalIncome)],
        ['fin_liquid_cash', String(finalCash)],
        ['fin_cards', JSON.stringify(onboardCards)],
        ['fin_transactions', JSON.stringify(transactions)],
        ['fin_bills', JSON.stringify(bills)],
      ]);
    } catch (err) {
      console.error('Failed to save onboarding baseline', err);
    }

    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'ai',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `Welcome, ${finalName}! Your account is ready with ${onboardCards.length} credit card${onboardCards.length === 1 ? '' : 's'} and $${finalIncome.toLocaleString()} monthly income. How can I help optimize your money today?`,
      },
    ]);

    showToast(`Welcome to FinAgent, ${finalName}!`);
  };

  const handleResetData = async () => {
    const confirmed = window.confirm(
      'Reset all data? This will clear all entered profile information, credit cards, income, and transactions and restart onboarding.'
    );
    if (!confirmed) return;

    try {
      await AsyncStorage.multiRemove([
        'fin_onboarded',
        'fin_user_name',
        'fin_cards',
        'fin_transactions',
        'fin_bills',
        'fin_monthly_income',
        'fin_liquid_cash',
      ]);
    } catch (err) {
      console.error('Failed to clear storage:', err);
    }

    setUserName('');
    setMonthlyIncome(0);
    setLiquidCash(0);
    setCards([]);
    setTransactions([]);
    setBills([]);
    setOnboardName('');
    setOnboardIncome('');
    setOnboardCash('');
    setOnboardCards([]);
    setOnboardStep(1);
    setIsOnboarded(false);
    showToast('All data cleared. Welcome to onboarding!');
  };

  // Derived metrics
  const totalCardDebt = cards.reduce((acc, c) => acc + (c.balance || 0), 0);
  const totalCreditLimit = cards.reduce((acc, c) => acc + (c.creditLimit || 0), 0);
  const creditUtilization = totalCreditLimit > 0 ? (totalCardDebt / totalCreditLimit) * 100 : 0;
  const netWorth = liquidCash - totalCardDebt;

  const categoryExpenses = useMemo(() => {
    const map: Record<string, number> = {};
    transactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        map[t.category] = (map[t.category] || 0) + t.amount;
      });
    return Object.entries(map).map(([category, amount]) => ({ category, amount }));
  }, [transactions]);

  const budgetBreakdown = useMemo(() => {
    const NEEDS_CATEGORIES = new Set(['housing', 'rent', 'utilities', 'groceries', 'healthcare', 'bills', 'transport', 'transportation', 'insurance']);
    const SAVINGS_CATEGORIES = new Set(['savings', 'investment', 'debt', 'credit card payment']);

    let needsSpent = 0;
    let wantsSpent = 0;
    let savingsSpent = 0;

    transactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const cat = (t.category || '').toLowerCase().trim();
        if (NEEDS_CATEGORIES.has(cat)) {
          needsSpent += t.amount;
        } else if (SAVINGS_CATEGORIES.has(cat)) {
          savingsSpent += t.amount;
        } else {
          wantsSpent += t.amount;
        }
      });

    const needsTarget = monthlyIncome * 0.5;
    const wantsTarget = monthlyIncome * 0.3;
    const savingsTarget = monthlyIncome * 0.2;

    return {
      needsSpent,
      wantsSpent,
      savingsSpent,
      needsTarget,
      wantsTarget,
      savingsTarget,
      needsPct: needsTarget > 0 ? Math.min(100, (needsSpent / needsTarget) * 100) : 0,
      wantsPct: wantsTarget > 0 ? Math.min(100, (wantsSpent / wantsTarget) * 100) : 0,
      savingsPct: savingsTarget > 0 ? Math.min(100, (savingsSpent / savingsTarget) * 100) : 0,
    };
  }, [transactions, monthlyIncome]);

  const safeToSpendData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const currentDay = now.getDate();
    const daysLeft = Math.max(1, totalDaysInMonth - currentDay + 1);

    const monthlyBudget = monthlyIncome > 0 ? monthlyIncome : (liquidCash > 0 ? liquidCash : 0);

    const spentSoFar = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const upcomingBills = bills
      .filter(b => !b.paid)
      .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

    const remainingPool = monthlyBudget - spentSoFar - upcomingBills;
    const dailyAmount = monthlyBudget > 0 ? remainingPool / daysLeft : 0;
    const dailyBaseline = monthlyBudget > 0 ? monthlyBudget / totalDaysInMonth : 50;

    let status: 'green' | 'amber' | 'red';
    let statusLabel: string;
    let statusDetail: string;

    if (monthlyBudget === 0) {
      status = 'amber';
      statusLabel = 'Budget Not Set';
      statusDetail = 'Set your monthly income or budget in the Budget tab to activate your daily safe-to-spend allowance.';
    } else if (dailyAmount <= 0) {
      status = 'red';
      statusLabel = 'Spending Deficit';
      statusDetail = `Past spending and unpaid bills exceed your monthly budget by $${Math.abs(remainingPool).toFixed(2)}. Pause discretionary purchases.`;
    } else if (dailyAmount < Math.min(25, dailyBaseline * 0.35)) {
      status = 'amber';
      statusLabel = 'Pacing Tight';
      statusDetail = `Daily allowance is low. Cap discretionary spend at $${dailyAmount.toFixed(2)} today to keep all upcoming bills fully covered.`;
    } else {
      status = 'green';
      statusLabel = 'Guilt-Free Spending';
      statusDetail = `You have $${dailyAmount.toFixed(2)} guilt-free to spend today while staying 100% on track for all upcoming bills.`;
    }

    return {
      dailyAmount,
      monthlyBudget,
      spentSoFar,
      upcomingBills,
      remainingPool,
      daysLeft,
      currentDay,
      totalDaysInMonth,
      status,
      statusLabel,
      statusDetail,
    };
  }, [monthlyIncome, liquidCash, transactions, bills]);

  // Modals
  const [showCardModal, setShowCardModal] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cardFormName, setCardFormName] = useState('');
  const [cardFormNetwork, setCardFormNetwork] = useState<'visa' | 'mastercard' | 'amex' | 'discover'>('visa');
  const [cardFormLast4, setCardFormLast4] = useState('');
  const [cardFormBalance, setCardFormBalance] = useState('');
  const [cardFormLimit, setCardFormLimit] = useState('');
  const [cardFormApr, setCardFormApr] = useState('');
  const [cardFormDueDate, setCardFormDueDate] = useState('');

  const [showTxModal, setShowTxModal] = useState(false);
  const [txFormTitle, setTxFormTitle] = useState('');
  const [txFormAmount, setTxFormAmount] = useState('');
  const [txFormCategory, setTxFormCategory] = useState('Groceries');
  const [txFormCard, setTxFormCard] = useState(cards[0]?.cardName || 'Primary Checking');
  const [txFormType, setTxFormType] = useState<'expense' | 'income'>('expense');

  // Transaction Search & Filter
  const [txSearch, setTxSearch] = useState('');
  const [txCategoryFilter, setTxCategoryFilter] = useState('All');

  // Debt Payoff Strategy: 'avalanche' | 'snowball'
  const [debtStrategy, setDebtStrategy] = useState<'avalanche' | 'snowball'>('avalanche');

  // Chat State
  const [inputText, setInputText] = useState('');
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm-init',
      sender: 'ai',
      timestamp: 'Just now',
      text: 'Hello! I am your **FinAgent AI Financial Advisor**.\n\nAdd your credit cards, monthly income, and bills, or tell me your numbers directly in chat and I will calculate your optimal payoff schedule, budget ratios, and interest savings.',
    },
  ]);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Receipt Scanner State
  const [isScanning, setIsScanning] = useState(false);
  const [scannedReceipt, setScannedReceipt] = useState<{
    merchant: string;
    total: number;
    category: string;
    date: string;
  } | null>(null);
  const [showReceiptSheet, setShowReceiptSheet] = useState(false);
  const [receiptFormMerchant, setReceiptFormMerchant] = useState('');
  const [receiptFormDate, setReceiptFormDate] = useState('');
  const [receiptFormTotal, setReceiptFormTotal] = useState('');
  const [receiptFormCategory, setReceiptFormCategory] = useState('Dining');
  const [receiptFormSource, setReceiptFormSource] = useState('Liquid Cash');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeScreen === 'agent') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoadingChat, activeScreen]);

  // Compile full user context to send to server AI
  const getUserContext = () => ({
    cards,
    totalBalance: liquidCash,
    monthlyIncome,
    bills,
    transactions,
    safeToSpend: safeToSpendData,
  });

  // Voice Recording & Speech-to-Text State
  const [isListening, setIsListening] = useState(false);
  const speechRecognitionRef = useRef<any>(null);

  const toggleVoiceRecording = () => {
    if (isListening) {
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch {}
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Speech recognition is not supported in this browser. You can type directly.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      speechRecognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        showToast('Listening... Speak your expense (e.g. "Spent $14 on lunch at Subway")');
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setInputText(transcript);
          handleSendMessage(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          showToast('Microphone access denied. Please grant microphone permission.');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.warn('Speech recognition initialization error:', err);
      setIsListening(false);
    }
  };

  // Conversational Expense Parser
  const parseExpenseText = (text: string) => {
    if (!text || typeof text !== 'string') return null;
    const clean = text.trim();
    const hasExpenseIntent =
      /(spent|paid|bought|cost|charged)\s*(\$|\d)/i.test(clean) ||
      /\$\s*\d+.*(on|at|for)/i.test(clean) ||
      /(on lunch|on dinner|for coffee|at subway|at starbucks|at walmart|for groceries)/i.test(clean);

    if (!hasExpenseIntent) return null;

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

    if (!amount || amount <= 0) return null;

    let merchant = '';
    const atMatch = clean.match(/(?:at|from|to|with)\s+([A-Za-z0-9\s'&]+?)(?:\s+(?:for|on|yesterday|today|with|using|in|\.|$)|$)/i);
    if (atMatch && atMatch[1]) {
      merchant = atMatch[1].trim();
    } else {
      const commonMerchants = ['subway', 'starbucks', 'walmart', 'target', 'amazon', 'uber', 'lyft', 'shell', 'mcdonalds', 'whole foods', "trader joe's"];
      const found = commonMerchants.find(m => clean.toLowerCase().includes(m));
      merchant = found ? (found.charAt(0).toUpperCase() + found.slice(1)) : 'Expense';
    }

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

    return { amount, merchant, category };
  };

  // Send message to AI Agent
  const handleSendMessage = async (userText: string = inputText) => {
    if (!userText.trim()) return;

    // 1. Show the user's message with required ID and timestamp
    const newMessage: ChatMessage = {
      id: `m-${Date.now()}`,
      text: userText,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputText(''); // Clear the input field
    setIsLoadingChat(true);

    const abortController = new AbortController();
    chatAbortControllerRef.current = abortController;

    // Conversational Expense Logging Check (e.g. "Spent $14 on lunch at Subway")
    const localExpense = parseExpenseText(userText);

    // Try posting to server's orchestrator route (/api/chat) first
    try {
      const serverRes = await axios.post('/api/chat', {
        message: userText,
        userContext: getUserContext()
      }, { signal: abortController.signal, timeout: 8000 });

      if (serverRes.data?.ai_reply) {
        if (serverRes.data?.logged_expense || serverRes.data?.transaction) {
          const exp = serverRes.data.logged_expense || serverRes.data.transaction;
          const newTx: TransactionItem = {
            id: exp.id || `tx-${Date.now()}`,
            title: exp.merchant || exp.title || 'Expense',
            amount: Number(exp.amount) || 0,
            category: exp.category || 'Dining',
            date: exp.date || 'Today',
            type: 'expense',
            source: exp.source || 'AI Log',
          };
          setTransactions(prev => [newTx, ...prev]);
          if (typeof serverRes.data.total_balance === 'number') {
            setLiquidCash(serverRes.data.total_balance);
          } else {
            setLiquidCash(prev => Math.max(0, prev - newTx.amount));
          }
          showToast(`Auto-logged $${newTx.amount.toFixed(2)} at ${newTx.title}!`);
        }

        const structuredData: ChatMessageData = {
          intent: serverRes.data.intent,
          total_balance: serverRes.data.total_balance,
          budget_status: serverRes.data.budget_status,
          category_breakdown: serverRes.data.category_breakdown,
          upcoming_bills: serverRes.data.upcoming_bills,
          portfolio_health: serverRes.data.portfolio_health,
          logged_expense: serverRes.data.logged_expense || (serverRes.data.transaction ? {
            amount: Number(serverRes.data.transaction.amount) || 0,
            merchant: serverRes.data.transaction.merchant || serverRes.data.transaction.title || 'Expense',
            category: serverRes.data.transaction.category || 'General',
            date: serverRes.data.transaction.date || 'Today',
          } : undefined),
          safe_to_spend: serverRes.data.safe_to_spend,
        };

        const hasStructured = Boolean(
          structuredData.logged_expense ||
          (structuredData.category_breakdown && structuredData.category_breakdown.length > 0) ||
          (structuredData.upcoming_bills && structuredData.upcoming_bills.length > 0) ||
          structuredData.portfolio_health ||
          structuredData.safe_to_spend
        );

        setMessages(prev => [...prev, {
          id: `ai-${Date.now()}`,
          text: serverRes.data.ai_reply,
          sender: 'ai',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          data: hasStructured ? structuredData : undefined,
        }]);
        setIsLoadingChat(false);
        chatAbortControllerRef.current = null;
        return;
      }
    } catch {
      // Server not reachable or route errored; fall back to local parser or Gemini
    }

    if (localExpense) {
      const newTx: TransactionItem = {
        id: `tx-${Date.now()}`,
        title: localExpense.merchant,
        amount: localExpense.amount,
        category: localExpense.category,
        date: 'Today',
        type: 'expense',
        source: 'AI Log',
      };
      setTransactions(prev => [newTx, ...prev]);
      setLiquidCash(prev => Math.max(0, prev - newTx.amount));
      showToast(`Auto-logged $${newTx.amount.toFixed(2)} at ${newTx.title} under ${newTx.category}!`);
      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        text: `Logged $${newTx.amount.toFixed(2)} at ${newTx.title} under ${newTx.category} automatically. Added to your transactions!`,
        sender: 'ai',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        data: {
          intent: 'log_expense',
          logged_expense: {
            amount: newTx.amount,
            merchant: newTx.title,
            category: newTx.category,
            date: newTx.date,
          },
          total_balance: Math.max(0, liquidCash - newTx.amount),
        },
      }]);
      setIsLoadingChat(false);
      chatAbortControllerRef.current = null;
      return;
    }

    try {
      // 2. Fetch Request to Gemini API with full user financial grounding
      const API_KEY = "AQ.Ab8RN6J2p2avPS0x_golP47tuHGFHHZMJGeKmDtOZP7NdfMQmg"; 
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${API_KEY}`;

      const systemPrompt = `You are FinAgent, a personal AI Financial Advisor.
STRICT RULE: ONLY use the user's real data provided below. NEVER fabricate or assume hardcoded credit cards, debt, or income.
If a financial parameter is missing or zero, tell the user to add it in the app.

User's Live Profile:
- Monthly Income: $${monthlyIncome.toFixed(2)}
- Liquid Bank Cash: $${liquidCash.toFixed(2)}
- Connected Credit Cards: ${JSON.stringify(cards)}
- Total Card Debt: $${totalCardDebt.toFixed(2)}
- Total Credit Line: $${totalCreditLimit.toFixed(2)}
- Aggregate Utilization: ${creditUtilization.toFixed(1)}%
- Upcoming Bills: ${JSON.stringify(bills)}
- Recent Transactions: ${JSON.stringify(transactions.slice(0, 10))}

User Message: "${userText}"`;

      const response = await fetch(url, {
        method: "POST",
        signal: abortController.signal,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: systemPrompt }]
          }]
        })
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }

      const aiReply = data.candidates[0].content.parts[0].text;

      // 3. Show the real AI response with required properties
      setMessages((prev) => [...prev, { 
        id: `ai-${Date.now()}`, 
        text: aiReply, 
        sender: 'ai', 
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      }]);

    } catch (error: any) {
      if (error?.name === 'AbortError' || abortController.signal.aborted) {
        return;
      }
      console.error("Error connecting to Gemini:", error);
      setMessages((prev) => [...prev, { 
        id: `err-${Date.now()}`, 
        sender: 'ai', 
        text: "Connection error. Check your API key and network.", 
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      }]);
    } finally {
      setIsLoadingChat(false);
      chatAbortControllerRef.current = null;
    }
  };

  // Receipt Upload & OCR
  const handleReceiptFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64Data = dataUrl.split(',')[1];
      const mimeType = file.type || 'image/jpeg';

      setIsScanning(true);
      setActiveScreen('ocr');

      try {
        const response = await axios.post('/api/receipt', {
          base64Image: base64Data,
          mimeType,
        });

        const data = response.data;
        const totalNum = Number(data.total);
        if (!Number.isFinite(totalNum) || totalNum <= 0 || !data.merchant) {
          throw new Error('Unable to extract receipt details');
        }
        const merchant = data.merchant;
        const category = data.category || 'Dining';
        const date = data.date || new Date().toISOString().split('T')[0];

        setScannedReceipt({
          merchant,
          total: totalNum,
          category,
          date,
        });
        setReceiptFormMerchant(merchant);
        setReceiptFormDate(date);
        setReceiptFormTotal(totalNum.toFixed(2));
        setReceiptFormCategory(category);
        setReceiptFormSource(cards[0]?.cardName || 'Liquid Cash');
        setShowReceiptSheet(true);
        showToast(`Receipt analyzed: ${merchant} ($${totalNum.toFixed(2)})`);
      } catch (err) {
        console.warn('OCR error:', err);
        showToast('Could not read receipt image. Please try a clearer photo or enter details manually.');
      } finally {
        setIsScanning(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  // One-Tap Confirm & Add to Expenses handler
  const confirmAndAddReceiptExpense = () => {
    const amount = parseFloat(receiptFormTotal.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Please enter a valid expense total greater than $0.');
      return;
    }

    const merchant = receiptFormMerchant.trim() || 'Receipt Expense';
    const category = receiptFormCategory.trim() || 'General';
    const date = receiptFormDate.trim() || 'Today';
    const targetSource = receiptFormSource || (cards[0]?.cardName || 'Liquid Cash');

    const newTx: TransactionItem = {
      id: `tx-${Date.now()}`,
      title: merchant,
      category,
      date,
      amount,
      type: 'expense',
      source: targetSource,
    };
    setTransactions(prev => [newTx, ...prev]);

    const targetCard = cards.find(c => c.cardName === targetSource);
    if (targetCard) {
      setCards(prev =>
        prev.map(c => (c.cardName === targetSource ? { ...c, balance: c.balance + amount } : c))
      );
    } else {
      setLiquidCash(prev => Math.max(0, prev - amount));
    }

    setShowReceiptSheet(false);
    setScannedReceipt(null);
    showToast(`Added $${amount.toFixed(2)} at ${merchant} to expenses!`);
    setActiveScreen('home');
  };

  const handleDemoReceipt = () => {
    const demo = {
      merchant: 'Subway',
      date: new Date().toISOString().split('T')[0],
      total: 14.0,
      category: 'Dining',
    };
    setScannedReceipt(demo);
    setReceiptFormMerchant(demo.merchant);
    setReceiptFormDate(demo.date);
    setReceiptFormTotal(demo.total.toFixed(2));
    setReceiptFormCategory(demo.category);
    setReceiptFormSource(cards[0]?.cardName || 'Liquid Cash');
    setShowReceiptSheet(true);
  };

  // Confirm Scanned Receipt (Legacy Quick Action)
  const confirmScannedReceipt = (targetCardName: string) => {
    if (!scannedReceipt) return;
    const amount = scannedReceipt.total;

    // Add transaction
    const newTx: TransactionItem = {
      id: `tx-${Date.now()}`,
      title: scannedReceipt.merchant,
      category: scannedReceipt.category,
      date: scannedReceipt.date || 'Today',
      amount,
      type: 'expense',
      source: targetCardName,
    };
    setTransactions(prev => [newTx, ...prev]);

    // Update card balance
    setCards(prev =>
      prev.map(c => (c.cardName === targetCardName ? { ...c, balance: c.balance + amount } : c))
    );

    setScannedReceipt(null);
    showToast(`Logged $${amount.toFixed(2)} to ${targetCardName}`);
    setActiveScreen('home');
  };

  // Add / Edit Card
  const handleSaveCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardFormName.trim()) return;

    const bal = parseFloat(cardFormBalance) || 0;
    const lim = parseFloat(cardFormLimit) || 1000;
    const apr = parseFloat(cardFormApr) || 21.99;

    const gradientMap: Record<string, string> = {
      visa: 'from-blue-900 via-indigo-900 to-slate-900',
      mastercard: 'from-zinc-700 via-neutral-800 to-stone-900',
      amex: 'from-amber-700 via-yellow-800 to-amber-950',
      discover: 'from-teal-800 via-emerald-900 to-slate-900',
    };

    if (editingCardId) {
      setCards(prev =>
        prev.map(c =>
          c.id === editingCardId
            ? {
                ...c,
                cardName: cardFormName,
                network: cardFormNetwork,
                last4: cardFormLast4 || c.last4,
                balance: bal,
                creditLimit: lim,
                apr,
                dueDate: cardFormDueDate,
                colorTheme: gradientMap[cardFormNetwork],
              }
            : c
        )
      );
      showToast('Card updated!');
    } else {
      const newCard: CreditCardItem = {
        id: `c-${Date.now()}`,
        cardName: cardFormName,
        network: cardFormNetwork,
        last4: cardFormLast4.trim() || '0000',
        balance: bal,
        creditLimit: lim,
        apr,
        dueDate: cardFormDueDate.trim() || 'End of month',
        minPayment: Math.round(Math.max(15, bal * 0.025)),
        colorTheme: gradientMap[cardFormNetwork],
      };
      setCards(prev => [...prev, newCard]);
      showToast(`Added ${cardFormName}`);
    }
    setShowCardModal(false);
  };

  // Add Transaction
  const handleSaveTx = (e: React.FormEvent) => {
    e.preventDefault();
    if (!txFormTitle.trim()) return;
    const amount = parseFloat(txFormAmount) || 0;

    const newTx: TransactionItem = {
      id: `tx-${Date.now()}`,
      title: txFormTitle,
      category: txFormCategory,
      date: 'Today',
      amount,
      type: txFormType,
      source: txFormCard,
    };

    setTransactions(prev => [newTx, ...prev]);

    if (txFormType === 'income') {
      setLiquidCash(prev => prev + amount);
    } else {
      // Check if source matches a credit card
      const isCard = cards.some(c => c.cardName === txFormCard);
      if (isCard) {
        setCards(prev =>
          prev.map(c => (c.cardName === txFormCard ? { ...c, balance: c.balance + amount } : c))
        );
      } else {
        setLiquidCash(prev => Math.max(0, prev - amount));
      }
    }

    setShowTxModal(false);
    setTxFormTitle('');
    setTxFormAmount('');
    showToast(`Logged ${txFormType}: $${amount.toFixed(2)}`);
  };

  // Filtered transactions
  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch = tx.title.toLowerCase().includes(txSearch.toLowerCase()) || tx.category.toLowerCase().includes(txSearch.toLowerCase());
    const matchesCategory = txCategoryFilter === 'All' || tx.category === txCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Debt Payoff calculations
  const sortedCards = [...cards].sort((a, b) => {
    if (debtStrategy === 'avalanche') {
      return b.apr - a.apr; // highest APR first
    } else {
      return a.balance - b.balance; // lowest balance first
    }
  });

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="min-h-screen flex flex-col font-sans transition-colors duration-200 select-none"
      style={{
        backgroundColor: isDark ? '#09090b' : '#f8fafc',
        color: isDark ? '#fafafa' : '#09090b',
      }}
    >
      {/* Hidden File Input for Receipt Camera/Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleReceiptFile}
        accept="image/*"
        className="hidden"
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-8 right-6 z-50 bg-violet-600 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-sm font-semibold animate-toast">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modal: Add/Edit Card */}
      {showCardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-modal-backdrop">
          <div
            className="w-full max-w-md rounded-2xl border p-6 shadow-2xl transition-all animate-modal-content"
            style={{
              backgroundColor: isDark ? '#14141a' : '#ffffff',
              borderColor: isDark ? '#272733' : '#e2e8f0',
            }}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-violet-400" />
                <span>{editingCardId ? 'Edit Credit Card' : 'Add Credit Card'}</span>
              </h3>
              <button
                onClick={() => setShowCardModal(false)}
                className="text-neutral-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCard} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1">Card Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chase Sapphire, Amex Gold"
                  value={cardFormName}
                  onChange={e => setCardFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none"
                  style={{
                    backgroundColor: isDark ? '#0d0d11' : '#f8fafc',
                    borderColor: isDark ? '#262633' : '#cbd5e1',
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 mb-1">Network</label>
                  <select
                    value={cardFormNetwork}
                    onChange={e => setCardFormNetwork(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                    style={{
                      backgroundColor: isDark ? '#0d0d11' : '#f8fafc',
                      borderColor: isDark ? '#262633' : '#cbd5e1',
                    }}
                  >
                    <option value="visa">Visa</option>
                    <option value="mastercard">Mastercard</option>
                    <option value="amex">Amex</option>
                    <option value="discover">Discover</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-400 mb-1">Last 4 Digits</label>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="1234"
                    value={cardFormLast4}
                    onChange={e => setCardFormLast4(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-sm border outline-none"
                    style={{
                      backgroundColor: isDark ? '#0d0d11' : '#f8fafc',
                      borderColor: isDark ? '#262633' : '#cbd5e1',
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 mb-1">Balance ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={cardFormBalance}
                    onChange={e => setCardFormBalance(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-sm border outline-none"
                    style={{
                      backgroundColor: isDark ? '#0d0d11' : '#f8fafc',
                      borderColor: isDark ? '#262633' : '#cbd5e1',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-400 mb-1">Credit Limit ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={cardFormLimit}
                    onChange={e => setCardFormLimit(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-sm border outline-none"
                    style={{
                      backgroundColor: isDark ? '#0d0d11' : '#f8fafc',
                      borderColor: isDark ? '#262633' : '#cbd5e1',
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 mb-1">APR (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={cardFormApr}
                    onChange={e => setCardFormApr(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-sm border outline-none"
                    style={{
                      backgroundColor: isDark ? '#0d0d11' : '#f8fafc',
                      borderColor: isDark ? '#262633' : '#cbd5e1',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-400 mb-1">Due Date</label>
                  <input
                    type="text"
                    placeholder="e.g. 15th of month"
                    value={cardFormDueDate}
                    onChange={e => setCardFormDueDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-sm border outline-none"
                    style={{
                      backgroundColor: isDark ? '#0d0d11' : '#f8fafc',
                      borderColor: isDark ? '#262633' : '#cbd5e1',
                    }}
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCardModal(false)}
                  className="flex-1 py-2.5 rounded-xl border text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-md"
                >
                  {editingCardId ? 'Update Card' : 'Save Card'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Transaction */}
      {showTxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-modal-backdrop">
          <div
            className="w-full max-w-md rounded-2xl border p-6 shadow-2xl transition-all animate-modal-content"
            style={{
              backgroundColor: isDark ? '#14141a' : '#ffffff',
              borderColor: isDark ? '#272733' : '#e2e8f0',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">Log Transaction</h3>
              <button onClick={() => setShowTxModal(false)} className="text-neutral-400 p-1">✕</button>
            </div>

            <form onSubmit={handleSaveTx} className="space-y-4">
              <div className="flex rounded-xl p-1 border text-xs font-semibold" style={{ borderColor: isDark ? '#262633' : '#e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setTxFormType('expense')}
                  className={`flex-1 py-1.5 rounded-lg transition-all ${txFormType === 'expense' ? 'bg-pink-600 text-white' : 'text-neutral-400'}`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setTxFormType('income')}
                  className={`flex-1 py-1.5 rounded-lg transition-all ${txFormType === 'income' ? 'bg-emerald-600 text-white' : 'text-neutral-400'}`}
                >
                  Income
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1">Merchant / Payee</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Target, Uber, Freelance"
                  value={txFormTitle}
                  onChange={e => setTxFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none"
                  style={{ backgroundColor: isDark ? '#0d0d11' : '#f8fafc', borderColor: isDark ? '#262633' : '#cbd5e1' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 mb-1">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={txFormAmount}
                    onChange={e => setTxFormAmount(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-sm border outline-none"
                    style={{ backgroundColor: isDark ? '#0d0d11' : '#f8fafc', borderColor: isDark ? '#262633' : '#cbd5e1' }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-400 mb-1">Category</label>
                  <select
                    value={txFormCategory}
                    onChange={e => setTxFormCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                    style={{ backgroundColor: isDark ? '#0d0d11' : '#f8fafc', borderColor: isDark ? '#262633' : '#cbd5e1' }}
                  >
                    <option value="Groceries">Groceries</option>
                    <option value="Dining">Dining & Cafes</option>
                    <option value="Housing">Housing & Rent</option>
                    <option value="Utilities">Utilities</option>
                    <option value="Transportation">Transportation</option>
                    <option value="Entertainment">Entertainment</option>
                    <option value="Income">Income / Salary</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1">Account / Card Used</label>
                <select
                  value={txFormCard}
                  onChange={e => setTxFormCard(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                  style={{ backgroundColor: isDark ? '#0d0d11' : '#f8fafc', borderColor: isDark ? '#262633' : '#cbd5e1' }}
                >
                  <option value="Primary Checking">Primary Checking Account</option>
                  {cards.map(c => (
                    <option key={c.id} value={c.cardName}>{c.cardName} (•••• {c.last4})</option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button type="button" onClick={() => setShowTxModal(false)} className="flex-1 py-2.5 rounded-xl border text-xs font-semibold">
                  Cancel
                </button>
                <button type="submit" className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-md">
                  Log Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slide-Up Bottom Modal: One-Tap Receipt Confirmation Sheet */}
      {showReceiptSheet && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-modal-backdrop">
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border-t sm:border p-6 shadow-2xl transition-all animate-modal-content max-h-[92vh] overflow-y-auto"
            style={{
              backgroundColor: isDark ? '#14141a' : '#ffffff',
              borderColor: isDark ? '#272733' : '#e2e8f0',
            }}
          >
            {/* Grab handle for bottom sheet on mobile */}
            <div className="w-10 h-1 bg-neutral-600 rounded-full mx-auto mb-4 sm:hidden" />

            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-[10px] font-bold text-violet-400 tracking-wider uppercase">
                  Receipt OCR Confirmation
                </span>
                <h3 className="text-lg font-bold">Review & Confirm Receipt</h3>
                <p className="text-xs text-neutral-400">
                  Pre-filled from OCR scan. Edit fields before adding.
                </p>
              </div>
              <button
                onClick={() => setShowReceiptSheet(false)}
                className="text-neutral-400 hover:text-white p-1 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                confirmAndAddReceiptExpense();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1">
                  Merchant / Business
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Subway, Target"
                  value={receiptFormMerchant}
                  onChange={e => setReceiptFormMerchant(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none font-semibold"
                  style={{
                    backgroundColor: isDark ? '#0d0d11' : '#f8fafc',
                    borderColor: isDark ? '#262633' : '#cbd5e1',
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 mb-1">
                    Total Amount ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={receiptFormTotal}
                    onChange={e => setReceiptFormTotal(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-sm border outline-none font-mono font-bold"
                    style={{
                      backgroundColor: isDark ? '#0d0d11' : '#f8fafc',
                      borderColor: isDark ? '#262633' : '#cbd5e1',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-400 mb-1">
                    Date
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="YYYY-MM-DD"
                    value={receiptFormDate}
                    onChange={e => setReceiptFormDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl text-sm border outline-none font-mono"
                    style={{
                      backgroundColor: isDark ? '#0d0d11' : '#f8fafc',
                      borderColor: isDark ? '#262633' : '#cbd5e1',
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dining, Groceries"
                  value={receiptFormCategory}
                  onChange={e => setReceiptFormCategory(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border outline-none mb-2"
                  style={{
                    backgroundColor: isDark ? '#0d0d11' : '#f8fafc',
                    borderColor: isDark ? '#262633' : '#cbd5e1',
                  }}
                />
                <div className="flex flex-wrap gap-1.5">
                  {['Dining', 'Groceries', 'Shopping', 'Transport', 'Utilities', 'Entertainment'].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setReceiptFormCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
                        receiptFormCategory.toLowerCase() === cat.toLowerCase()
                          ? 'bg-violet-600 text-white border-violet-500'
                          : 'border-neutral-800 text-neutral-400 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1">
                  Payment Account / Card
                </label>
                <select
                  value={receiptFormSource}
                  onChange={e => setReceiptFormSource(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                  style={{
                    backgroundColor: isDark ? '#0d0d11' : '#f8fafc',
                    borderColor: isDark ? '#262633' : '#cbd5e1',
                  }}
                >
                  <option value="Liquid Cash">Liquid Cash / Checking</option>
                  {cards.map(c => (
                    <option key={c.id} value={c.cardName}>
                      {c.cardName} (•••• {c.last4})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm shadow-lg shadow-violet-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm & Add to Expenses</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {!storageReady ? (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg font-black text-xl mb-4 animate-pulse">
            F
          </div>
          <p className="text-sm font-semibold text-neutral-400">Loading your financial workspace...</p>
        </div>
      ) : !isOnboarded ? (
        <div className="min-h-screen flex flex-col justify-between p-4 sm:p-6 max-w-2xl mx-auto w-full">
          {/* Onboarding Header */}
          <div className="flex items-center justify-between pb-6 border-b" style={{ borderColor: isDark ? '#20202a' : '#e2e8f0' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-md font-black text-lg">
                F
              </div>
              <div>
                <span className="font-extrabold text-base tracking-tight leading-none block">FinAgent</span>
                <span className="text-[11px] text-neutral-400 font-medium">Setup & Personalization</span>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl border text-neutral-400 hover:text-white transition-colors cursor-pointer"
              style={{ borderColor: isDark ? '#262633' : '#e2e8f0' }}
              title="Toggle Theme"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-violet-600" />}
            </button>
          </div>

          {/* Onboarding Wizard Card */}
          <div
            className="my-auto py-8 px-6 sm:px-10 rounded-3xl border shadow-2xl transition-all"
            style={{
              backgroundColor: isDark ? '#111116' : '#ffffff',
              borderColor: isDark ? '#20202a' : '#e2e8f0',
            }}
          >
            {/* Step Progress Pills */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                {[
                  { step: 1, label: 'Identity' },
                  { step: 2, label: 'Cash Flow' },
                  { step: 3, label: 'Cards' },
                ].map(s => (
                  <div
                    key={s.step}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                      onboardStep === s.step
                        ? 'bg-violet-600 text-white shadow-xs'
                        : onboardStep > s.step
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-neutral-800/40 text-neutral-500'
                    }`}
                  >
                    <span>{s.step}</span>
                    <span className="hidden sm:inline">· {s.label}</span>
                  </div>
                ))}
              </div>
              <span className="text-xs font-semibold text-neutral-400">Step {onboardStep} of 3</span>
            </div>

            {/* STEP 1: IDENTITY */}
            {onboardStep === 1 && (
              <div className="space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-violet-600/10 border border-violet-500/20 text-violet-400 flex items-center justify-center">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-black tracking-tight">Welcome to FinAgent</h2>
                  <p className="text-sm text-neutral-400 mt-1 leading-relaxed">
                    Your AI-powered personal financial strategist. We start fresh with zero preset accounts or hardcoded data. What should we call you?
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                    Your Preferred Name
                  </label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Enter your name"
                    value={onboardName}
                    onChange={e => setOnboardName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && onboardName.trim()) {
                        setOnboardStep(2);
                      }
                    }}
                    className="w-full px-4 py-3.5 rounded-2xl border text-base font-semibold outline-none transition-all focus:ring-2 focus:ring-violet-500/50"
                    style={{
                      backgroundColor: isDark ? '#16161e' : '#f8fafc',
                      borderColor: isDark ? '#262634' : '#cbd5e1',
                    }}
                  />
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    disabled={!onboardName.trim()}
                    onClick={() => setOnboardStep(2)}
                    className="px-6 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm flex items-center gap-2 shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <span>Continue to Baseline</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: FINANCIAL BASELINE */}
            {onboardStep === 2 && (
              <div className="space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <ArrowDownLeft className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-black tracking-tight">Establish Your Baseline</h2>
                  <p className="text-sm text-neutral-400 mt-1 leading-relaxed">
                    FinAgent calculates your real-time net worth and debt payoff timelines from your take-home income and liquid cash.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                      Monthly Take-Home Income ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={onboardIncome}
                      onChange={e => setOnboardIncome(e.target.value)}
                      className="w-full px-4 py-3.5 rounded-2xl border text-base font-bold font-mono outline-none transition-all focus:ring-2 focus:ring-violet-500/50"
                      style={{
                        backgroundColor: isDark ? '#16161e' : '#f8fafc',
                        borderColor: isDark ? '#262634' : '#cbd5e1',
                      }}
                    />
                    <p className="text-[11px] text-neutral-500 mt-1">Your total net monthly earnings after tax.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                      Liquid Cash & Checking Reserves ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={onboardCash}
                      onChange={e => setOnboardCash(e.target.value)}
                      className="w-full px-4 py-3.5 rounded-2xl border text-base font-bold font-mono outline-none transition-all focus:ring-2 focus:ring-violet-500/50"
                      style={{
                        backgroundColor: isDark ? '#16161e' : '#f8fafc',
                        borderColor: isDark ? '#262634' : '#cbd5e1',
                      }}
                    />
                    <p className="text-[11px] text-neutral-500 mt-1">Available balance in your bank accounts and cash.</p>
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setOnboardStep(1)}
                    className="px-4 py-2.5 rounded-xl border text-xs font-semibold hover:bg-neutral-800/20 transition-all flex items-center gap-1.5 cursor-pointer"
                    style={{ borderColor: isDark ? '#262634' : '#cbd5e1' }}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Back</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOnboardStep(3)}
                    className="px-6 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm flex items-center gap-2 shadow-lg transition-all cursor-pointer"
                  >
                    <span>Continue to Credit Cards</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: CREDIT CARDS */}
            {onboardStep === 3 && (
              <div className="space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-black tracking-tight">Credit Cards & Accounts</h2>
                  <p className="text-sm text-neutral-400 mt-1 leading-relaxed">
                    Add any active credit cards you want to track for APR and debt payoff strategy. If you don't carry any credit cards, you can skip right to the dashboard!
                  </p>
                </div>

                {/* Sub-form to add a card */}
                <form
                  onSubmit={handleAddOnboardCard}
                  className="p-4 rounded-2xl border space-y-3"
                  style={{
                    backgroundColor: isDark ? '#16161e' : '#f8fafc',
                    borderColor: isDark ? '#262634' : '#cbd5e1',
                  }}
                >
                  <span className="text-xs font-bold text-neutral-300 block mb-1">Add a Card</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-400 mb-1">Card Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Chase Freedom, Apple Card"
                        value={onboardCardName}
                        onChange={e => setOnboardCardName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-xs border outline-none"
                        style={{ backgroundColor: isDark ? '#0d0d11' : '#ffffff', borderColor: isDark ? '#262633' : '#cbd5e1' }}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-400 mb-1">Network</label>
                      <select
                        value={onboardCardNetwork}
                        onChange={e => setOnboardCardNetwork(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl text-xs border outline-none"
                        style={{ backgroundColor: isDark ? '#0d0d11' : '#ffffff', borderColor: isDark ? '#262633' : '#cbd5e1' }}
                      >
                        <option value="visa">Visa</option>
                        <option value="mastercard">Mastercard</option>
                        <option value="amex">Amex</option>
                        <option value="discover">Discover</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-400 mb-1">Balance ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={onboardCardBalance}
                        onChange={e => setOnboardCardBalance(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-xs border outline-none font-mono"
                        style={{ backgroundColor: isDark ? '#0d0d11' : '#ffffff', borderColor: isDark ? '#262633' : '#cbd5e1' }}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-400 mb-1">Limit ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="1000.00"
                        value={onboardCardLimit}
                        onChange={e => setOnboardCardLimit(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-xs border outline-none font-mono"
                        style={{ backgroundColor: isDark ? '#0d0d11' : '#ffffff', borderColor: isDark ? '#262633' : '#cbd5e1' }}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-400 mb-1">APR (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="21.99"
                        value={onboardCardApr}
                        onChange={e => setOnboardCardApr(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-xs border outline-none font-mono"
                        style={{ backgroundColor: isDark ? '#0d0d11' : '#ffffff', borderColor: isDark ? '#262633' : '#cbd5e1' }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-neutral-500">Optional: you can also edit or add cards later</span>
                    <button
                      type="submit"
                      disabled={!onboardCardName.trim()}
                      className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold disabled:opacity-40 cursor-pointer"
                    >
                      + Add This Card
                    </button>
                  </div>
                </form>

                {/* Added cards list */}
                {onboardCards.length > 0 ? (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">
                      Added Cards ({onboardCards.length})
                    </span>
                    <div className="space-y-2">
                      {onboardCards.map(c => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between p-3 rounded-xl border text-xs"
                          style={{ backgroundColor: isDark ? '#16161e' : '#f8fafc', borderColor: isDark ? '#262634' : '#cbd5e1' }}
                        >
                          <div className="flex items-center gap-2.5">
                            <CreditCard className="w-4 h-4 text-violet-400" />
                            <div>
                              <span className="font-bold block">{c.cardName}</span>
                              <span className="text-neutral-500 text-[11px]">
                                Bal: ${c.balance.toFixed(2)} · Limit: ${c.creditLimit.toFixed(2)} · {c.apr}% APR
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveOnboardCard(c.id)}
                            className="p-1 text-neutral-400 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Remove card"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    className="p-4 rounded-xl border text-center text-xs text-neutral-400"
                    style={{ backgroundColor: isDark ? '#16161e' : '#f8fafc', borderColor: isDark ? '#262634' : '#cbd5e1' }}
                  >
                    No cards added yet. You can add them here or later from the Cards & Debt screen.
                  </div>
                )}

                <div className="pt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setOnboardStep(2)}
                    className="px-4 py-2.5 rounded-xl border text-xs font-semibold hover:bg-neutral-800/20 transition-all flex items-center gap-1.5 cursor-pointer"
                    style={{ borderColor: isDark ? '#262634' : '#cbd5e1' }}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Back</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCompleteOnboarding}
                    className="px-6 py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-sm flex items-center gap-2 shadow-lg transition-all cursor-pointer"
                  >
                    <span>{onboardCards.length > 0 ? 'Finish Setup & Open App' : 'Skip & Open App'}</span>
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className="text-center text-[11px] text-neutral-500 pt-4">
            FinAgent stores your data privately on your device.
          </div>
        </div>
      ) : (
        <>
          {/* Top Application Bar */}
          <header
            className="border-b sticky top-0 z-40 backdrop-blur-md transition-colors"
            style={{
              backgroundColor: isDark ? 'rgba(9, 9, 11, 0.95)' : 'rgba(255, 255, 255, 0.95)',
              borderColor: isDark ? '#1f1f28' : '#e2e8f0',
            }}
          >
            <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
              {/* Brand Mark */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-sm font-black text-base">
                  F
                </div>
                <div>
                  <span className="font-extrabold text-base tracking-tight leading-none block">FinAgent</span>
                  <span className="text-[11px] text-neutral-400 font-medium">Smart Personal Finance & Debt Manager</span>
                </div>
              </div>

              {/* Desktop Navigation */}
              <nav className="hidden md:flex items-center gap-1 text-sm font-semibold">
                {[
                  { id: 'home', label: 'Dashboard', icon: Home },
                  { id: 'cards', label: 'Cards & Debt', icon: CreditCard, count: cards.length },
                  { id: 'agent', label: 'FinAgent AI', icon: Bot, badge: 'Advisor' },
                  { id: 'budget', label: 'Budget & Ledger', icon: Layers },
                  { id: 'bills', label: 'Bills', icon: Calendar, count: bills.length },
                  { id: 'ocr', label: 'Receipts', icon: Receipt },
                ].map(tab => {
                  const active = activeScreen === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveScreen(tab.id as any)}
                      className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                        active
                          ? 'bg-violet-600 text-white shadow-xs font-bold'
                          : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/40'
                      }`}
                    >
                      <tab.icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                      {tab.badge && (
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-violet-500/10 text-violet-400'}`}>
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              {/* Actions & Theme */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setShowTxModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Add Entry</span>
                </button>

                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-xl border text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  style={{ borderColor: isDark ? '#262633' : '#e2e8f0' }}
                  title="Toggle Dark / Light Theme"
                >
                  {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-violet-600" />}
                </button>

                <button
                  onClick={handleResetData}
                  className="p-2 rounded-xl border text-neutral-400 hover:text-rose-400 hover:border-rose-500/40 transition-colors cursor-pointer"
                  style={{ borderColor: isDark ? '#262633' : '#e2e8f0' }}
                  title="Reset All Data & Re-Onboard"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>
          </header>

      {/* Main App Content Viewport */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 pb-24 md:pb-10">
        {/* ========================================================================= */}
        {/* VIEW 1: HOME / DASHBOARD */}
        {/* ========================================================================= */}
        {activeScreen === 'home' && (
          <div className="space-y-6">
            {/* Daily Safe-to-Spend Hero Metric Card */}
            <div
              className={`p-6 sm:p-7 rounded-3xl border shadow-sm relative overflow-hidden transition-all duration-200 ${
                safeToSpendData.status === 'green'
                  ? isDark
                    ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-950/25 via-neutral-900/60 to-neutral-900/40'
                    : 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/30'
                  : safeToSpendData.status === 'amber'
                  ? isDark
                    ? 'border-amber-500/30 bg-gradient-to-br from-amber-950/25 via-neutral-900/60 to-neutral-900/40'
                    : 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-amber-50/30'
                  : isDark
                  ? 'border-rose-500/30 bg-gradient-to-br from-rose-950/25 via-neutral-900/60 to-neutral-900/40'
                  : 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-rose-50/30'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      safeToSpendData.status === 'green'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : safeToSpendData.status === 'amber'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-rose-500/20 text-rose-400'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                    Daily Safe-to-Spend
                  </span>
                </div>

                <div
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 self-start sm:self-auto border ${
                    safeToSpendData.status === 'green'
                      ? isDark
                        ? 'bg-emerald-950/50 text-emerald-400 border-emerald-500/30'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : safeToSpendData.status === 'amber'
                      ? isDark
                        ? 'bg-amber-950/50 text-amber-400 border-amber-500/30'
                        : 'bg-amber-100 text-amber-800 border-amber-300'
                      : isDark
                      ? 'bg-rose-950/50 text-rose-400 border-rose-500/30'
                      : 'bg-rose-100 text-rose-800 border-rose-300'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      safeToSpendData.status === 'green'
                        ? 'bg-emerald-400 animate-pulse'
                        : safeToSpendData.status === 'amber'
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                    }`}
                  />
                  <span>{safeToSpendData.statusLabel}</span>
                </div>
              </div>

              {/* Big Hero Number */}
              <div className="flex items-baseline gap-2 mb-3">
                <span
                  className={`text-4xl sm:text-5xl font-black font-mono tracking-tight tabular-nums ${
                    safeToSpendData.status === 'green'
                      ? 'text-emerald-400'
                      : safeToSpendData.status === 'amber'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {safeToSpendData.dailyAmount < 0 ? '-' : ''}$
                  {Math.abs(safeToSpendData.dailyAmount).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="text-neutral-400 font-bold text-sm sm:text-base">/ day</span>
                <span className="text-neutral-500 text-xs sm:text-sm ml-2 hidden sm:inline">
                  (Guilt-free allowance for {safeToSpendData.daysLeft} days remaining this month)
                </span>
              </div>

              {/* Status banner */}
              <div
                className={`p-3 rounded-xl text-xs sm:text-sm font-medium mb-4 border ${
                  safeToSpendData.status === 'green'
                    ? isDark
                      ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-200'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : safeToSpendData.status === 'amber'
                    ? isDark
                      ? 'bg-amber-950/30 border-amber-800/40 text-amber-200'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                    : isDark
                    ? 'bg-rose-950/30 border-rose-800/40 text-rose-200'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                {safeToSpendData.statusDetail}
              </div>

              {/* Breakdown Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
                <button
                  type="button"
                  onClick={() => navigateToScreen('budget')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isDark
                      ? 'bg-neutral-900/60 hover:bg-neutral-800/60 border-neutral-800'
                      : 'bg-white hover:bg-neutral-50 border-neutral-200'
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-0.5">
                    Monthly Budget
                  </span>
                  <span className="text-sm font-bold font-mono">
                    ${safeToSpendData.monthlyBudget.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => navigateToScreen('budget')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isDark
                      ? 'bg-neutral-900/60 hover:bg-neutral-800/60 border-neutral-800'
                      : 'bg-white hover:bg-neutral-50 border-neutral-200'
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-0.5">
                    Spent So Far
                  </span>
                  <span className="text-sm font-bold font-mono text-rose-400">
                    -${safeToSpendData.spentSoFar.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => navigateToScreen('bills')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isDark
                      ? 'bg-neutral-900/60 hover:bg-neutral-800/60 border-neutral-800'
                      : 'bg-white hover:bg-neutral-50 border-neutral-200'
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-0.5">
                    Upcoming Bills
                  </span>
                  <span className="text-sm font-bold font-mono text-amber-400">
                    -${safeToSpendData.upcomingBills.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </button>

                <div
                  className={`p-3 rounded-xl border text-left ${
                    isDark ? 'bg-neutral-900/60 border-neutral-800' : 'bg-white border-neutral-200'
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-0.5">
                    Days Left
                  </span>
                  <span className="text-sm font-bold font-mono text-emerald-400">
                    {safeToSpendData.daysLeft} days
                  </span>
                </div>
              </div>

              {/* Equation bar */}
              <div
                className="pt-2.5 border-t flex flex-col sm:flex-row sm:items-center justify-between text-[11px] font-mono text-neutral-400 gap-1"
                style={{ borderColor: isDark ? '#262630' : '#e5e7eb' }}
              >
                <span>
                  Formula: (${safeToSpendData.monthlyBudget.toFixed(0)} Budget − ${safeToSpendData.spentSoFar.toFixed(0)} Spent − ${safeToSpendData.upcomingBills.toFixed(0)} Bills) ÷ {safeToSpendData.daysLeft} Days
                </span>
                <button
                  type="button"
                  onClick={() => navigateToScreen('budget')}
                  className="text-violet-400 hover:text-violet-300 font-sans font-bold self-start sm:self-auto"
                >
                  Audit Budget &rarr;
                </button>
              </div>
            </div>

            {/* Top Net Worth Hero Card with Interactive Chart */}
            <div
              className="p-6 sm:p-7 rounded-3xl border shadow-sm relative overflow-hidden transition-all duration-200"
              style={{
                backgroundColor: isDark ? '#111116' : '#ffffff',
                borderColor: isDark ? '#20202a' : '#e2e8f0',
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                    Total Net Worth
                  </span>
                  <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight tabular-nums">
                    ${netWorth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <div
                    className="px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5"
                    style={{ backgroundColor: isDark ? '#16161e' : '#f8fafc', borderColor: isDark ? '#242432' : '#e2e8f0' }}
                  >
                    <span className="text-neutral-400">Cash:</span>
                    <span className="text-emerald-400 font-bold">${liquidCash.toLocaleString()}</span>
                  </div>
                  <div
                    className="px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5"
                    style={{ backgroundColor: isDark ? '#16161e' : '#f8fafc', borderColor: isDark ? '#242432' : '#e2e8f0' }}
                  >
                    <span className="text-neutral-400">Debt:</span>
                    <span className="text-pink-400 font-bold">${totalCardDebt.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <NetWorthChart currentValue={netWorth} isDark={isDark} />
            </div>

            {/* Quick Actions Floating Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                onClick={() => setShowTxModal(true)}
                className="p-3.5 rounded-2xl border flex items-center justify-center gap-2.5 text-xs font-bold transition-all hover:border-violet-500 hover:shadow-sm cursor-pointer active:scale-95"
                style={{ backgroundColor: isDark ? '#111116' : '#ffffff', borderColor: isDark ? '#20202a' : '#e2e8f0' }}
              >
                <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-violet-400" />
                </div>
                <span>Log Expense</span>
              </button>

              <button
                onClick={() => {
                  setEditingCardId(null);
                  setCardFormName('');
                  setCardFormBalance('');
                  setCardFormLimit('');
                  setShowCardModal(true);
                }}
                className="p-3.5 rounded-2xl border flex items-center justify-center gap-2.5 text-xs font-bold transition-all hover:border-violet-500 hover:shadow-sm cursor-pointer active:scale-95"
                style={{ backgroundColor: isDark ? '#111116' : '#ffffff', borderColor: isDark ? '#20202a' : '#e2e8f0' }}
              >
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-blue-400" />
                </div>
                <span>Add Card</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-3.5 rounded-2xl border flex items-center justify-center gap-2.5 text-xs font-bold transition-all hover:border-emerald-500 hover:shadow-sm cursor-pointer active:scale-95"
                style={{ backgroundColor: isDark ? '#111116' : '#ffffff', borderColor: isDark ? '#20202a' : '#e2e8f0' }}
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Camera className="w-4 h-4 text-emerald-400" />
                </div>
                <span>Scan Receipt</span>
              </button>

              <button
                onClick={() => setActiveScreen('agent')}
                className="p-3.5 rounded-2xl bg-violet-600/10 border border-violet-500/30 text-violet-400 flex items-center justify-center gap-2.5 text-xs font-bold hover:bg-violet-600/20 transition-all cursor-pointer active:scale-95"
              >
                <div className="w-7 h-7 rounded-lg bg-violet-500/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                </div>
                <span>Ask FinAgent</span>
              </button>
            </div>

            {/* Credit Cards Wallet Carousel */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-violet-400" />
                  <h3 className="text-base font-bold">Your Credit Cards & Limits</h3>
                  <span className="text-xs text-neutral-400">({cards.length} connected)</span>
                </div>
                <button
                  onClick={() => setActiveScreen('cards')}
                  className="text-xs font-semibold text-violet-400 hover:underline flex items-center gap-1"
                >
                  <span>Manage Cards</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {cards.length === 0 ? (
                  <div
                    onClick={() => {
                      setEditingCardId(null);
                      setCardFormName('');
                      setCardFormBalance('');
                      setCardFormLimit('');
                      setShowCardModal(true);
                    }}
                    className="col-span-1 md:col-span-3 p-8 text-center rounded-2xl border border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer transition-all hover:border-violet-500"
                    style={{ borderColor: isDark ? '#262634' : '#cbd5e1' }}
                  >
                    <CreditCard className="w-8 h-8 text-violet-400 mb-1" />
                    <span className="font-bold text-sm">Add your first credit card</span>
                    <span className="text-xs text-neutral-400">Track limits, balances, and calculate optimal payoff strategies</span>
                  </div>
                ) : (
                  cards.map(c => {
                    const util = c.creditLimit > 0 ? (c.balance / c.creditLimit) * 100 : 0;
                    return (
                      <div
                        key={c.id}
                        onClick={() => navigateToScreen('cards')}
                      className={`p-5 rounded-2xl bg-gradient-to-br ${c.colorTheme} text-white shadow-md relative overflow-hidden flex flex-col justify-between min-h-[170px] cursor-pointer transition-transform hover:-translate-y-1`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-widest opacity-75 block">
                            {c.network}
                          </span>
                          <span className="font-bold text-sm">{c.cardName}</span>
                        </div>
                        <span className="text-xs font-mono font-bold opacity-80">•••• {c.last4}</span>
                      </div>

                      <div>
                        <div className="text-[11px] opacity-75">Outstanding Balance</div>
                        <div className="text-2xl font-black font-mono tracking-tight tabular-nums">
                          ${c.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px] opacity-75 mb-1 font-semibold">
                          <span>Limit: ${c.creditLimit.toLocaleString()}</span>
                          <span>{util.toFixed(1)}% Used</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-white/20 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${util > 30 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                            style={{ width: `${Math.min(100, util)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                }))}
              </div>
            </div>

            {/* 50/30/20 Monthly Budget Pacing */}
            <div
              className="p-6 rounded-2xl border transition-all"
              style={{
                backgroundColor: isDark ? '#111116' : '#ffffff',
                borderColor: isDark ? '#20202a' : '#e2e8f0',
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <span>50 / 30 / 20 Budget Framework</span>
                    <span className="text-xs text-neutral-400 font-normal">
                      {monthlyIncome > 0
                        ? `(Based on $${monthlyIncome.toLocaleString()} Monthly Income)`
                        : '(Needs 50% · Wants 30% · Savings 20%)'}
                    </span>
                  </h4>
                </div>
                {monthlyIncome > 0 ? (
                  <button
                    onClick={() => {
                      setActiveScreen('agent');
                      handleSendMessage('Audit my 50/30/20 budget allocations and tell me where to cut.');
                    }}
                    className="text-xs text-violet-400 font-semibold hover:underline self-start sm:self-auto flex items-center gap-1 active:scale-95"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Audit with AI →</span>
                  </button>
                ) : null}
              </div>

              {monthlyIncome === 0 ? (
                <div className="py-6 text-center flex flex-col items-center justify-center gap-2">
                  <p className="text-xs text-neutral-400 max-w-md">
                    Set your monthly take-home income in the Budget tab to activate live 50/30/20 spending targets and real-time pacing.
                  </p>
                  <button
                    onClick={() => setActiveScreen('budget')}
                    className="mt-1 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all cursor-pointer active:scale-95"
                  >
                    Configure Monthly Income
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1.5">
                      <span className="text-blue-400 font-bold">Needs (50% Target: ${budgetBreakdown.needsTarget.toFixed(0)})</span>
                      <span className="text-neutral-400 font-mono">
                        ${budgetBreakdown.needsSpent.toFixed(2)} spent ({budgetBreakdown.needsPct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-neutral-800/40 overflow-hidden border border-neutral-700/20">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${budgetBreakdown.needsPct}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1.5">
                      <span className="text-purple-400 font-bold">Wants (30% Target: ${budgetBreakdown.wantsTarget.toFixed(0)})</span>
                      <span className="text-neutral-400 font-mono">
                        ${budgetBreakdown.wantsSpent.toFixed(2)} spent ({budgetBreakdown.wantsPct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-neutral-800/40 overflow-hidden border border-neutral-700/20">
                      <div
                        className="h-full bg-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${budgetBreakdown.wantsPct}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1.5">
                      <span className="text-emerald-400 font-bold">Savings & Debt (20% Target: ${budgetBreakdown.savingsTarget.toFixed(0)})</span>
                      <span className="text-neutral-400 font-mono">
                        ${budgetBreakdown.savingsSpent.toFixed(2)} allocated ({budgetBreakdown.savingsPct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-neutral-800/40 overflow-hidden border border-neutral-700/20">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${budgetBreakdown.savingsPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Recent Activity Table */}
            <div
              className="p-5 rounded-2xl border"
              style={{
                backgroundColor: isDark ? '#111116' : '#ffffff',
                borderColor: isDark ? '#20202a' : '#e2e8f0',
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h4 className="text-sm font-bold">Recent Financial Activity</h4>
                <div className="flex items-center gap-2">
                  <div
                    className="flex items-center px-2.5 py-1.5 rounded-xl border text-xs"
                    style={{ backgroundColor: isDark ? '#16161e' : '#f8fafc', borderColor: isDark ? '#262634' : '#e2e8f0' }}
                  >
                    <Search className="w-3.5 h-3.5 text-neutral-400 mr-1.5" />
                    <input
                      type="text"
                      placeholder="Search activity..."
                      value={txSearch}
                      onChange={e => setTxSearch(e.target.value)}
                      className="bg-transparent outline-none text-xs w-28 sm:w-36"
                    />
                  </div>

                  <select
                    value={txCategoryFilter}
                    onChange={e => setTxCategoryFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl border text-xs outline-none"
                    style={{ backgroundColor: isDark ? '#16161e' : '#f8fafc', borderColor: isDark ? '#262634' : '#e2e8f0' }}
                  >
                    <option value="All">All Categories</option>
                    <option value="Groceries">Groceries</option>
                    <option value="Dining">Dining</option>
                    <option value="Housing">Housing</option>
                    <option value="Income">Income</option>
                  </select>
                </div>
              </div>

              <div className="divide-y text-xs sm:text-sm" style={{ borderColor: isDark ? '#1e1e28' : '#f1f5f9' }}>
                {filteredTransactions.length === 0 ? (
                  <div className="py-8 text-center text-neutral-400 text-xs">
                    No transactions found. Click &quot;Add Entry&quot; above to log an expense or income.
                  </div>
                ) : (
                  filteredTransactions.map(tx => (
                  <div key={tx.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
                          tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-neutral-800 text-neutral-300'
                        }`}
                      >
                        {tx.type === 'income' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="font-semibold">{tx.title}</div>
                        <div className="text-[11px] text-neutral-400">{tx.category} · {tx.source} · {tx.date}</div>
                      </div>
                    </div>
                    <div className={`font-mono font-bold ${tx.type === 'income' ? 'text-emerald-400' : 'text-neutral-100'}`}>
                      {tx.type === 'income' ? '+' : '-'}${tx.amount.toFixed(2)}
                    </div>
                  </div>
                ))
              )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: CARDS & DEBT OPTIMIZER */}
        {/* ========================================================================= */}
        {activeScreen === 'cards' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-violet-400" />
                  <span>Credit Cards & Debt Avalanche Hub</span>
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Manage credit limits, APR interest rates, and analyze your debt payoff order.
                </p>
              </div>

              <button
                onClick={() => {
                  setEditingCardId(null);
                  setCardFormName('');
                  setCardFormBalance('');
                  setCardFormLimit('');
                  setShowCardModal(true);
                }}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md self-start sm:self-auto cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Card</span>
              </button>
            </div>

            {/* Utilization Health Banner */}
            <div
              className="p-5 rounded-2xl border"
              style={{
                backgroundColor: isDark ? '#111116' : '#ffffff',
                borderColor: isDark ? '#20202a' : '#e2e8f0',
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                <div>
                  <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    Aggregate Credit Utilization
                  </span>
                  <div className="text-3xl font-black font-mono text-violet-400 mt-1">
                    {creditUtilization.toFixed(1)}%
                  </div>
                  <div className="text-xs text-neutral-400 mt-0.5">
                    ${totalCardDebt.toLocaleString()} total debt across ${totalCreditLimit.toLocaleString()} credit line
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setActiveScreen('agent');
                      handleSendMessage('Which credit card should I pay off first to save the most on interest?');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-violet-600/10 text-violet-400 border border-violet-500/20 text-xs font-bold hover:bg-violet-600/20 transition-all"
                  >
                    Ask AI Payoff Order →
                  </button>
                </div>
              </div>

              <div className="w-full h-3 rounded-full bg-neutral-800 overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    creditUtilization <= 10 ? 'bg-emerald-500' : creditUtilization <= 30 ? 'bg-blue-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.min(100, creditUtilization)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-neutral-400 font-medium">
                <span>0% (Ideal)</span>
                <span>10% (Optimal FICO)</span>
                <span>30% (Max Safe Zone)</span>
                <span>100%</span>
              </div>
            </div>

            {/* Debt Payoff Strategy Simulator (Avalanche vs Snowball) */}
            <div
              className="p-5 rounded-2xl border"
              style={{
                backgroundColor: isDark ? '#111116' : '#ffffff',
                borderColor: isDark ? '#20202a' : '#e2e8f0',
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h4 className="text-sm font-bold">Debt Payoff Strategy Sequence</h4>
                  <p className="text-xs text-neutral-400">
                    Recommended repayment order based on your live card portfolio.
                  </p>
                </div>

                <div
                  className="flex items-center p-1 rounded-xl border text-xs font-semibold self-start sm:self-auto"
                  style={{ backgroundColor: isDark ? '#16161e' : '#f1f5f9', borderColor: isDark ? '#262634' : '#e2e8f0' }}
                >
                  <button
                    onClick={() => setDebtStrategy('avalanche')}
                    className={`px-3 py-1 rounded-lg transition-all ${debtStrategy === 'avalanche' ? 'bg-violet-600 text-white font-bold' : 'text-neutral-400'}`}
                  >
                    Avalanche (Highest APR)
                  </button>
                  <button
                    onClick={() => setDebtStrategy('snowball')}
                    className={`px-3 py-1 rounded-lg transition-all ${debtStrategy === 'snowball' ? 'bg-violet-600 text-white font-bold' : 'text-neutral-400'}`}
                  >
                    Snowball (Lowest Balance)
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {sortedCards.length === 0 ? (
                  <div
                    onClick={() => {
                      setEditingCardId(null);
                      setCardFormName('');
                      setCardFormBalance('');
                      setCardFormLimit('');
                      setShowCardModal(true);
                    }}
                    className="p-8 text-center rounded-2xl border border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer transition-all hover:border-violet-500"
                    style={{ borderColor: isDark ? '#262634' : '#cbd5e1' }}
                  >
                    <CreditCard className="w-8 h-8 text-violet-400 mb-1" />
                    <span className="font-bold text-sm">No credit cards connected yet</span>
                    <span className="text-xs text-neutral-400">Click to add your credit cards and plan payoff order</span>
                  </div>
                ) : (
                  sortedCards.map((card, idx) => (
                    <div
                      key={card.id}
                      className="p-4 rounded-xl border flex items-center justify-between"
                      style={{ backgroundColor: isDark ? '#161620' : '#f8fafc', borderColor: isDark ? '#262634' : '#e2e8f0' }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-violet-600/20 text-violet-400 font-bold text-xs flex items-center justify-center">
                          #{idx + 1}
                        </div>
                        <div>
                          <div className="font-bold text-sm">{card.cardName}</div>
                          <div className="text-xs text-neutral-400">
                            APR: <span className="text-amber-400 font-semibold">{card.apr}%</span> · Limit: ${card.creditLimit.toLocaleString()} · Due: {card.dueDate}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm font-bold font-mono text-pink-400">${card.balance.toLocaleString()}</div>
                          <div className="text-[10px] text-neutral-400">Min: ${card.minPayment.toFixed(2)}</div>
                        </div>

                        <button
                          onClick={() => {
                            const payStr = prompt(`Enter amount to pay towards ${card.cardName}:`, card.minPayment.toString());
                            const payNum = parseFloat(payStr || '0');
                            if (payNum > 0) {
                              setCards(prev =>
                                prev.map(c => (c.id === card.id ? { ...c, balance: Math.max(0, c.balance - payNum) } : c))
                              );
                              setLiquidCash(prev => Math.max(0, prev - payNum));
                              showToast(`Paid $${payNum.toFixed(2)} to ${card.cardName}`);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg border text-xs font-semibold text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 transition-all"
                        >
                          Pay Down
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Individual Card Details Grid */}
            {cards.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {cards.map(c => (
                <div
                  key={c.id}
                  className="p-5 rounded-2xl border flex flex-col justify-between"
                  style={{ backgroundColor: isDark ? '#111116' : '#ffffff', borderColor: isDark ? '#20202a' : '#e2e8f0' }}
                >
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] uppercase font-bold text-violet-400">{c.network} · {c.last4}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setEditingCardId(c.id);
                            setCardFormName(c.cardName);
                            setCardFormNetwork(c.network);
                            setCardFormLast4(c.last4);
                            setCardFormBalance(c.balance.toString());
                            setCardFormLimit(c.creditLimit.toString());
                            setCardFormApr(c.apr.toString());
                            setCardFormDueDate(c.dueDate);
                            setShowCardModal(true);
                          }}
                          className="p-1 rounded text-neutral-400 hover:text-white"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Remove ${c.cardName}?`)) {
                              setCards(prev => prev.filter(item => item.id !== c.id));
                              showToast('Card deleted');
                            }
                          }}
                          className="p-1 rounded text-neutral-400 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <h4 className="font-bold text-sm mb-3">{c.cardName}</h4>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Balance:</span>
                        <span className="font-bold font-mono text-pink-400">${c.balance.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Limit:</span>
                        <span className="font-mono">${c.creditLimit.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-400">APR:</span>
                        <span className="font-bold text-amber-400">{c.apr}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Payment Due:</span>
                        <span>{c.dueDate}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setActiveScreen('agent');
                      handleSendMessage(`How can I optimize and lower interest on my ${c.cardName}?`);
                    }}
                    className="mt-4 py-2 rounded-xl text-xs font-semibold bg-violet-600/10 text-violet-400 hover:bg-violet-600/20 transition-all flex items-center justify-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Audit with FinAgent</span>
                  </button>
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 3: DEDICATED FINAGENT AI CHAT TAB */}
        {/* ========================================================================= */}
        {activeScreen === 'agent' && (
          <div className="h-[calc(100dvh-170px)] sm:h-[calc(100vh-170px)] min-h-[400px] flex flex-col">
            {/* Real Context Badge */}
            <div
              className="px-4 py-2.5 rounded-2xl border mb-3 flex items-center justify-between text-xs"
              style={{ backgroundColor: isDark ? '#111116' : '#f8fafc', borderColor: isDark ? '#20202a' : '#e2e8f0' }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-bold text-violet-400">FinAgent Live Context Grounded:</span>
                <span className="text-neutral-400 hidden sm:inline">
                  {cards.length} cards · ${totalCardDebt.toLocaleString()} debt · ${liquidCash.toLocaleString()} cash · ${monthlyIncome.toLocaleString()} income
                </span>
              </div>
              <button
                onClick={() => {
                  setMessages([
                    {
                      id: `init-${Date.now()}`,
                      text: `Memory reloaded. I am analyzing your ${cards.length} credit cards, $${totalCardDebt.toLocaleString()} outstanding balance, and $${liquidCash.toLocaleString()} cash reserve. How can I help?`,
                      sender: 'ai',
                      timestamp: 'Just now',
                    },
                  ]);
                  showToast('Conversation reset');
                }}
                className="text-neutral-400 hover:text-white text-[11px] font-semibold"
              >
                Reset Chat
              </button>
            </div>

            {/* Messages Feed */}
            <div
              className="flex-1 overflow-y-auto rounded-2xl border p-4 sm:p-5 space-y-4 my-2"
              style={{ backgroundColor: isDark ? '#0e0e12' : '#ffffff', borderColor: isDark ? '#1e1e28' : '#e2e8f0' }}
            >
              {messages.map(m => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-neutral-400">
                    <span className="font-bold">{m.sender === 'ai' ? 'FinAgent AI' : userName || 'You'}</span>
                    <span>· {m.timestamp}</span>
                  </div>

                  <div
                    className="max-w-[90%] sm:max-w-[80%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed border shadow-xs relative group"
                    style={
                      m.sender === 'user'
                        ? { backgroundColor: '#7c3aed', color: '#ffffff', borderColor: '#8b5cf6', borderBottomRightRadius: '4px' }
                        : { backgroundColor: isDark ? '#15151e' : '#f8fafc', color: isDark ? '#fafafa' : '#09090b', borderColor: isDark ? '#242432' : '#e2e8f0', borderBottomLeftRadius: '4px' }
                    }
                  >
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(m.text);
                        setCopiedId(m.id);
                        setTimeout(() => setCopiedId(null), 2000);
                      }}
                      className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 text-neutral-300"
                    >
                      {copiedId === m.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>

                    <div className="whitespace-pre-line">{m.text}</div>
                    {m.data && (
                      <ChatDataWidgetWeb
                        data={m.data}
                        isDark={isDark}
                        setActiveScreen={setActiveScreen}
                      />
                    )}
                  </div>
                </div>
              ))}

              {isLoadingChat && (
                <div className="flex items-center justify-between text-xs text-neutral-400 p-3 rounded-xl border bg-violet-500/5 border-violet-500/20">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-violet-400 animate-spin" />
                    <span>FinAgent is analyzing your cards and calculating optimal strategy...</span>
                  </div>
                  <button
                    type="button"
                    onClick={stopAgent}
                    className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <span className="w-2 h-2 bg-red-400 rounded-xs inline-block" />
                    <span>Stop</span>
                  </button>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick-Prompt Chips Above the Keyboard / Chat Input */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 shrink-0 scrollbar-none">
              {[
                { id: 'budget', label: '📊 Am I on budget?', prompt: 'Am I on budget?' },
                { id: 'receipt', label: '🧾 Scan a receipt', prompt: 'Scan a receipt', action: 'receipt' },
                { id: 'bills', label: '📅 Bills due soon', prompt: 'Which bills are due soon?' },
                { id: 'cut_spending', label: '💡 Where can I cut spending?', prompt: 'Where can I cut spending?' },
              ].map(chip => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => {
                    if (chip.action === 'receipt') {
                      fileInputRef.current?.click();
                    } else {
                      handleSendMessage(chip.prompt);
                    }
                  }}
                  disabled={isLoadingChat}
                  className="px-3.5 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap transition-all hover:border-violet-500 cursor-pointer shrink-0 disabled:opacity-50"
                  style={{
                    backgroundColor: isDark ? '#14141c' : '#ffffff',
                    borderColor: isDark ? '#23232e' : '#e2e8f0',
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Chat Input */}
            <div
              className="p-2 sm:p-3 rounded-2xl border flex items-center gap-2 shadow-sm shrink-0"
              style={{ backgroundColor: isDark ? '#111116' : '#ffffff', borderColor: isDark ? '#20202a' : '#e2e8f0' }}
            >
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-10 h-10 rounded-xl flex items-center justify-center border text-neutral-400 hover:text-emerald-400"
                style={{ backgroundColor: isDark ? '#16161e' : '#f1f5f9', borderColor: isDark ? '#242432' : '#e2e8f0' }}
                title="Scan receipt with camera"
              >
                <Camera className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={toggleVoiceRecording}
                className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${
                  isListening
                    ? 'bg-red-500/20 text-red-400 border-red-500 animate-pulse'
                    : 'text-neutral-400 hover:text-violet-400'
                }`}
                style={{
                  backgroundColor: isListening ? undefined : (isDark ? '#16161e' : '#f1f5f9'),
                  borderColor: isListening ? undefined : (isDark ? '#242432' : '#e2e8f0'),
                }}
                title={isListening ? 'Listening... click to stop' : 'Speak to log expense (Voice, e.g. "Spent $14 on lunch at Subway")'}
              >
                {isListening ? <MicOff className="w-4 h-4 text-red-400" /> : <Mic className="w-4 h-4" />}
              </button>

              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onFocus={() => {
                  setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSendMessage();
                }}
                placeholder="Type or speak (e.g. 'Spent $14 on lunch at Subway')..."
                disabled={isLoadingChat}
                className="flex-1 bg-transparent px-3 py-2 text-xs sm:text-sm outline-none"
              />

              {inputText.length > 0 && (
                <button
                  type="button"
                  onClick={() => setInputText('')}
                  className="text-xs text-neutral-400 hover:text-neutral-200 px-1"
                  title="Clear text"
                >
                  ✕
                </button>
              )}

              {isLoadingChat ? (
                <button
                  type="button"
                  onClick={stopAgent}
                  className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  title="Stop generating response"
                >
                  <span className="w-2 h-2 bg-white rounded-xs inline-block" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!inputText.trim()}
                  className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer"
                >
                  <span>Send</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 4: BUDGET & CASH FLOW */}
        {/* ========================================================================= */}
        {activeScreen === 'budget' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">50 / 30 / 20 Cash Flow & Category Ledger</h2>
                <p className="text-xs text-neutral-400 mt-0.5">Track live allocations against your monthly income.</p>
              </div>

              <button
                onClick={() => setShowTxModal(true)}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Entry</span>
              </button>
            </div>

            {/* Income Profile Card */}
            <div
              className="p-5 rounded-2xl border"
              style={{ backgroundColor: isDark ? '#111116' : '#ffffff', borderColor: isDark ? '#20202a' : '#e2e8f0' }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <span className="text-xs text-neutral-400 font-semibold block mb-1">Your Name</span>
                  <input
                    type="text"
                    value={userName}
                    placeholder="Enter your name"
                    onChange={e => setUserName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border text-sm font-semibold"
                    style={{ backgroundColor: isDark ? '#16161e' : '#f8fafc', borderColor: isDark ? '#262634' : '#cbd5e1' }}
                  />
                </div>

                <div>
                  <span className="text-xs text-neutral-400 font-semibold block mb-1">Monthly Income ($)</span>
                  <input
                    type="number"
                    value={monthlyIncome || ''}
                    placeholder="0.00"
                    onChange={e => setMonthlyIncome(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border text-sm font-bold font-mono"
                    style={{ backgroundColor: isDark ? '#16161e' : '#f8fafc', borderColor: isDark ? '#262634' : '#cbd5e1' }}
                  />
                </div>

                <div>
                  <span className="text-xs text-neutral-400 font-semibold block mb-1">Liquid Bank Cash ($)</span>
                  <input
                    type="number"
                    value={liquidCash || ''}
                    placeholder="0.00"
                    onChange={e => setLiquidCash(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border text-sm font-bold font-mono"
                    style={{ backgroundColor: isDark ? '#16161e' : '#f8fafc', borderColor: isDark ? '#262634' : '#cbd5e1' }}
                  />
                </div>

                <div>
                  <span className="text-xs text-neutral-400 font-semibold block mb-1">Estimated Net Worth</span>
                  <div
                    className="w-full px-3 py-2 rounded-xl border text-sm font-bold font-mono text-emerald-400 flex items-center"
                    style={{ backgroundColor: isDark ? '#16161e' : '#f8fafc', borderColor: isDark ? '#262634' : '#cbd5e1' }}
                  >
                    ${netWorth.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="sm:col-span-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t" style={{ borderColor: isDark ? '#262634' : '#e2e8f0' }}>
                  <span className="text-xs text-neutral-400">Want to start over with a clean slate?</span>
                  <button
                    type="button"
                    onClick={handleResetData}
                    className="px-3.5 py-2 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold flex items-center gap-1.5 transition-colors self-start sm:self-auto cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Reset All Data & Re-Onboard</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Spending Breakdown Pie Chart */}
            <div
              className="p-5 rounded-2xl border"
              style={{ backgroundColor: isDark ? '#111116' : '#ffffff', borderColor: isDark ? '#20202a' : '#e2e8f0' }}
            >
              <h3 className="text-sm font-bold mb-3">Category Distribution</h3>
              {categoryExpenses.length > 0 ? (
                <PieChart
                  data={categoryExpenses}
                  isDark={isDark}
                />
              ) : (
                <div className="py-8 text-center text-xs text-neutral-400">
                  Log your first expenses to view real-time category distribution.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 5: BILLS & RECURRING */}
        {/* ========================================================================= */}
        {activeScreen === 'bills' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Recurring Obligations & Card Bills</h2>
                <p className="text-xs text-neutral-400">Prevent late charges and track upcoming dues.</p>
              </div>

              <button
                onClick={() => {
                  const bill_name = prompt('Bill Name:');
                  if (!bill_name) return;
                  const amount = parseFloat(prompt('Amount ($):') || '0');
                  if (!amount) return;
                  const due_date = prompt('Due Date (e.g. 15th):') || 'End of month';
                  setBills(prev => [
                    ...prev,
                    { id: `b-${Date.now()}`, bill_name, amount, due_date, paid: false, category: 'Recurring' },
                  ]);
                  showToast(`Added ${bill_name}`);
                }}
                className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Bill</span>
              </button>
            </div>

            <div
              className="p-5 rounded-2xl border space-y-3"
              style={{ backgroundColor: isDark ? '#111116' : '#ffffff', borderColor: isDark ? '#20202a' : '#e2e8f0' }}
            >
              {bills.length === 0 ? (
                <div className="py-8 text-center text-neutral-400 text-xs">
                  No upcoming bills scheduled. Click &quot;Add Bill&quot; to keep track of recurring payments.
                </div>
              ) : (
                bills.map(b => (
                  <div
                    key={b.id}
                    className="p-3.5 rounded-xl border flex items-center justify-between"
                    style={{
                      backgroundColor: isDark ? '#16161e' : '#f8fafc',
                      borderColor: b.paid ? '#10b98133' : isDark ? '#262634' : '#e2e8f0',
                      opacity: b.paid ? 0.6 : 1,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setBills(prev => prev.map(item => (item.id === b.id ? { ...item, paid: !item.paid } : item)));
                          showToast('Status updated');
                        }}
                        className={`w-6 h-6 rounded-lg border flex items-center justify-center cursor-pointer ${
                          b.paid ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-neutral-500 hover:border-violet-500'
                        }`}
                      >
                        {b.paid && <Check className="w-3.5 h-3.5" />}
                      </button>
                      <div>
                        <div className={`text-sm font-bold ${b.paid ? 'line-through text-neutral-400' : ''}`}>{b.bill_name}</div>
                        <div className="text-xs text-neutral-400">Due {b.due_date} · {b.category}</div>
                      </div>
                    </div>
                    <span className="text-base font-black font-mono text-violet-400">${b.amount.toFixed(2)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 6: RECEIPT OCR SCANNER */}
        {/* ========================================================================= */}
        {activeScreen === 'ocr' && (
          <div className="max-w-2xl mx-auto space-y-6 text-center">
            <div>
              <h2 className="text-2xl font-bold">Multimodal Receipt Scanner</h2>
              <p className="text-xs text-neutral-400 mt-1">
                Snap or upload any receipt. FinAgent extracts merchant, total, and logs it to your card.
              </p>
            </div>

            {/* Dropzone Card */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="p-10 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer hover:border-violet-500 transition-all relative overflow-hidden"
              style={{ backgroundColor: isDark ? '#111116' : '#ffffff', borderColor: isDark ? '#272736' : '#cbd5e1' }}
            >
              {isScanning && (
                <div className="absolute inset-0 bg-violet-600/10 flex items-center justify-center">
                  <div className="w-full h-1 bg-violet-500 animate-pulse absolute top-1/2" />
                </div>
              )}

              <div className="w-14 h-14 rounded-2xl bg-violet-600/10 flex items-center justify-center text-violet-400 mb-3">
                <Camera className="w-7 h-7" />
              </div>

              <h4 className="text-base font-bold mb-1">
                {isScanning ? 'Scanning Receipt with AI Vision...' : 'Click to Upload or Take Receipt Photo'}
              </h4>
              <p className="text-xs text-neutral-400 max-w-sm">
                Supports image receipts (JPEG, PNG). Extracts merchant, date, total, and updates your balances.
              </p>

              <button
                type="button"
                className="mt-5 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold pointer-events-none"
              >
                Choose Photo
              </button>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                Upload Receipt
              </button>
              <button
                type="button"
                onClick={handleDemoReceipt}
                className="px-4 py-2 rounded-xl border border-neutral-700 hover:border-violet-500 text-xs font-semibold transition-all cursor-pointer"
              >
                Demo Receipt ($14 Subway)
              </button>
            </div>

            {/* Extracted Receipt Card (Confirmation) */}
            {scannedReceipt && (
              <div
                className="p-5 rounded-2xl border text-left space-y-4"
                style={{ backgroundColor: isDark ? '#14141c' : '#f8fafc', borderColor: '#8b5cf6' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-violet-400 uppercase tracking-wider">
                    Receipt Extracted
                  </span>
                  <span className="text-xs text-neutral-400">{scannedReceipt.date}</span>
                </div>

                <div className="flex justify-between items-baseline">
                  <div>
                    <h3 className="text-lg font-bold">{scannedReceipt.merchant}</h3>
                    <span className="text-xs text-neutral-400">{scannedReceipt.category}</span>
                  </div>
                  <div className="text-2xl font-black font-mono text-emerald-400">
                    ${scannedReceipt.total.toFixed(2)}
                  </div>
                </div>

                <div className="pt-2 border-t flex flex-col sm:flex-row items-center justify-between gap-3" style={{ borderColor: isDark ? '#262633' : '#e2e8f0' }}>
                  <div className="text-xs text-neutral-400">
                    Charge to which card?
                  </div>
                  <div className="flex items-center gap-2">
                    {cards.map(c => (
                      <button
                        key={c.id}
                        onClick={() => confirmScannedReceipt(c.cardName)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white transition-all shadow-sm"
                      >
                        Charge {c.cardName.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (Fixed for iOS / Android ergonomic reach) */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-lg px-2 py-2 flex items-center justify-around"
        style={{
          backgroundColor: isDark ? 'rgba(9, 9, 11, 0.96)' : 'rgba(255, 255, 255, 0.96)',
          borderColor: isDark ? '#1f1f28' : '#e2e8f0',
        }}
      >
        <button
          onClick={() => setActiveScreen('home')}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-[10px] font-bold ${
            activeScreen === 'home' ? 'text-violet-400' : 'text-neutral-400'
          }`}
        >
          <Home className="w-5 h-5" />
          <span>Home</span>
        </button>

        <button
          onClick={() => setActiveScreen('cards')}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-[10px] font-bold ${
            activeScreen === 'cards' ? 'text-violet-400' : 'text-neutral-400'
          }`}
        >
          <CreditCard className="w-5 h-5" />
          <span>Cards</span>
        </button>

        {/* Center Prominent AI Agent Button */}
        <button
          onClick={() => setActiveScreen('agent')}
          className="flex flex-col items-center gap-0.5 -mt-5"
        >
          <div className="w-12 h-12 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-lg shadow-violet-600/40">
            <Bot className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-bold text-violet-400">FinAgent</span>
        </button>

        <button
          onClick={() => setActiveScreen('budget')}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-[10px] font-bold ${
            activeScreen === 'budget' ? 'text-violet-400' : 'text-neutral-400'
          }`}
        >
          <Layers className="w-5 h-5" />
          <span>Budget</span>
        </button>

        <button
          onClick={() => setActiveScreen('ocr')}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-lg text-[10px] font-bold ${
            activeScreen === 'ocr' ? 'text-violet-400' : 'text-neutral-400'
          }`}
        >
          <Camera className="w-5 h-5" />
          <span>Receipts</span>
        </button>
      </div>
        </>
      )}
    </div>
  );
}