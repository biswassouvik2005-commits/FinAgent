import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ScrollView as ScrollViewRef,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api, { getApiErrorMessage } from '../lib/api';
import {
  allocateBudget,
  calculateFinancialSummary,
  cardPayoffOrder,
  type Bill as UpcomingBill,
  type CreditCard as CreditCardItem,
  type Transaction as TransactionItem,
} from '../lib/finance';
import {
  clearFinancialData,
  defaultFinancialData,
  loadFinancialData,
  saveFinancialData,
  type FinancialData,
} from '../lib/storage';
import { PieChart, type CategoryItem } from './PieChart';

type Screen = 'home' | 'cards' | 'agent' | 'budget' | 'bills' | 'receipts' | 'settings';
type TransactionType = 'income' | 'expense';
type ModalType = 'card' | 'transaction' | 'bill' | 'payment' | null;
type IconName = keyof typeof Ionicons.glyphMap;
type CardNetwork = CreditCardItem['network'];

interface ChatMessage {
  id: string;
  text: string;
  sender: 'ai' | 'user';
  timestamp: string;
}

interface ScannedReceipt {
  merchant: string;
  total: number;
  category: string;
  date: string;
}

interface Confirmation {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

const categories = ['Groceries', 'Dining', 'Housing', 'Utilities', 'Transportation', 'Entertainment', 'Health', 'Income', 'Other'];
const categoryColors = ['#60a5fa', '#c084fc', '#fb923c', '#34d399', '#fbbf24', '#f472b6', '#22d3ee', '#a3e635'];
const cardColors: Record<CardNetwork, string> = {
  visa: '#272b63',
  mastercard: '#292a32',
  amex: '#654b17',
  discover: '#155e55',
};
const formatCurrency = (value: number, decimals = 2) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

interface Palette {
  background: string;
  surface: string;
  elevated: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  green: string;
  red: string;
  input: string;
}

const paletteFor = (isDark: boolean): Palette => isDark
  ? {
      background: '#09090b',
      surface: '#111116',
      elevated: '#191922',
      border: '#272733',
      text: '#f4f4f5',
      muted: '#a1a1aa',
      accent: '#8b5cf6',
      green: '#34d399',
      red: '#fb7185',
      input: '#0d0d11',
    }
  : {
      background: '#f4f5f9',
      surface: '#ffffff',
      elevated: '#f1f1f8',
      border: '#e2e8f0',
      text: '#18181b',
      muted: '#71717a',
      accent: '#7c3aed',
      green: '#059669',
      red: '#e11d48',
      input: '#f8fafc',
    };

function AppButton({
  label,
  onPress,
  palette,
  icon,
  variant = 'primary',
  disabled = false,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  palette: Palette;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  disabled?: boolean;
  compact?: boolean;
}) {
  const backgroundColor = variant === 'primary'
    ? palette.accent
    : variant === 'danger'
      ? '#be123c'
      : variant === 'secondary'
        ? palette.elevated
        : 'transparent';
  const color = variant === 'quiet' ? palette.accent : '#ffffff';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor, borderColor: palette.border, opacity: disabled ? 0.45 : pressed ? 0.78 : 1 },
        variant === 'secondary' && styles.buttonBorder,
      ]}
    >
      {icon ? <Ionicons name={icon} size={compact ? 15 : 17} color={color} /> : null}
      <Text style={[styles.buttonText, compact && styles.buttonTextCompact, { color }]}>{label}</Text>
    </Pressable>
  );
}

function Panel({
  children,
  palette,
  style,
}: {
  children: React.ReactNode;
  palette: Palette;
  style?: object;
}) {
  return <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }, style]}>{children}</View>;
}

function SectionTitle({
  title,
  subtitle,
  palette,
}: {
  title: string;
  subtitle?: string;
  palette: Palette;
}) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={[styles.sectionTitle, { color: palette.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.caption, { color: palette.muted }]}>{subtitle}</Text> : null}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  palette,
  placeholder,
  keyboardType = 'default',
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  palette: Palette;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: palette.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        keyboardType={keyboardType}
        maxLength={maxLength}
        style={[styles.field, { backgroundColor: palette.input, borderColor: palette.border, color: palette.text }]}
      />
    </View>
  );
}

