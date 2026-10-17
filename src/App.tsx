import React, { useState, useRef, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { NetWorthChart } from './components/NetWorthChart.web';
import { PieChart } from './components/PieChart.web';
import {
  Wallet,
  CreditCard,
  Bot,
  Layers,
  Camera,
  Calendar,
  Plus,
  Send,
  Sun,
  Moon,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Filter,
  Check,
  Copy,
  Trash2,
  Edit3,
  DollarSign,
  ChevronRight,
  ShieldCheck,
  Zap,
  Sliders,
  Bell,
  RefreshCw,
  Home,
  Receipt,
  PiggyBank,
  ArrowRight,
  Share2
} from 'lucide-react';

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

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'ai' | 'user';
  timestamp: string;
  imagePreview?: string;
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

  // User Profile
  const [userName, setUserName] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState<number>(0);
  const [liquidCash, setLiquidCash] = useState<number>(0);

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
        if (stored.fin_user_name) setUserName(stored.fin_user_name);
        if (stored.fin_monthly_income) setMonthlyIncome(Number(stored.fin_monthly_income) || 0);
        if (stored.fin_liquid_cash) setLiquidCash(Number(stored.fin_liquid_cash) || 0);
        setCards(parseStoredArray(stored.fin_cards, [], 'fin_cards'));
        setTransactions(parseStoredArray(stored.fin_transactions, [], 'fin_transactions'));
        setBills(parseStoredArray(stored.fin_bills, [], 'fin_bills'));
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
    if (!storageReady) return;
    void AsyncStorage.setItem('fin_cards', JSON.stringify(cards)).catch(error => {
      console.error('Failed to save fin_cards to AsyncStorage', error);
    });
  }, [storageReady, cards]);

  useEffect(() => {
    if (!storageReady) return;
    void AsyncStorage.setItem('fin_transactions', JSON.stringify(transactions)).catch(error => {
      console.error('Failed to save fin_transactions to AsyncStorage', error);
    });
  }, [storageReady, transactions]);

  useEffect(() => {
    if (!storageReady) return;
    void AsyncStorage.setItem('fin_bills', JSON.stringify(bills)).catch(error => {
      console.error('Failed to save fin_bills to AsyncStorage', error);
    });
  }, [storageReady, bills]);

  useEffect(() => {
    if (!storageReady) return;
    void AsyncStorage.setItem('fin_monthly_income', String(monthlyIncome)).catch(error => {
      console.error('Failed to save fin_monthly_income to AsyncStorage', error);
    });
    void AsyncStorage.setItem('fin_liquid_cash', String(liquidCash)).catch(error => {
      console.error('Failed to save fin_liquid_cash to AsyncStorage', error);
    });
    void AsyncStorage.setItem('fin_user_name', userName).catch(error => {
      console.error('Failed to save fin_user_name to AsyncStorage', error);
    });
  }, [storageReady, monthlyIncome, liquidCash, userName]);

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
  });

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
        const category = data.category || 'General';

        setScannedReceipt({
          merchant,
          total: totalNum,
          category,
          date: 'Today',
        });
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

  // Confirm Scanned Receipt
  const confirmScannedReceipt = (targetCardName: string) => {
    if (!scannedReceipt) return;
    const amount = scannedReceipt.total;

    // Add transaction
    const newTx: TransactionItem = {
      id: `tx-${Date.now()}`,
      title: scannedReceipt.merchant,
      category: scannedReceipt.category,
      date: 'Today',
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
              className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Entry</span>
            </button>

            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl border text-neutral-400 hover:text-white transition-colors"
              style={{ borderColor: isDark ? '#262633' : '#e2e8f0' }}
              title="Toggle Dark / Light Theme"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-violet-600" />}
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

            {/* Quick Prompt Chips */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 shrink-0">
              {[
                'Which card should I pay first?',
                'Audit my credit utilization ratio',
                'How much should I allocate to savings?',
                '50/30/20 budget breakdown for my income',
              ].map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSendMessage(q)}
                  disabled={isLoadingChat}
                  className="px-3 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all hover:border-violet-500 cursor-pointer shrink-0"
                  style={{ backgroundColor: isDark ? '#14141c' : '#ffffff', borderColor: isDark ? '#23232e' : '#e2e8f0' }}
                >
                  {q}
                </button>
              ))}
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
                placeholder="Ask about debt payoff, your cards, or saving goals..."
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
                    placeholder="e.g. Alex"
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
    </div>
  );
}