function ChoiceChips<T extends string>({
  values,
  selected,
  onSelect,
  palette,
}: {
  values: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  palette: Palette;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
      {values.map(value => {
        const active = selected === value;
        return (
          <Pressable
            key={value}
            onPress={() => onSelect(value)}
            style={[styles.chip, { backgroundColor: active ? palette.accent : palette.elevated, borderColor: active ? palette.accent : palette.border }]}
          >
            <Text style={[styles.chipText, { color: active ? '#fff' : palette.muted }]}>{value}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function TransactionRow({
  item,
  palette,
  onEdit,
  onRemove,
}: {
  item: TransactionItem;
  palette: Palette;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const income = item.type === 'income';
  return (
    <View style={[styles.transactionRow, { borderBottomColor: palette.border }]}>
      <View style={[styles.transactionIcon, { backgroundColor: income ? '#064e3b' : palette.elevated }]}>
        <Ionicons name={income ? 'arrow-down-outline' : 'arrow-up-outline'} size={18} color={income ? palette.green : palette.muted} />
      </View>
      <View style={styles.transactionInfo}>
        <Text numberOfLines={1} style={[styles.bodyStrong, { color: palette.text }]}>{item.title}</Text>
        <Text numberOfLines={1} style={[styles.caption, { color: palette.muted }]}>{item.category} · {item.source} · {item.date}</Text>
      </View>
      <Text style={[styles.transactionAmount, { color: income ? palette.green : palette.text }]}>
        {income ? '+' : '-'}{formatCurrency(item.amount)}
      </Text>
      {onEdit ? <Pressable accessibilityLabel={`Edit ${item.title}`} onPress={onEdit} hitSlop={8}><Ionicons name="create-outline" size={18} color={palette.accent} /></Pressable> : null}
      {onRemove ? <Pressable accessibilityLabel={`Delete ${item.title}`} onPress={onRemove} hitSlop={8}><Ionicons name="trash-outline" size={18} color={palette.red} /></Pressable> : null}
    </View>
  );
}

function FinAgentApp() {
  const [storageStatus, setStorageStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [storageError, setStorageError] = useState('');
  const [storageWarnings, setStorageWarnings] = useState<string[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [screen, setScreen] = useState<Screen>('home');
  const [displayName, setDisplayName] = useState(defaultFinancialData.profile.displayName);
  const [monthlyIncome, setMonthlyIncome] = useState(defaultFinancialData.profile.monthlyIncome);
  const [monthlyExpenses, setMonthlyExpenses] = useState(defaultFinancialData.profile.monthlyExpenses);
  const [liquidCash, setLiquidCash] = useState(defaultFinancialData.profile.liquidCash);
  const [cards, setCards] = useState<CreditCardItem[]>(defaultFinancialData.cards);
  const [transactions, setTransactions] = useState<TransactionItem[]>(defaultFinancialData.transactions);
  const [bills, setBills] = useState<UpcomingBill[]>(defaultFinancialData.bills);
  const [modal, setModal] = useState<ModalType>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [cardName, setCardName] = useState('');
  const [cardNetwork, setCardNetwork] = useState<CardNetwork>('visa');
  const [cardLast4, setCardLast4] = useState('');
  const [cardBalance, setCardBalance] = useState('');
  const [cardLimit, setCardLimit] = useState('');
  const [cardApr, setCardApr] = useState('');
  const [cardDueDate, setCardDueDate] = useState('');
  const [txTitle, setTxTitle] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txCategory, setTxCategory] = useState('Groceries');
  const [txSource, setTxSource] = useState('Primary Checking');
  const [txType, setTxType] = useState<TransactionType>('expense');
  const [billName, setBillName] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billDueDate, setBillDueDate] = useState('');
  const [profileNameDraft, setProfileNameDraft] = useState('');
  const [incomeDraft, setIncomeDraft] = useState('');
  const [expensesDraft, setExpensesDraft] = useState('');
  const [cashDraft, setCashDraft] = useState('');
  const [saveRevision, setSaveRevision] = useState(0);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [debtStrategy, setDebtStrategy] = useState<'Avalanche' | 'Snowball'>(defaultFinancialData.debtStrategy);
  const [txSearch, setTxSearch] = useState('');
  const [txFilter, setTxFilter] = useState('All');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm-init',
      sender: 'ai',
      timestamp: 'Just now',
      text: 'Hello! I am your FinAgent AI Financial Advisor. Ask me about your accounts, spending, or debt payoff strategy.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedReceipt, setScannedReceipt] = useState<ScannedReceipt | null>(null);
  const [toast, setToast] = useState('');
  const [toastIsError, setToastIsError] = useState(false);
  const [apiError, setApiError] = useState('');
  const chatScroll = useRef<ScrollViewRef>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDark = theme === 'dark';
  const palette = useMemo(() => paletteFor(isDark), [isDark]);

  const financialContext = useMemo(() => ({
    cards,
    transactions,
    bills,
    monthlyIncome,
    monthlyExpenses,
    totalBalance: liquidCash,
  }), [cards, transactions, bills, monthlyIncome, monthlyExpenses, liquidCash]);
  const summary = useMemo(() => calculateFinancialSummary(financialContext), [financialContext]);
  const totalCardDebt = summary.cardDebt;
  const totalCreditLimit = summary.creditLimit;
  const utilization = summary.utilizationPercent;
  const netWorth = summary.netWorth;
  const budgetTargets = allocateBudget(monthlyIncome);
  const sortedCards = cardPayoffOrder(cards, debtStrategy.toLowerCase() as 'avalanche' | 'snowball');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const loaded = await loadFinancialData();
        if (!mounted) return;
        setStorageWarnings(loaded.warnings);
        setTheme(loaded.data.theme);
        setDebtStrategy(loaded.data.debtStrategy);
        setDisplayName(loaded.data.profile.displayName);
        setMonthlyIncome(loaded.data.profile.monthlyIncome);
        setMonthlyExpenses(loaded.data.profile.monthlyExpenses);
        setLiquidCash(loaded.data.profile.liquidCash);
        setProfileNameDraft(loaded.data.profile.displayName);
        setIncomeDraft(String(loaded.data.profile.monthlyIncome));
        setExpensesDraft(String(loaded.data.profile.monthlyExpenses));
        setCashDraft(String(loaded.data.profile.liquidCash));
        setCards(loaded.data.cards);
        setTransactions(loaded.data.transactions);
        setBills(loaded.data.bills);
        setStorageStatus('ready');
      } catch (error) {
        console.error('Failed to load app data from AsyncStorage', error);
        if (mounted) {
          setStorageError(error instanceof Error ? error.message : 'Saved information could not be loaded.');
          setStorageStatus('failed');
        }
      }
    };
    void load();
    return () => {
      mounted = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (storageStatus !== 'ready') return;
    const data: FinancialData = {
      version: 2,
      theme,
      debtStrategy,
      profile: { displayName, monthlyIncome, monthlyExpenses, liquidCash },
      cards,
      transactions,
      bills,
    };
    void saveFinancialData(data).then(() => {
      setStorageError('');
    }).catch(error => {
      console.error('Failed to save app data to AsyncStorage', error);
      setStorageError('Your changes could not be saved. Check device storage and retry.');
    });
  }, [storageStatus, theme, debtStrategy, displayName, monthlyIncome, monthlyExpenses, liquidCash, cards, transactions, bills, saveRevision]);

  useEffect(() => {
    if (screen === 'agent') {
      requestAnimationFrame(() => chatScroll.current?.scrollToEnd({ animated: true }));
    }
  }, [messages, isLoadingChat, screen]);

  const showToast = (message: string, isError = false) => {
    setToast(message);
    setToastIsError(isError);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2800);
  };

  const applyLoadedData = (data: FinancialData) => {
    setTheme(data.theme);
    setDebtStrategy(data.debtStrategy);
    setDisplayName(data.profile.displayName);
    setMonthlyIncome(data.profile.monthlyIncome);
    setMonthlyExpenses(data.profile.monthlyExpenses);
    setLiquidCash(data.profile.liquidCash);
    setCards(data.cards);
    setTransactions(data.transactions);
    setBills(data.bills);
    setProfileNameDraft(data.profile.displayName);
    setIncomeDraft(String(data.profile.monthlyIncome));
    setExpensesDraft(String(data.profile.monthlyExpenses));
    setCashDraft(String(data.profile.liquidCash));
  };

  const retryStorageLoad = async () => {
    setStorageStatus('loading');
    try {
      const loaded = await loadFinancialData();
      setStorageWarnings(loaded.warnings);
      applyLoadedData(loaded.data);
      setStorageError('');
      setStorageStatus('ready');
    } catch (error) {
      console.error('Failed to reload app data from AsyncStorage', error);
      setStorageError(error instanceof Error ? error.message : 'Saved information could not be loaded.');
      setStorageStatus('failed');
    }
  };

  const resetStoredData = () => {
    setConfirmation({
      title: 'Delete all saved information?',
      message: 'This permanently removes your profile, cards, transactions, bills, and preferences from this device.',
      confirmLabel: 'Delete all',
      onConfirm: () => {
        void (async () => {
          try {
            await clearFinancialData();
            applyLoadedData(defaultFinancialData);
            setStorageWarnings([]);
            setStorageError('');
            setStorageStatus('ready');
            showToast('Saved information cleared');
          } catch (error) {
            console.error('Failed to clear saved app data', error);
            setStorageError('Saved information could not be cleared. Try again.');
          }
        })();
      },
    });
  };

  const saveProfile = () => {
    const parsedIncome = Number(incomeDraft);
    const parsedExpenses = Number(expensesDraft);
    const parsedCash = Number(cashDraft);
    if (
      ![parsedIncome, parsedExpenses, parsedCash].every(Number.isFinite)
      || parsedIncome < 0
      || parsedExpenses < 0
      || parsedCash < -1_000_000_000
      || parsedIncome > 1_000_000_000
      || parsedExpenses > 1_000_000_000
      || parsedCash > 1_000_000_000
    ) {
      showToast('Income and monthly expenses must be between zero and 1,000,000,000. Cash must be between -1,000,000,000 and 1,000,000,000.', true);
      return;
    }
    setDisplayName(profileNameDraft.trim());
    setMonthlyIncome(parsedIncome);
    setMonthlyExpenses(parsedExpenses);
    setLiquidCash(parsedCash);
    showToast('Profile updated');
  };

  const openNewCard = () => {
    setEditingCardId(null);
    setCardName('');
    setCardNetwork('visa');
    setCardLast4('');
    setCardBalance('');
    setCardLimit('');
    setCardApr('');
    setCardDueDate('');
    setModal('card');
  };

  const openEditCard = (card: CreditCardItem) => {
    setEditingCardId(card.id);
    setCardName(card.cardName);
    setCardNetwork(card.network);
    setCardLast4(card.last4);
    setCardBalance(String(card.balance));
    setCardLimit(String(card.creditLimit));
    setCardApr(String(card.apr));
    setCardDueDate(card.dueDate);
    setModal('card');
  };

  const updateTransactionImpact = (transaction: TransactionItem, direction: 1 | -1) => {
    if (transaction.type === 'income') {
      setLiquidCash(previous => previous + direction * transaction.amount);
      return;
    }
    const card = cards.find(item => item.cardName === transaction.source);
    if (card) {
      setCards(previous => previous.map(item => item.id === card.id
        ? { ...item, balance: Math.max(0, item.balance + direction * transaction.amount) }
        : item));
    } else if (transaction.source === 'Primary Checking') {
      setLiquidCash(previous => previous - direction * transaction.amount);
    }
  };

  const openNewTransaction = () => {
    setEditingTransactionId(null);
    setTxTitle('');
    setTxAmount('');
    setTxType('expense');
    setTxCategory('Groceries');
    setTxSource('Primary Checking');
    setModal('transaction');
  };

  const openEditTransaction = (transaction: TransactionItem) => {
    setEditingTransactionId(transaction.id);
    setTxTitle(transaction.title);
    setTxAmount(String(transaction.amount));
    setTxType(transaction.type);
    setTxCategory(transaction.category);
    setTxSource(transaction.source);
    setModal('transaction');
  };

  const removeTransaction = (transaction: TransactionItem) => {
    setConfirmation({
      title: 'Delete transaction?',
      message: `Delete ${transaction.title} and adjust its account balance?`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        updateTransactionImpact(transaction, -1);
        setTransactions(previous => previous.filter(item => item.id !== transaction.id));
        showToast('Transaction deleted');
      },
    });
  };

  const saveCard = () => {
    if (!cardName.trim()) {
      showToast('Enter a name for this card before saving.', true);
      return;
    }
    const balance = Number(cardBalance);
    const limit = Number(cardLimit);
    const apr = Number(cardApr);
    const last4 = cardLast4.trim() || (editingCardId ? cards.find(card => card.id === editingCardId)?.last4 : '');
    if (
      !cardBalance.trim()
      || !cardLimit.trim()
      || !cardApr.trim()
      || !last4
      || !/^\d{4}$/.test(last4)
      || ![balance, limit, apr].every(Number.isFinite)
      || balance < 0
      || balance > 1_000_000_000
      || limit <= 0
      || limit > 1_000_000_000
      || apr < 0
      || apr > 100
    ) {
      showToast('Enter the last four digits, a balance up to 1,000,000,000, a credit limit between 0 and 1,000,000,000, and an APR from 0 to 100.', true);
      return;
    }
    if (cards.some(card => card.id !== editingCardId && card.cardName.toLowerCase() === cardName.trim().toLowerCase())) {
      showToast('Choose a unique card name so transactions can be assigned to the right card.', true);
      return;
    }
    if (editingCardId) {
      setCards(previous => previous.map(card => card.id === editingCardId
        ? { ...card, cardName: cardName.trim(), network: cardNetwork, last4, balance, creditLimit: limit, apr, dueDate: cardDueDate.trim(), minPayment: balance === 0 ? 0 : Math.min(balance, Math.max(25, balance * 0.025)) }
        : card));
      showToast('Card updated');
    } else {
      setCards(previous => [...previous, {
        id: `c-${Date.now()}`,
        cardName: cardName.trim(),
        network: cardNetwork,
        last4,
        balance,
        creditLimit: limit,
        apr,
        dueDate: cardDueDate.trim(),
        minPayment: balance === 0 ? 0 : Math.min(balance, Math.max(25, balance * 0.025)),
      }]);
      showToast(`Added ${cardName.trim()}`);
    }
    setModal(null);
  };

  const saveTransaction = () => {
    const title = txTitle.trim();
    const amount = Number.parseFloat(txAmount);
    if (!title || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
      showToast('Enter a payee and an amount greater than zero and no greater than 1,000,000,000.', true);
      return;
    }
    const transaction: TransactionItem = {
      id: editingTransactionId ?? `tx-${Date.now()}`,
      title,
      category: txCategory,
      date: editingTransactionId
        ? transactions.find(item => item.id === editingTransactionId)?.date ?? 'Today'
        : 'Today',
      amount,
      type: txType,
      source: txSource,
    };
    if (editingTransactionId) {
      const previousTransaction = transactions.find(item => item.id === editingTransactionId);
      if (!previousTransaction) {
        showToast('This transaction could not be found. Close the form and try again.', true);
        return;
      }
      updateTransactionImpact(previousTransaction, -1);
      updateTransactionImpact(transaction, 1);
      setTransactions(previous => previous.map(item => item.id === editingTransactionId ? transaction : item));
    } else {
      setTransactions(previous => [transaction, ...previous]);
      updateTransactionImpact(transaction, 1);
    }
    setTxTitle('');
    setTxAmount('');
    setModal(null);
    showToast(editingTransactionId ? 'Transaction updated' : `Logged ${txType}: ${formatCurrency(amount)}`);
  };

  const openEditBill = (bill: UpcomingBill) => {
    setEditingBillId(bill.id);
    setBillName(bill.bill_name);
    setBillAmount(String(bill.amount));
    setBillDueDate(bill.due_date);
    setModal('bill');
  };

  const openNewBill = () => {
    setEditingBillId(null);
    setBillName('');
    setBillAmount('');
    setBillDueDate('');
    setModal('bill');
  };

  const saveBill = () => {
    const amount = Number.parseFloat(billAmount);
    if (!billName.trim() || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
      showToast('Enter a bill name and an amount greater than zero and no greater than 1,000,000,000.', true);
      return;
    }
    const bill: UpcomingBill = {
      id: editingBillId ?? `b-${Date.now()}`,
      bill_name: billName.trim(),
      amount,
      due_date: billDueDate.trim() || 'Date not set',
      paid: editingBillId ? bills.find(item => item.id === editingBillId)?.paid ?? false : false,
      category: 'Recurring',
    };
    setBills(previous => editingBillId
      ? previous.map(item => item.id === editingBillId ? bill : item)
      : [...previous, bill]);
    setBillName('');
    setBillAmount('');
    setBillDueDate('');
    setModal(null);
    setEditingBillId(null);
    showToast(editingBillId ? 'Bill updated' : 'Bill added');
  };

  const removeBill = (bill: UpcomingBill) => {
    setConfirmation({
      title: 'Delete bill?',
      message: `Remove ${bill.bill_name} from your bill list?`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        setBills(previous => previous.filter(item => item.id !== bill.id));
        showToast('Bill deleted');
      },
    });
  };

  const savePayment = () => {
    const amount = Number.parseFloat(paymentAmount);
    const card = cards.find(item => item.id === activeCardId);
    if (!card || !Number.isFinite(amount) || amount <= 0 || amount > card.balance || amount > liquidCash) {
      showToast('Enter an amount greater than zero and no greater than the card balance or available cash.', true);
      return;
    }
    setCards(previous => previous.map(item => item.id === card.id
      ? { ...item, balance: Math.max(0, item.balance - amount) }
      : item));
    setLiquidCash(previous => previous - amount);
    setModal(null);
    setPaymentAmount('');
    showToast(`Payment applied to ${card.cardName}`);
  };

  const removeCard = (card: CreditCardItem) => {
    setConfirmation({
      title: 'Remove card?',
      message: `Remove ${card.cardName} from your wallet?`,
      confirmLabel: 'Remove',
      onConfirm: () => {
        setCards(previous => previous.filter(item => item.id !== card.id));
        showToast('Card removed');
      },
    });
  };

  const sendMessage = async (prompt?: string) => {
    const text = (prompt ?? chatInput).trim();
    if (!text || isLoadingChat) return;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages(previous => [...previous, { id: `u-${Date.now()}`, text, sender: 'user', timestamp }]);
    setChatInput('');
    setIsLoadingChat(true);
    setApiError('');

    try {
      if (Platform.OS !== 'web' && !api.defaults.baseURL) {
        throw new Error('Set EXPO_PUBLIC_API_URL to your API server address to use AI and receipt scanning.');
      }
      const response = await api.post('/api/chat', {
        message: text,
        userContext: { cards, totalBalance: liquidCash, monthlyIncome, monthlyExpenses, bills, transactions },
      });
      const reply = response.data?.ai_reply;
      if (typeof reply !== 'string' || !reply.trim()) throw new Error('The AI service returned an empty response.');
      setMessages(previous => [...previous, {
        id: `ai-${Date.now()}`,
        text: reply,
        sender: 'ai',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    } catch (error) {
      const message = getApiErrorMessage(error, 'chat');
      console.warn('AI chat request failed:', message);
      setApiError(message);
      setMessages(previous => [...previous, {
        id: `ai-${Date.now()}`,
        text: `I could not reach the AI service. ${message}`,
        sender: 'ai',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    } finally {
      setIsLoadingChat(false);
    }
  };

  const resetChat = () => {
    setMessages([{
      id: `init-${Date.now()}`,
      text: `Conversation reset. I am ready to review your ${cards.length} cards, ${formatCurrency(totalCardDebt)} in balances, and ${formatCurrency(liquidCash)} cash reserve.`,
      sender: 'ai',
      timestamp: 'Just now',
    }]);
    setApiError('');
  };

  const processReceipt = async (fromCamera: boolean) => {
    try {
      setIsScanning(true);
      setScreen('receipts');
      if (fromCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          showToast('Allow camera access to scan a receipt, or choose a photo from your library.', true);
          return;
        }
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.base64) throw new Error('The selected image could not be read. Please select another image.');
      if (Platform.OS !== 'web' && !api.defaults.baseURL) {
        throw new Error('Set EXPO_PUBLIC_API_URL to your API server address to use AI and receipt scanning.');
      }

      const response = await api.post('/api/receipt', {
        base64Image: asset.base64,
        mimeType: asset.mimeType || 'image/jpeg',
      });
      const data = response.data;
      const total = Number(data?.total);
      if (!Number.isFinite(total) || total <= 0 || typeof data?.merchant !== 'string') {
        throw new Error('The receipt could not be read. Try a clearer photo.');
      }
      setScannedReceipt({
        merchant: data.merchant,
        total,
        category: typeof data.category === 'string' ? data.category : 'Other',
        date: typeof data.date === 'string' ? data.date : 'Today',
      });
      showToast(`Receipt scanned: ${data.merchant}`);
    } catch (error) {
      const message = getApiErrorMessage(error, 'receipt');
      console.warn('Receipt scan failed:', message);
      showToast(message, true);
    } finally {
      setIsScanning(false);
    }
  };

  const chooseReceiptSource = () => {
    if (Platform.OS === 'web') {
      void processReceipt(false);
      return;
    }
    Alert.alert('Scan a receipt', 'Choose where to get the receipt image.', [
      { text: 'Take photo', onPress: () => void processReceipt(true) },
      { text: 'Photo library', onPress: () => void processReceipt(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmReceipt = (cardName: string) => {
    if (!scannedReceipt) return;
    const amount = scannedReceipt.total;
    const transaction: TransactionItem = {
      id: `tx-${Date.now()}`,
      title: scannedReceipt.merchant,
      category: scannedReceipt.category,
      date: scannedReceipt.date,
      amount,
      type: 'expense',
      source: cardName,
    };
    setTransactions(previous => [transaction, ...previous]);
    updateTransactionImpact(transaction, 1);
    setScannedReceipt(null);
    setScreen('home');
    showToast(`Receipt added to ${cardName}`);
  };

  const openTransactionModal = () => {
    openNewTransaction();
  };

  const expenseByCategory: CategoryItem[] = summary.categorySpending;

  const filteredTransactions = transactions.filter(item => {
    const query = txSearch.trim().toLowerCase();
    const matchesSearch = !query || item.title.toLowerCase().includes(query) || item.category.toLowerCase().includes(query);
    const matchesCategory = txFilter === 'All' || item.category === txFilter;
    return matchesSearch && matchesCategory;
  });

  const renderTransactionList = (list: TransactionItem[], canEdit = false) => (
    <View>
      {list.length ? list.map(item => (
        <TransactionRow
          key={item.id}
          item={item}
          palette={palette}
          onEdit={canEdit ? () => openEditTransaction(item) : undefined}
          onRemove={canEdit ? () => removeTransaction(item) : undefined}
        />
      ))
        : <Text style={[styles.emptyText, { color: palette.muted }]}>No transactions match these filters.</Text>}
    </View>
  );

  const renderCard = (card: CreditCardItem, actions = false) => {
    const percentage = card.creditLimit > 0 ? Math.min(100, (card.balance / card.creditLimit) * 100) : 0;
    return (
      <Panel key={card.id} palette={palette} style={[styles.cardPanel, { backgroundColor: cardColors[card.network] }]}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.eyebrowWhite}>{card.network.toUpperCase()}</Text>
            <Text numberOfLines={1} style={styles.cardName}>{card.cardName}</Text>
          </View>
          <Text style={styles.cardNumber}>**** {card.last4}</Text>
        </View>
        <View style={styles.cardBalanceBlock}>
          <Text style={styles.eyebrowWhite}>Outstanding balance</Text>
          <Text style={styles.cardBalance}>{formatCurrency(card.balance)}</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.eyebrowWhite}>Limit {formatCurrency(card.creditLimit, 0)}</Text>
          <Text style={styles.eyebrowWhite}>{percentage.toFixed(1)}% used</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${percentage}%`, backgroundColor: percentage > 30 ? '#fbbf24' : '#34d399' }]} />
        </View>
        {actions ? (
          <View style={styles.cardActions}>
            <AppButton label="Pay down" icon="arrow-down-outline" onPress={() => {
              setActiveCardId(card.id);
              setPaymentAmount(card.minPayment.toString());
              setModal('payment');
            }} palette={palette} compact />
            <AppButton label="Edit" icon="create-outline" onPress={() => openEditCard(card)} palette={palette} compact variant="secondary" />
            <AppButton label="Remove" icon="trash-outline" onPress={() => removeCard(card)} palette={palette} compact variant="quiet" />
          </View>
        ) : null}
        {actions ? (
          <View style={styles.cardMetaRow}>
            <Text style={styles.eyebrowWhite}>APR {card.apr}%</Text>
            <Text style={styles.eyebrowWhite}>Due {card.dueDate}</Text>
            <Text style={styles.eyebrowWhite}>Min {formatCurrency(card.minPayment)}</Text>
          </View>
        ) : null}
      </Panel>
    );
  };

  const renderHome = () => (
    <>
      <View style={styles.welcomeBlock}>
        <Text style={[styles.eyebrow, { color: palette.muted }]}>PERSONAL FINANCE OVERVIEW</Text>
        <Text style={[styles.pageTitle, { color: palette.text }]}>Welcome back{displayName ? `, ${displayName}` : ''}</Text>
      </View>
      <Panel palette={palette}>
        <View style={styles.rowBetween}>
          <Text style={[styles.eyebrow, { color: palette.muted }]}>TOTAL NET WORTH</Text>
          <Ionicons name="trending-up" size={20} color={palette.green} />
        </View>
        <Text style={[styles.netWorth, { color: palette.text }]}>{formatCurrency(netWorth)}</Text>
        <View style={styles.metricRow}>
          <View style={styles.metric}>
            <Text style={[styles.caption, { color: palette.muted }]}>Liquid cash</Text>
            <Text style={[styles.metricValue, { color: palette.green }]}>{formatCurrency(liquidCash, 0)}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={[styles.caption, { color: palette.muted }]}>Card debt</Text>
            <Text style={[styles.metricValue, { color: palette.red }]}>{formatCurrency(totalCardDebt, 0)}</Text>
          </View>
        </View>
      </Panel>

      <View style={styles.quickActions}>
        <AppButton label="Add transaction" icon="add" onPress={openTransactionModal} palette={palette} />
        <AppButton label="Add card" icon="card-outline" onPress={openNewCard} palette={palette} variant="secondary" />
        <AppButton label="Scan receipt" icon="camera-outline" onPress={chooseReceiptSource} palette={palette} variant="secondary" />
      </View>

      <View style={styles.section}>
        <View style={styles.rowBetween}>
          <SectionTitle title="Your cards" subtitle={`${cards.length} connected`} palette={palette} />
          <Pressable onPress={() => setScreen('cards')}><Text style={[styles.link, { color: palette.accent }]}>Manage</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardCarousel}>
          {cards.map(card => renderCard(card))}
          {!cards.length ? <Text style={[styles.emptyText, { color: palette.muted }]}>Add a card to track balances and payoff progress.</Text> : null}
        </ScrollView>
      </View>

      <Panel palette={palette}>
        <SectionTitle title="50 / 30 / 20 budget" subtitle={`Based on ${formatCurrency(monthlyIncome, 0)} monthly income`} palette={palette} />
        {[
          { label: 'Needs · 50%', percentage: 50, amount: budgetTargets.needs, color: '#60a5fa' },
          { label: 'Wants · 30%', percentage: 30, amount: budgetTargets.wants, color: '#c084fc' },
          { label: 'Savings & debt · 20%', percentage: 20, amount: budgetTargets.savingsAndDebt, color: '#34d399' },
        ].map(item => (
          <View key={item.label} style={styles.budgetMeter}>
            <View style={styles.rowBetween}>
              <Text style={[styles.bodyStrong, { color: palette.text }]}>{item.label}</Text>
              <Text style={[styles.caption, { color: palette.muted }]}>{formatCurrency(item.amount, 0)}</Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: palette.elevated }]}>
              <View style={[styles.progressFill, { width: `${item.percentage}%`, backgroundColor: item.color }]} />
            </View>
          </View>
        ))}
        <AppButton label="Open budget & activity" icon="pie-chart-outline" onPress={() => setScreen('budget')} palette={palette} variant="quiet" compact />
      </Panel>

      <Panel palette={palette}>
        <View style={styles.rowBetween}>
          <SectionTitle title="Recent activity" subtitle="Latest account entries" palette={palette} />
          <Pressable onPress={() => setScreen('budget')}><Text style={[styles.link, { color: palette.accent }]}>See all</Text></Pressable>
        </View>
        {renderTransactionList(transactions.slice(0, 5), true)}
      </Panel>
    </>
  );

  const renderCards = () => (
    <>
      <View style={styles.pageHeadingRow}>
        <View style={styles.flex}>
          <Text style={[styles.pageTitle, { color: palette.text }]}>Cards & debt</Text>
          <Text style={[styles.caption, { color: palette.muted }]}>Manage limits and plan your payoff order.</Text>
        </View>
        <AppButton label="Add card" icon="add" onPress={openNewCard} palette={palette} compact />
      </View>
      <Panel palette={palette}>
        <Text style={[styles.eyebrow, { color: palette.muted }]}>TOTAL CREDIT UTILIZATION</Text>
        <Text style={[styles.netWorth, { color: palette.accent }]}>{utilization.toFixed(1)}%</Text>
        <Text style={[styles.caption, { color: palette.muted }]}>{formatCurrency(totalCardDebt, 0)} debt across {formatCurrency(totalCreditLimit, 0)} available credit</Text>
        <View style={[styles.progressTrack, { height: 10, backgroundColor: palette.elevated }]}>
          <View style={[styles.progressFill, { width: `${Math.min(100, utilization)}%`, backgroundColor: utilization > 30 ? '#f59e0b' : '#34d399' }]} />
        </View>
        <Text style={[styles.caption, styles.topGap, { color: palette.muted }]}>Keeping utilization below 30% can support a healthy credit profile.</Text>
      </Panel>
      <Panel palette={palette}>
        <SectionTitle title="Payoff order" subtitle="Choose a strategy for prioritizing debt." palette={palette} />
        <ChoiceChips values={['Avalanche', 'Snowball'] as const} selected={debtStrategy} onSelect={setDebtStrategy} palette={palette} />
        <Text style={[styles.caption, styles.topGap, { color: palette.muted }]}>
          {debtStrategy === 'Avalanche' ? 'Highest APR first to reduce interest paid.' : 'Lowest balance first for quicker milestones.'}
        </Text>
      </Panel>
      {sortedCards.map((card, index) => (
        <View key={card.id} style={styles.cardListItem}>
          <View style={[styles.orderBadge, { backgroundColor: palette.elevated }]}>
            <Text style={[styles.orderText, { color: palette.accent }]}>{index + 1}</Text>
          </View>
          <View style={styles.flex}>{renderCard(card, true)}</View>
        </View>
      ))}
      {!cards.length ? <Panel palette={palette}><Text style={[styles.emptyText, { color: palette.muted }]}>No cards yet. Add one to start tracking debt.</Text></Panel> : null}
    </>
  );

  const renderAgent = () => (
    <>
      <Panel palette={palette} style={styles.contextPanel}>
        <View style={[styles.liveDot, { backgroundColor: palette.green }]} />
        <View style={styles.flex}>
          <Text style={[styles.bodyStrong, { color: palette.text }]}>FinAgent live context</Text>
          <Text style={[styles.caption, { color: palette.muted }]}>{cards.length} cards · {formatCurrency(totalCardDebt, 0)} debt · {formatCurrency(liquidCash, 0)} cash</Text>
        </View>
        <Pressable onPress={resetChat} accessibilityLabel="Reset conversation">
          <Ionicons name="refresh-outline" size={20} color={palette.muted} />
        </Pressable>
      </Panel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {[
          'Which card should I pay first?',
          'Audit my credit utilization',
          'Can I afford a $400 flight?',
          'Review my monthly budget',
        ].map(question => (
          <Pressable
            key={question}
            onPress={() => void sendMessage(question)}
            disabled={isLoadingChat}
            style={[styles.chip, { backgroundColor: palette.elevated, borderColor: palette.border, opacity: isLoadingChat ? 0.5 : 1 }]}
          >
            <Text style={[styles.chipText, { color: palette.text }]}>{question}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Panel palette={palette} style={styles.chatPanel}>
        <ScrollView
          ref={chatScroll}
          style={styles.chatMessages}
          contentContainerStyle={styles.chatMessageContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map(message => (
            <View key={message.id} style={[styles.messageRow, message.sender === 'user' && styles.messageRowUser]}>
              <View style={[
                styles.messageBubble,
                { backgroundColor: message.sender === 'user' ? palette.accent : palette.elevated },
                message.sender === 'user' && styles.userMessageBubble,
              ]}>
                <Text style={[styles.messageText, { color: palette.text }]}>{message.text}</Text>
                <View style={styles.messageFooter}>
                  <Text style={[styles.messageTime, { color: message.sender === 'user' ? '#e9ddff' : palette.muted }]}>{message.timestamp}</Text>
                  {message.sender === 'ai' ? (
                    <Pressable onPress={() => void Share.share({ message: message.text })} accessibilityLabel="Share response">
                      <Ionicons name="share-outline" size={15} color={palette.muted} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          ))}
          {isLoadingChat ? <ActivityIndicator color={palette.accent} style={styles.loadingSpinner} /> : null}
        </ScrollView>
        <View style={[styles.chatComposer, { borderColor: palette.border, backgroundColor: palette.input }]}>
          <TextInput
            value={chatInput}
            onChangeText={setChatInput}
            placeholder="Ask about debt, cash flow, or a goal..."
            placeholderTextColor={palette.muted}
            multiline
            maxLength={2000}
            editable={!isLoadingChat}
            onSubmitEditing={() => void sendMessage()}
            style={[styles.chatInput, { color: palette.text }]}
          />
          <Pressable
            onPress={() => void sendMessage()}
            disabled={!chatInput.trim() || isLoadingChat}
            accessibilityLabel="Send message"
            style={[styles.sendButton, { backgroundColor: palette.accent, opacity: !chatInput.trim() || isLoadingChat ? 0.5 : 1 }]}
          >
            <Ionicons name="send-outline" size={17} color="#fff" />
          </Pressable>
        </View>
      </Panel>
      {apiError ? <Text style={[styles.caption, { color: palette.red }]}>{apiError}</Text> : null}
    </>
  );

  const renderBudget = () => (
    <>
      <View style={styles.welcomeBlock}>
        <Text style={[styles.pageTitle, { color: palette.text }]}>Budget & activity</Text>
        <Text style={[styles.caption, { color: palette.muted }]}>Review your cash flow and transaction ledger.</Text>
      </View>
      <Panel palette={palette}>
        <SectionTitle title="Monthly profile" subtitle="Update your current figures." palette={palette} />
        <View style={styles.rowBetween}>
          <Text style={[styles.bodyStrong, { color: palette.muted }]}>Estimated net worth</Text>
          <Text style={[styles.bodyStrong, { color: palette.green }]}>{formatCurrency(netWorth)}</Text>
        </View>
        <AppButton label="Manage profile" icon="person-outline" onPress={() => setScreen('settings')} palette={palette} variant="quiet" compact />
      </Panel>
      <Panel palette={palette}>
        <SectionTitle title="Spending by category" subtitle="Based on your recorded expenses." palette={palette} />
        {expenseByCategory.length
          ? <PieChart data={expenseByCategory} isDark={isDark} colors={categoryColors} />
          : <Text style={[styles.emptyText, { color: palette.muted }]}>Log expenses to see your category breakdown.</Text>}
      </Panel>
      <Panel palette={palette}>
        <View style={styles.rowBetween}>
          <SectionTitle title="Transaction ledger" subtitle={`${filteredTransactions.length} entries`} palette={palette} />
          <AppButton label="Add" icon="add" onPress={openTransactionModal} palette={palette} compact />
        </View>
        <TextInput
          value={txSearch}
          onChangeText={setTxSearch}
          placeholder="Search transactions"
          placeholderTextColor={palette.muted}
          style={[styles.field, styles.searchField, { backgroundColor: palette.input, borderColor: palette.border, color: palette.text }]}
        />
        <ChoiceChips values={['All', ...categories]} selected={txFilter} onSelect={setTxFilter} palette={palette} />
        {renderTransactionList(filteredTransactions, true)}
      </Panel>
    </>
  );

  const renderBills = () => (
    <>
      <View style={styles.pageHeadingRow}>
        <View style={styles.flex}>
          <Text style={[styles.pageTitle, { color: palette.text }]}>Upcoming bills</Text>
          <Text style={[styles.caption, { color: palette.muted }]}>Keep track of recurring payments and due dates.</Text>
        </View>
        <AppButton label="Add bill" icon="add" onPress={openNewBill} palette={palette} compact />
      </View>
      <Panel palette={palette}>
        {bills.length ? bills.map(bill => (
          <View key={bill.id} style={[styles.billRow, { borderBottomColor: palette.border, opacity: bill.paid ? 0.6 : 1 }]}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: bill.paid }}
              onPress={() => setBills(previous => previous.map(item => item.id === bill.id ? { ...item, paid: !item.paid } : item))}
              style={[styles.checkbox, { borderColor: bill.paid ? palette.green : palette.muted, backgroundColor: bill.paid ? palette.green : 'transparent' }]}
            >
              {bill.paid ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
            </Pressable>
            <View style={styles.flex}>
              <Text style={[styles.bodyStrong, { color: palette.text, textDecorationLine: bill.paid ? 'line-through' : 'none' }]}>{bill.bill_name}</Text>
              <Text style={[styles.caption, { color: palette.muted }]}>Due {bill.due_date} · {bill.category}</Text>
            </View>
            <Text style={[styles.bodyStrong, { color: palette.accent }]}>{formatCurrency(bill.amount)}</Text>
            <Pressable accessibilityLabel={`Edit ${bill.bill_name}`} onPress={() => openEditBill(bill)} hitSlop={8}><Ionicons name="create-outline" size={18} color={palette.accent} /></Pressable>
            <Pressable accessibilityLabel={`Delete ${bill.bill_name}`} onPress={() => removeBill(bill)} hitSlop={8}><Ionicons name="trash-outline" size={18} color={palette.red} /></Pressable>
          </View>
        )) : <Text style={[styles.emptyText, { color: palette.muted }]}>No bills added yet.</Text>}
      </Panel>
      <Panel palette={palette} style={styles.summaryPanel}>
        <Text style={[styles.caption, { color: palette.muted }]}>Unpaid upcoming bills</Text>
        <Text style={[styles.netWorth, { color: palette.text }]}>{formatCurrency(bills.filter(bill => !bill.paid).reduce((sum, bill) => sum + bill.amount, 0))}</Text>
      </Panel>
    </>
  );

  const renderReceipts = () => (
    <>
      <View style={styles.welcomeBlock}>
        <Text style={[styles.pageTitle, { color: palette.text }]}>Receipt scanner</Text>
        <Text style={[styles.caption, { color: palette.muted }]}>Take a photo or choose an image to extract receipt details.</Text>
      </View>
      <Panel palette={palette} style={styles.receiptPanel}>
        <View style={[styles.receiptIcon, { backgroundColor: palette.elevated }]}>
          {isScanning ? <ActivityIndicator color={palette.accent} /> : <Ionicons name="camera-outline" size={30} color={palette.accent} />}
        </View>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>{isScanning ? 'Reading receipt…' : 'Add a receipt image'}</Text>
        <Text style={[styles.caption, styles.centerText, { color: palette.muted }]}>FinAgent will find the merchant, category, and total before adding the expense.</Text>
        <AppButton label="Take photo or choose image" icon="camera-outline" onPress={chooseReceiptSource} palette={palette} disabled={isScanning} />
      </Panel>
      {scannedReceipt ? (
        <Panel palette={palette}>
          <Text style={[styles.eyebrow, { color: palette.accent }]}>RECEIPT READY</Text>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>{scannedReceipt.merchant}</Text>
              <Text style={[styles.caption, { color: palette.muted }]}>{scannedReceipt.category} · {scannedReceipt.date}</Text>
            </View>
            <Text style={[styles.sectionTitle, { color: palette.green }]}>{formatCurrency(scannedReceipt.total)}</Text>
          </View>
          <Text style={[styles.caption, styles.topGap, { color: palette.muted }]}>Choose a card to record the charge.</Text>
          <AppButton label="Record from cash" icon="wallet-outline" onPress={() => confirmReceipt('Primary Checking')} palette={palette} variant="secondary" />
          {cards.map(card => (
            <AppButton key={card.id} label={`Charge ${card.cardName}`} icon="card-outline" onPress={() => confirmReceipt(card.cardName)} palette={palette} variant="secondary" />
          ))}
          <AppButton label="Discard receipt" onPress={() => setScannedReceipt(null)} palette={palette} variant="quiet" />
        </Panel>
      ) : null}
    </>
  );

  const renderSettings = () => (
    <>
      <View style={styles.welcomeBlock}>
        <Text style={[styles.pageTitle, { color: palette.text }]}>Profile & settings</Text>
        <Text style={[styles.caption, { color: palette.muted }]}>Manage the information used across your dashboard and finance calculations.</Text>
      </View>
      <Panel palette={palette}>
        <SectionTitle title="Financial profile" subtitle="Amounts are stored only on this device." palette={palette} />
        <Field label="Display name" value={profileNameDraft} onChangeText={setProfileNameDraft} palette={palette} placeholder="Your name" maxLength={100} />
        <Field label="Monthly income" value={incomeDraft} onChangeText={setIncomeDraft} palette={palette} placeholder="0.00" keyboardType="decimal-pad" />
        <Field label="Average monthly expenses" value={expensesDraft} onChangeText={setExpensesDraft} palette={palette} placeholder="0.00" keyboardType="decimal-pad" />
        <Text style={[styles.caption, { color: palette.muted }]}>Used only to estimate cash runway. Recorded transactions do not have reliable monthly periods.</Text>
        <Field label="Liquid cash" value={cashDraft} onChangeText={setCashDraft} palette={palette} placeholder="0.00" keyboardType="decimal-pad" />
        <AppButton label="Save profile" icon="checkmark-outline" onPress={saveProfile} palette={palette} />
      </Panel>
      <Panel palette={palette}>
        <SectionTitle title="Preferences" subtitle="These preferences are saved on this device." palette={palette} />
        <Text style={[styles.fieldLabel, { color: palette.muted }]}>Payoff strategy</Text>
        <ChoiceChips values={['Avalanche', 'Snowball'] as const} selected={debtStrategy} onSelect={setDebtStrategy} palette={palette} />
        <Text style={[styles.caption, styles.topGap, { color: palette.muted }]}>Theme: {theme}. Use the sun/moon button in the header to switch modes.</Text>
      </Panel>
      <Panel palette={palette}>
        <SectionTitle title="On-device storage" subtitle="Financial data and preferences use Expo AsyncStorage on this device." palette={palette} />
        {storageStatus === 'failed' ? (
          <>
            <Text style={[styles.caption, { color: palette.red }]}>{storageError || 'Saved information could not be loaded.'}</Text>
            <View style={styles.modalButtons}>
              <AppButton label="Retry loading" icon="refresh-outline" onPress={() => void retryStorageLoad()} palette={palette} compact />
              <AppButton label="Delete all saved data" icon="trash-outline" onPress={resetStoredData} palette={palette} variant="danger" compact />
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.caption, { color: palette.muted }]}>Changes are saved automatically after each update.</Text>
            {storageError ? (
              <>
                <Text style={[styles.caption, { color: palette.red }]}>{storageError}</Text>
                <AppButton label="Retry saving" icon="refresh-outline" onPress={() => setSaveRevision(value => value + 1)} palette={palette} />
              </>
            ) : null}
            <AppButton label="Delete all saved data" icon="trash-outline" onPress={resetStoredData} palette={palette} variant="danger" />
          </>
        )}
        {storageWarnings.map((warning, index) => (
          <Text key={`${warning}-${index}`} style={[styles.caption, { color: palette.red }]}>{warning}</Text>
        ))}
      </Panel>
    </>
  );

  const renderScreen = () => {
    switch (screen) {
      case 'home': return renderHome();
      case 'cards': return renderCards();
      case 'agent': return renderAgent();
      case 'budget': return renderBudget();
      case 'bills': return renderBills();
      case 'receipts': return renderReceipts();
      case 'settings': return renderSettings();
    }
  };

  const renderModalContent = () => {
    if (modal === 'card') {
      return (
        <>
          <Text style={[styles.modalTitle, { color: palette.text }]}>{editingCardId ? 'Edit card' : 'Add a card'}</Text>
          <Field label="Card name" value={cardName} onChangeText={setCardName} palette={palette} placeholder="e.g. Chase Sapphire" />
          <Text style={[styles.fieldLabel, { color: palette.muted }]}>Network</Text>
          <ChoiceChips values={['visa', 'mastercard', 'amex', 'discover'] as const} selected={cardNetwork} onSelect={setCardNetwork} palette={palette} />
          <Field label="Last four digits" value={cardLast4} onChangeText={setCardLast4} palette={palette} placeholder="4821" keyboardType="number-pad" maxLength={4} />
          <Field label="Current balance" value={cardBalance} onChangeText={setCardBalance} palette={palette} placeholder="1200.00" keyboardType="decimal-pad" />
          <Field label="Credit limit" value={cardLimit} onChangeText={setCardLimit} palette={palette} placeholder="8000.00" keyboardType="decimal-pad" />
          <View style={styles.formRow}>
            <View style={styles.flex}><Field label="APR (%)" value={cardApr} onChangeText={setCardApr} palette={palette} keyboardType="decimal-pad" /></View>
            <View style={styles.flex}><Field label="Due date" value={cardDueDate} onChangeText={setCardDueDate} palette={palette} placeholder="Nov 15" /></View>
          </View>
          <View style={styles.modalButtons}>
            <AppButton label="Cancel" onPress={() => setModal(null)} palette={palette} variant="secondary" />
            <AppButton label={editingCardId ? 'Save changes' : 'Save card'} onPress={saveCard} palette={palette} />
          </View>
        </>
      );
    }
    if (modal === 'transaction') {
      return (
        <>
          <Text style={[styles.modalTitle, { color: palette.text }]}>{editingTransactionId ? 'Edit transaction' : 'Log transaction'}</Text>
          <ChoiceChips values={['expense', 'income'] as const} selected={txType} onSelect={setTxType} palette={palette} />
          <Field label="Merchant / payee" value={txTitle} onChangeText={setTxTitle} palette={palette} placeholder="e.g. Target, salary" />
          <Field label="Amount" value={txAmount} onChangeText={setTxAmount} palette={palette} placeholder="45.00" keyboardType="decimal-pad" />
          <Text style={[styles.fieldLabel, { color: palette.muted }]}>Category</Text>
          <ChoiceChips values={categories} selected={txCategory} onSelect={setTxCategory} palette={palette} />
          <Text style={[styles.fieldLabel, { color: palette.muted }]}>Account / card used</Text>
          <ChoiceChips values={['Primary Checking', ...cards.map(card => card.cardName)]} selected={txSource} onSelect={setTxSource} palette={palette} />
          <View style={styles.modalButtons}>
            <AppButton label="Cancel" onPress={() => setModal(null)} palette={palette} variant="secondary" />
            <AppButton label={editingTransactionId ? 'Save changes' : 'Save transaction'} onPress={saveTransaction} palette={palette} />
          </View>
        </>
      );
    }
    if (modal === 'bill') {
      return (
        <>
          <Text style={[styles.modalTitle, { color: palette.text }]}>{editingBillId ? 'Edit bill' : 'Add a bill'}</Text>
          <Field label="Bill name" value={billName} onChangeText={setBillName} palette={palette} placeholder="Internet, insurance…" />
          <Field label="Amount" value={billAmount} onChangeText={setBillAmount} palette={palette} placeholder="80.00" keyboardType="decimal-pad" />
          <Field label="Due date" value={billDueDate} onChangeText={setBillDueDate} palette={palette} placeholder="e.g. Nov 25" />
          <View style={styles.modalButtons}>
            <AppButton label="Cancel" onPress={() => setModal(null)} palette={palette} variant="secondary" />
            <AppButton label={editingBillId ? 'Save changes' : 'Save bill'} onPress={saveBill} palette={palette} />
          </View>
        </>
      );
    }
    if (modal === 'payment') {
      const card = cards.find(item => item.id === activeCardId);
      return (
        <>
          <Text style={[styles.modalTitle, { color: palette.text }]}>Pay down {card?.cardName}</Text>
          <Text style={[styles.caption, { color: palette.muted }]}>Current balance: {formatCurrency(card?.balance ?? 0)}</Text>
          <Field label="Payment amount" value={paymentAmount} onChangeText={setPaymentAmount} palette={palette} placeholder="45.00" keyboardType="decimal-pad" />
          <Text style={[styles.caption, { color: palette.muted }]}>The payment reduces card debt and available cash.</Text>
          <View style={styles.modalButtons}>
            <AppButton label="Cancel" onPress={() => setModal(null)} palette={palette} variant="secondary" />
            <AppButton label="Apply payment" onPress={savePayment} palette={palette} />
          </View>
        </>
      );
    }
    return null;
  };

  if (storageStatus === 'loading') {
    return (
      <SafeAreaView style={[styles.loadingScreen, { backgroundColor: palette.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={palette.accent} />
        <Text style={[styles.caption, styles.topGap, { color: palette.muted }]}>Loading your accounts…</Text>
      </SafeAreaView>
    );
  }

  const tabs: { id: Screen; label: string; icon: IconName }[] = [
    { id: 'home', label: 'Home', icon: 'home-outline' },
    { id: 'cards', label: 'Cards', icon: 'card-outline' },
    { id: 'agent', label: 'FinAgent', icon: 'sparkles-outline' },
    { id: 'budget', label: 'Budget', icon: 'pie-chart-outline' },
    { id: 'bills', label: 'Bills', icon: 'calendar-outline' },
    { id: 'receipts', label: 'Scan', icon: 'camera-outline' },
    { id: 'settings', label: 'Settings', icon: 'settings-outline' },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['top', 'left', 'right']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView style={styles.app} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { backgroundColor: palette.background, borderBottomColor: palette.border }]}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>F</Text></View>
          <View style={styles.brandCopy}>
            <Text style={[styles.brandName, { color: palette.text }]}>FinAgent</Text>
            <Text style={[styles.brandTagline, { color: palette.muted }]}>Your money, in focus</Text>
          </View>
          <Pressable onPress={() => setTheme(isDark ? 'light' : 'dark')} accessibilityLabel="Toggle color theme" style={[styles.themeButton, { borderColor: palette.border }]}>
            <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={isDark ? '#fbbf24' : palette.accent} />
          </Pressable>
          <Pressable onPress={openTransactionModal} accessibilityLabel="Add transaction" style={[styles.headerAdd, { backgroundColor: palette.accent }]}>
            <Ionicons name="add" size={23} color="#fff" />
          </Pressable>
        </View>

        {storageStatus === 'failed' || storageError || storageWarnings.length ? (
          <View style={[styles.storageWarning, { backgroundColor: storageError || storageStatus === 'failed' ? '#7f1d1d' : '#854d0e' }]}>
            <Ionicons name="alert-circle-outline" size={17} color="#fff" />
            <Text style={styles.storageWarningText}>
              {storageError || (storageStatus === 'failed' ? 'Saved information could not be loaded.' : storageWarnings.join(' '))}
            </Text>
            {storageStatus === 'failed'
              ? <Pressable onPress={() => void retryStorageLoad()} accessibilityLabel="Retry loading saved information"><Ionicons name="refresh-outline" size={19} color="#fff" /></Pressable>
              : storageError
                ? <Pressable onPress={() => setSaveRevision(value => value + 1)} accessibilityLabel="Retry saving"><Ionicons name="refresh-outline" size={19} color="#fff" /></Pressable>
                : null}
          </View>
        ) : null}

        <ScrollView
          key={screen}
          style={styles.mainScroll}
          contentContainerStyle={styles.pageContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {renderScreen()}
        </ScrollView>

        <View style={[styles.tabBar, { backgroundColor: palette.surface, borderTopColor: palette.border }]}>
          {tabs.map(tab => {
            const active = tab.id === screen;
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setScreen(tab.id)}
                style={styles.tabItem}
              >
                <Ionicons name={tab.icon} size={20} color={active ? palette.accent : palette.muted} />
                <Text style={[styles.tabLabel, { color: active ? palette.accent : palette.muted }]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </KeyboardAvoidingView>

      {toast ? (
        <View pointerEvents="none" style={[styles.toast, { backgroundColor: toastIsError ? '#be123c' : palette.accent }]}>
          <Ionicons name={toastIsError ? 'alert-circle' : 'checkmark-circle'} size={18} color="#fff" />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <Modal visible={modal !== null} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.modalSheet, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <View style={styles.modalHandle} />
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {renderModalContent()}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={confirmation !== null} transparent animationType="fade" onRequestClose={() => setConfirmation(null)}>
        <View style={styles.confirmationBackdrop}>
          <View style={[styles.confirmationCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.modalTitle, { color: palette.text }]}>{confirmation?.title}</Text>
            <Text style={[styles.caption, { color: palette.muted }]}>{confirmation?.message}</Text>
            <View style={styles.modalButtons}>
              <AppButton label="Cancel" onPress={() => setConfirmation(null)} palette={palette} variant="secondary" />
              <AppButton
                label={confirmation?.confirmLabel ?? 'Confirm'}
                onPress={() => {
                  const action = confirmation?.onConfirm;
                  setConfirmation(null);
                  action?.();
                }}
                palette={palette}
                variant="danger"
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  app: { flex: 1 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { minHeight: 64, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  brandMark: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#fff', fontSize: 19, fontWeight: '900' },
  brandCopy: { marginLeft: 10, flex: 1 },
  brandName: { fontSize: 17, fontWeight: '800' },
  brandTagline: { fontSize: 11, marginTop: 1 },
  themeButton: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  headerAdd: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  storageWarning: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  storageWarningText: { color: '#fff', fontSize: 12, flex: 1 },
  mainScroll: { flex: 1 },
  pageContent: { padding: 16, paddingBottom: 28, gap: 14, maxWidth: 760, width: '100%', alignSelf: 'center' },
  welcomeBlock: { marginBottom: 2 },
  pageTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 6 },
  eyebrowWhite: { color: '#ffffffbb', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  netWorth: { fontSize: 32, fontWeight: '900', letterSpacing: -0.7, marginTop: 5, marginBottom: 12 },
  panel: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 12 },
  metricRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  metric: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#8b5cf615' },
  metricValue: { fontSize: 17, fontWeight: '800', marginTop: 3 },
  section: { gap: 9 },
  sectionHeading: { marginBottom: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  caption: { fontSize: 12, lineHeight: 17 },
  bodyStrong: { fontSize: 14, fontWeight: '700' },
  link: { fontSize: 13, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pageHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 43, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  buttonCompact: { minHeight: 36, paddingHorizontal: 10, paddingVertical: 8, alignSelf: 'flex-start' },
  buttonBorder: { borderWidth: 1 },
  buttonText: { fontSize: 13, fontWeight: '800' },
  buttonTextCompact: { fontSize: 11 },
  cardCarousel: { gap: 10, paddingRight: 10 },
  cardPanel: { width: 260, minHeight: 170, justifyContent: 'space-between', gap: 10, borderWidth: 0 },
  cardName: { color: '#fff', fontWeight: '800', fontSize: 14 },
  cardNumber: { color: '#ffffffdd', fontSize: 12, fontWeight: '700' },
  cardBalanceBlock: { marginVertical: 5 },
  cardBalance: { color: '#fff', fontSize: 23, fontWeight: '900', letterSpacing: -0.4 },
  progressTrack: { height: 6, borderRadius: 8, overflow: 'hidden', backgroundColor: '#ffffff35', marginTop: 6 },
  progressFill: { height: '100%', borderRadius: 8 },
  budgetMeter: { gap: 5 },
  topGap: { marginTop: 4 },
  transactionRow: { minHeight: 63, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  transactionIcon: { width: 37, height: 37, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  transactionInfo: { flex: 1, minWidth: 0, gap: 3 },
  transactionAmount: { fontSize: 13, fontWeight: '800' },
  emptyText: { paddingVertical: 14, fontSize: 13, lineHeight: 19 },
  chip: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, marginRight: 7 },
  chipsRow: { paddingRight: 8, alignItems: 'center' },
  chipText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  cardListItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  orderBadge: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  orderText: { fontWeight: '900', fontSize: 13 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  cardMetaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginTop: 3 },
  contextPanel: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  chatPanel: { flex: 1, minHeight: 410, padding: 10 },
  chatMessages: { flex: 1 },
  chatMessageContent: { gap: 10, paddingBottom: 8 },
  messageRow: { alignItems: 'flex-start' },
  messageRowUser: { alignItems: 'flex-end' },
  messageBubble: { maxWidth: '92%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  userMessageBubble: { borderBottomRightRadius: 5 },
  messageText: { fontSize: 14, lineHeight: 20 },
  messageFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 6 },
  messageTime: { fontSize: 10 },
  loadingSpinner: { marginVertical: 10 },
  chatComposer: { minHeight: 49, borderWidth: 1, borderRadius: 15, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginTop: 8, gap: 8 },
  chatInput: { flex: 1, minHeight: 42, maxHeight: 110, fontSize: 14, paddingVertical: 10 },
  sendButton: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  fieldWrap: { gap: 5, marginBottom: 10 },
  fieldLabel: { fontSize: 11, fontWeight: '700' },
  field: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  formRow: { flexDirection: 'row', gap: 10 },
  searchField: { marginBottom: 10 },
  billRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  checkbox: { width: 24, height: 24, borderWidth: 1.5, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  summaryPanel: { alignItems: 'center' },
  receiptPanel: { alignItems: 'center', paddingVertical: 26, gap: 12 },
  receiptIcon: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  tabBar: { minHeight: 62, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 3, paddingBottom: Platform.OS === 'ios' ? 2 : 5 },
  tabItem: { minWidth: 46, flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 6 },
  tabLabel: { fontSize: 9, fontWeight: '700' },
  toast: { position: 'absolute', bottom: 76, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 11, elevation: 8 },
  confirmationBackdrop: { flex: 1, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center', padding: 20 },
  confirmationCard: { width: '100%', maxWidth: 420, borderWidth: 1, borderRadius: 20, padding: 20, gap: 8 },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0009' },
  modalKeyboard: { maxHeight: '92%' },
  modalSheet: { maxHeight: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingTop: 10, paddingHorizontal: 18, paddingBottom: 26 },
  modalHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 4, backgroundColor: '#71717a', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 14 },
  modalButtons: { flexDirection: 'row', gap: 9, marginTop: 12, marginBottom: 8 },
});

export default FinAgentApp;
