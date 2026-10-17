import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  type KeyboardTypeOptions,
  type ScrollView as ScrollViewRef,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import api from '../lib/api';
import { NetWorthChart } from './NetWorthChart';
import { PieChart, type CategoryItem } from './PieChart';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Screen = 'home' | 'cards' | 'agent' | 'budget' | 'bills' | 'receipts';
type CardNetwork = 'visa' | 'mastercard' | 'amex' | 'discover';
type TransactionType = 'income' | 'expense';
type ModalType = 'card' | 'transaction' | 'bill' | 'payment' | 'compose' | null;
type IconName = keyof typeof Ionicons.glyphMap;

interface CreditCardItem {
  id: string;
  cardName: string;
  network: CardNetwork;
  last4: string;
  balance: number;
  creditLimit: number;
  apr: number;
  dueDate: string;
  minPayment: number;
  colorTheme?: string;
}

interface TransactionItem {
  id: string;
  title: string;
  category: string;
  date: string;
  amount: number;
  type: TransactionType;
  source: string;
}

interface UpcomingBill {
  id: string;
  bill_name: string;
  due_date: string;
  amount: number;
  paid: boolean;
  category: string;
}

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

const defaultCards: CreditCardItem[] = [];
const defaultTransactions: TransactionItem[] = [];
const defaultBills: UpcomingBill[] = [];

const categories = ['Groceries', 'Dining', 'Housing', 'Utilities', 'Transportation', 'Entertainment', 'Health', 'Income'];
const categoryColors = ['#60a5fa', '#c084fc', '#fb923c', '#34d399', '#fbbf24', '#f472b6', '#22d3ee', '#a3e635'];
const cardColors: Record<CardNetwork, string> = {
  visa: '#272b63',
  mastercard: '#292a32',
  amex: '#654b17',
  discover: '#155e55',
};
const storageKeys = ['fin_theme', 'fin_onboarded', 'fin_cards', 'fin_transactions', 'fin_bills', 'fin_monthly_income', 'fin_liquid_cash', 'fin_user_name'] as const;

const formatCurrency = (value: number, decimals = 2) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

const parseArray = <T,>(value: string | null, fallback: T[], key: string): T[] => {
  if (!value) return fallback;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error(`Stored value for ${key} is not an array`);
    return parsed as T[];
  } catch (error) {
    console.error(`Failed to parse ${key} from AsyncStorage`, error);
    return fallback;
  }
};

const parseNumber = (value: string | null, fallback: number, key: string) => {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  console.error(`Invalid numeric value for ${key} in AsyncStorage`);
  return fallback;
};

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
        {
          backgroundColor,
          borderColor: palette.border,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
          transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
        },
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

function TransactionRow({ item, palette }: { item: TransactionItem; palette: Palette }) {
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
    </View>
  );
}

function FinAgentApp() {
  const [storageStatus, setStorageStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [screen, setScreen] = useState<Screen>('home');
  const [screenHistory, setScreenHistory] = useState<Screen[]>(['home']);
  const screenHistoryRef = useRef(screenHistory);
  screenHistoryRef.current = screenHistory;

  const abortControllerRef = useRef<AbortController | null>(null);

  const screenFadeAnim = useRef(new Animated.Value(1)).current;
  const screenSlideAnim = useRef(new Animated.Value(0)).current;

  const navigateToScreen = (nextScreen: Screen) => {
    if (nextScreen === screen) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setScreenHistory(previous => [...previous, nextScreen]);
    setScreen(nextScreen);
  };

  const goBack = () => {
    if (screenHistoryRef.current.length <= 1) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setScreenHistory(previous => {
      const updated = [...previous];
      updated.pop();
      const target = updated[updated.length - 1] ?? 'home';
      setScreen(target);
      return updated;
    });
  };

  const stopAgent = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoadingChat(false);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMessages(previous => [
      ...previous,
      {
        id: `stop-${Date.now()}`,
        text: '⏹ FinAgent response stopped.',
        sender: 'ai',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  useEffect(() => {
    screenFadeAnim.setValue(0.35);
    screenSlideAnim.setValue(8);
    Animated.parallel([
      Animated.timing(screenFadeAnim, {
        toValue: 1,
        duration: 160,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: true,
      }),
      Animated.spring(screenSlideAnim, {
        toValue: 0,
        friction: 11,
        tension: 130,
        useNativeDriver: true,
      }),
    ]).start();
  }, [screen]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) => {
          return (
            screenHistoryRef.current.length > 1 &&
            gestureState.dx > 16 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2
          );
        },
        onPanResponderRelease: (_evt, gestureState) => {
          if (gestureState.dx > 40 || (gestureState.dx > 20 && gestureState.vx > 0.25)) {
            goBack();
          }
        },
      }),
    []
  );

  const [isOnboarded, setIsOnboarded] = useState(false);
  const [onboardStep, setOnboardStep] = useState<1 | 2 | 3>(1);
  const [onboardName, setOnboardName] = useState('');
  const [onboardIncome, setOnboardIncome] = useState('');
  const [onboardCash, setOnboardCash] = useState('');
  const [onboardCards, setOnboardCards] = useState<CreditCardItem[]>([]);
  const [onboardCardName, setOnboardCardName] = useState('');
  const [onboardCardNetwork, setOnboardCardNetwork] = useState<CardNetwork>('visa');
  const [onboardCardBalance, setOnboardCardBalance] = useState('');
  const [onboardCardLimit, setOnboardCardLimit] = useState('');
  const [onboardCardApr, setOnboardCardApr] = useState('');
  const [onboardCardLast4, setOnboardCardLast4] = useState('');
  const [onboardCardDueDate, setOnboardCardDueDate] = useState('');

  const [userName, setUserName] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [liquidCash, setLiquidCash] = useState(0);
  const [cards, setCards] = useState<CreditCardItem[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [bills, setBills] = useState<UpcomingBill[]>([]);
  const [modal, setModal] = useState<ModalType>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
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
  const [paymentAmount, setPaymentAmount] = useState('');
  const [debtStrategy, setDebtStrategy] = useState<'Avalanche' | 'Snowball'>('Avalanche');
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
  const toastAnim = useRef(new Animated.Value(0)).current;
  const [apiError, setApiError] = useState('');
  const insets = useSafeAreaInsets();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const chatScroll = useRef<ScrollViewRef>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDark = theme === 'dark';
  const palette = useMemo(() => paletteFor(isDark), [isDark]);

  const totalCardDebt = cards.reduce((sum, card) => sum + (card.balance || 0), 0);
  const totalCreditLimit = cards.reduce((sum, card) => sum + (card.creditLimit || 0), 0);
  const utilization = totalCreditLimit > 0 ? (totalCardDebt / totalCreditLimit) * 100 : 0;
  const netWorth = liquidCash - totalCardDebt;
  const sortedCards = [...cards].sort((a, b) =>
    debtStrategy === 'Avalanche' ? b.apr - a.apr : a.balance - b.balance
  );

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const entries = await AsyncStorage.multiGet([...storageKeys]);
        if (!mounted) return;
        const stored = Object.fromEntries(entries);
        if (stored.fin_theme === 'dark' || stored.fin_theme === 'light') setTheme(stored.fin_theme);

        const onboarded = stored.fin_onboarded === 'true';
        setIsOnboarded(onboarded);

        if (onboarded) {
          if (stored.fin_user_name) setUserName(stored.fin_user_name);
          setCards(parseArray(stored.fin_cards ?? null, [], 'fin_cards'));
          setTransactions(parseArray(stored.fin_transactions ?? null, [], 'fin_transactions'));
          setBills(parseArray(stored.fin_bills ?? null, [], 'fin_bills'));
          setMonthlyIncome(parseNumber(stored.fin_monthly_income ?? null, 0, 'fin_monthly_income'));
          setLiquidCash(parseNumber(stored.fin_liquid_cash ?? null, 0, 'fin_liquid_cash'));
        } else {
          setUserName('');
          setCards([]);
          setTransactions([]);
          setBills([]);
          setMonthlyIncome(0);
          setLiquidCash(0);
        }
        setStorageStatus('ready');
      } catch (error) {
        console.error('Failed to load app data from AsyncStorage', error);
        if (mounted) setStorageStatus('failed');
      }
    };
    void load();
    return () => {
      mounted = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (storageStatus !== 'ready' || !isOnboarded) return;
    void AsyncStorage.multiSet([
      ['fin_onboarded', 'true'],
      ['fin_theme', theme],
      ['fin_user_name', userName],
      ['fin_cards', JSON.stringify(cards)],
      ['fin_transactions', JSON.stringify(transactions)],
      ['fin_bills', JSON.stringify(bills)],
      ['fin_monthly_income', String(monthlyIncome)],
      ['fin_liquid_cash', String(liquidCash)],
    ]).catch(error => {
      console.error('Failed to save app data to AsyncStorage', error);
      setStorageStatus('failed');
    });
  }, [storageStatus, isOnboarded, theme, userName, cards, transactions, bills, monthlyIncome, liquidCash]);

  const handleAddOnboardCard = () => {
    if (!onboardCardName.trim()) return;

    const bal = parseFloat(onboardCardBalance) || 0;
    const lim = parseFloat(onboardCardLimit) || 1000;
    const apr = parseFloat(onboardCardApr) || 21.99;

    const newCard: CreditCardItem = {
      id: `c-mob-onboard-${Date.now()}`,
      cardName: onboardCardName.trim(),
      network: onboardCardNetwork,
      last4: onboardCardLast4.trim() || '0000',
      balance: bal,
      creditLimit: lim,
      apr,
      dueDate: onboardCardDueDate.trim() || 'End of month',
      minPayment: Math.round(Math.max(15, bal * 0.025)),
      colorTheme: cardColors[onboardCardNetwork],
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
        timestamp: 'Just now',
        text: `Welcome, ${finalName}! Your account is active with ${onboardCards.length} credit card${onboardCards.length === 1 ? '' : 's'} and $${finalIncome.toLocaleString()} monthly income. How can I help optimize your money today?`,
      },
    ]);

    showToast(`Welcome to FinAgent, ${finalName}!`);
  };

  const handleResetData = () => {
    Alert.alert(
      'Reset All Data?',
      'This will clear all entered finances, credit cards, income, and transactions and restart onboarding.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset & Re-onboard',
          style: 'destructive',
          onPress: async () => {
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
          },
        },
      ]
    );
  };

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
      if (screen === 'agent') {
        setTimeout(() => {
          chatScroll.current?.scrollToEnd({ animated: true });
        }, 80);
      }
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [screen]);

  useEffect(() => {
    if (screen === 'agent') {
      const timer = setTimeout(() => {
        chatScroll.current?.scrollToEnd({ animated: false });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [messages, isLoadingChat, screen]);

  const showToast = (message: string) => {
    setToast(message);
    toastAnim.setValue(0);
    Animated.spring(toastAnim, {
      toValue: 1,
      friction: 7,
      tension: 100,
      useNativeDriver: true,
    }).start();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => setToast(''));
    }, 2800);
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

  const saveCard = () => {
    if (!cardName.trim()) {
      Alert.alert('Card name required', 'Enter a name for this card before saving.');
      return;
    }
    const balance = Number.parseFloat(cardBalance) || 0;
    const limit = Number.parseFloat(cardLimit) || 0;
    const apr = Number.parseFloat(cardApr) || 0;
    if (editingCardId) {
      setCards(previous => previous.map(card => card.id === editingCardId
        ? { ...card, cardName: cardName.trim(), network: cardNetwork, last4: cardLast4.trim() || card.last4, balance, creditLimit: limit, apr, dueDate: cardDueDate.trim() || card.dueDate }
        : card));
      showToast('Card updated');
    } else {
      setCards(previous => [...previous, {
        id: `c-${Date.now()}`,
        cardName: cardName.trim(),
        network: cardNetwork,
        last4: cardLast4.trim() || '0000',
        balance,
        creditLimit: limit,
        apr,
        dueDate: cardDueDate.trim() || 'End of month',
        minPayment: Math.round(Math.max(15, balance * 0.025)),
      }]);
      showToast(`Added ${cardName.trim()}`);
    }
    setModal(null);
  };

  const saveTransaction = () => {
    const title = txTitle.trim();
    const amount = Number.parseFloat(txAmount);
    if (!title || !Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Check transaction details', 'Enter a payee and an amount greater than zero.');
      return;
    }
    const transaction: TransactionItem = {
      id: `tx-${Date.now()}`,
      title,
      category: txCategory,
      date: 'Today',
      amount,
      type: txType,
      source: txSource,
    };
    setTransactions(previous => [transaction, ...previous]);
    if (txType === 'income') {
      setLiquidCash(previous => previous + amount);
    } else if (cards.some(card => card.cardName === txSource)) {
      setCards(previous => previous.map(card => card.cardName === txSource ? { ...card, balance: card.balance + amount } : card));
    } else {
      setLiquidCash(previous => Math.max(0, previous - amount));
    }
    setTxTitle('');
    setTxAmount('');
    setModal(null);
    showToast(`Logged ${txType}: ${formatCurrency(amount)}`);
  };

  const saveBill = () => {
    const amount = Number.parseFloat(billAmount);
    if (!billName.trim() || !Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Check bill details', 'Enter a bill name and an amount greater than zero.');
      return;
    }
    setBills(previous => [...previous, {
      id: `b-${Date.now()}`,
      bill_name: billName.trim(),
      amount,
      due_date: billDueDate.trim() || 'Date not set',
      paid: false,
      category: 'Recurring',
    }]);
    setBillName('');
    setBillAmount('');
    setBillDueDate('');
    setModal(null);
    showToast('Bill added');
  };

  const savePayment = () => {
    const amount = Number.parseFloat(paymentAmount);
    const card = cards.find(item => item.id === activeCardId);
    if (!card || !Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Check payment amount', 'Enter an amount greater than zero.');
      return;
    }
    setCards(previous => previous.map(item => item.id === card.id
      ? { ...item, balance: Math.max(0, item.balance - amount) }
      : item));
    setLiquidCash(previous => Math.max(0, previous - amount));
    setModal(null);
    setPaymentAmount('');
    showToast(`Payment applied to ${card.cardName}`);
  };

  const removeCard = (card: CreditCardItem) => {
    Alert.alert('Remove card?', `Remove ${card.cardName} from your wallet?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setCards(previous => previous.filter(item => item.id !== card.id));
          showToast('Card removed');
        },
      },
    ]);
  };

  const sendMessage = async (prompt?: string) => {
    const text = (prompt ?? chatInput).trim();
    if (!text || isLoadingChat) return;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMessages(previous => [...previous, { id: `u-${Date.now()}`, text, sender: 'user', timestamp }]);
    setChatInput('');
    setIsLoadingChat(true);
    setApiError('');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      if (Platform.OS !== 'web' && !api.defaults.baseURL) {
        throw new Error('Set EXPO_PUBLIC_API_URL to your API server address to use AI and receipt scanning.');
      }
      const response = await api.post(
        '/api/chat',
        {
          message: text,
          userContext: { cards, totalBalance: liquidCash, monthlyIncome, bills, transactions },
        },
        {
          signal: abortController.signal,
        }
      );
      const reply = response.data?.ai_reply;
      if (typeof reply !== 'string' || !reply.trim()) throw new Error('The AI service returned an empty response.');
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMessages(previous => [...previous, {
        id: `ai-${Date.now()}`,
        text: reply,
        sender: 'ai',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    } catch (error: any) {
      if (abortController.signal.aborted || error?.name === 'CanceledError' || axios.isCancel(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Unable to connect to the AI service.';
      console.error('AI chat request failed', error);
      setApiError(message);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMessages(previous => [...previous, {
        id: `ai-${Date.now()}`,
        text: `I could not reach the AI service. ${message}`,
        sender: 'ai',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    } finally {
      setIsLoadingChat(false);
      abortControllerRef.current = null;
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
      navigateToScreen('receipts');
      if (fromCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera permission needed', 'Allow camera access to scan a receipt, or choose a photo from your library.');
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
      const message = error instanceof Error ? error.message : 'Unable to scan this receipt.';
      console.error('Receipt scan failed', error);
      Alert.alert('Receipt scan failed', message);
    } finally {
      setIsScanning(false);
    }
  };

  const chooseReceiptSource = () => {
    Alert.alert('Scan a receipt', 'Choose where to get the receipt image.', [
      { text: 'Take photo', onPress: () => void processReceipt(true) },
      { text: 'Photo library', onPress: () => void processReceipt(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmReceipt = (cardName: string) => {
    if (!scannedReceipt) return;
    const amount = scannedReceipt.total;
    setTransactions(previous => [{
      id: `tx-${Date.now()}`,
      title: scannedReceipt.merchant,
      category: scannedReceipt.category,
      date: scannedReceipt.date,
      amount,
      type: 'expense',
      source: cardName,
    }, ...previous]);
    setCards(previous => previous.map(card => card.cardName === cardName ? { ...card, balance: card.balance + amount } : card));
    setScannedReceipt(null);
    navigateToScreen('home');
    showToast(`Receipt added to ${cardName}`);
  };

  const openTransactionModal = () => {
    setTxType('expense');
    setTxCategory('Groceries');
    setTxSource('Primary Checking');
    setModal('transaction');
  };

  const expenseByCategory: CategoryItem[] = useMemo(() => {
    const totals = new Map<string, number>();
    transactions.filter(item => item.type === 'expense').forEach(item => {
      totals.set(item.category, (totals.get(item.category) ?? 0) + item.amount);
    });
    return [...totals.entries()].map(([category, amount]) => ({ category, amount }));
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

  const filteredTransactions = transactions.filter(item => {
    const query = txSearch.trim().toLowerCase();
    const matchesSearch = !query || item.title.toLowerCase().includes(query) || item.category.toLowerCase().includes(query);
    const matchesCategory = txFilter === 'All' || item.category === txFilter;
    return matchesSearch && matchesCategory;
  });

  const renderTransactionList = (list: TransactionItem[]) => (
    <View>
      {list.length ? list.map(item => <TransactionRow key={item.id} item={item} palette={palette} />)
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
        <Text style={[styles.pageTitle, { color: palette.text }]}>Welcome{userName ? `, ${userName}` : ''}</Text>
      </View>

      {/* Hero Net Worth Card */}
      <Panel palette={palette} style={styles.heroPanel}>
        <View style={styles.rowBetween}>
          <Text style={[styles.eyebrow, { color: palette.muted }]}>TOTAL NET WORTH</Text>
          <Ionicons name="trending-up" size={18} color={palette.green} />
        </View>
        <Text style={[styles.netWorth, { color: palette.text }]}>{formatCurrency(netWorth)}</Text>
        <View style={styles.heroStatRow}>
          <View style={[styles.statChip, { backgroundColor: palette.elevated, borderColor: palette.border }]}>
            <Text style={[styles.caption, { color: palette.muted }]}>Cash</Text>
            <Text style={[styles.statChipValue, { color: palette.green }]}>{formatCurrency(liquidCash, 0)}</Text>
          </View>
          <View style={[styles.statChip, { backgroundColor: palette.elevated, borderColor: palette.border }]}>
            <Text style={[styles.caption, { color: palette.muted }]}>Debt</Text>
            <Text style={[styles.statChipValue, { color: palette.red }]}>{formatCurrency(totalCardDebt, 0)}</Text>
          </View>
        </View>
        <NetWorthChart currentValue={netWorth} isDark={isDark} />
      </Panel>

      {/* Modern Quick Action Pills */}
      <View style={styles.quickActionsRow}>
        <Pressable
          accessibilityRole="button"
          onPress={openTransactionModal}
          style={({ pressed }) => [
            styles.quickActionPill,
            {
              backgroundColor: palette.accent,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
        >
          <Ionicons name="add" size={16} color="#ffffff" />
          <Text style={[styles.quickActionText, { color: '#ffffff' }]}>Expense</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={openNewCard}
          style={({ pressed }) => [
            styles.quickActionPill,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              borderWidth: 1,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
        >
          <Ionicons name="card-outline" size={16} color={palette.accent} />
          <Text style={[styles.quickActionText, { color: palette.text }]}>Card</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={chooseReceiptSource}
          style={({ pressed }) => [
            styles.quickActionPill,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              borderWidth: 1,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
        >
          <Ionicons name="camera-outline" size={16} color={palette.green} />
          <Text style={[styles.quickActionText, { color: palette.text }]}>Receipt</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => navigateToScreen('agent')}
          style={({ pressed }) => [
            styles.quickActionPill,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              borderWidth: 1,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
        >
          <Ionicons name="sparkles-outline" size={16} color={palette.accent} />
          <Text style={[styles.quickActionText, { color: palette.text }]}>Ask AI</Text>
        </Pressable>
      </View>

      {/* Cards Section */}
      <View style={styles.section}>
        <View style={styles.rowBetween}>
          <SectionTitle title="Your cards" subtitle={`${cards.length} connected`} palette={palette} />
          <Pressable onPress={() => navigateToScreen('cards')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.link, { color: palette.accent }]}>Manage</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardCarousel}>
          {cards.map(card => renderCard(card))}
          {!cards.length ? (
            <Pressable
              onPress={openNewCard}
              style={[styles.emptyCardPrompt, { backgroundColor: palette.surface, borderColor: palette.border }]}
            >
              <Ionicons name="card-outline" size={24} color={palette.accent} />
              <Text style={[styles.bodyStrong, { color: palette.text, marginTop: 6 }]}>Add your first card</Text>
              <Text style={[styles.caption, { color: palette.muted, textAlign: 'center', marginTop: 2 }]}>Track limits & payoff progress</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>

      {/* 50 / 30 / 20 Budget Section */}
      <Panel palette={palette}>
        <View style={styles.rowBetween}>
          <SectionTitle
            title="50 / 30 / 20 budget"
            subtitle={monthlyIncome > 0 ? `Based on ${formatCurrency(monthlyIncome, 0)} monthly income` : 'Track spending targets & pacing'}
            palette={palette}
          />
          {monthlyIncome > 0 ? (
            <Pressable onPress={() => navigateToScreen('budget')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.link, { color: palette.accent }]}>Adjust</Text>
            </Pressable>
          ) : null}
        </View>

        {monthlyIncome === 0 ? (
          <View style={styles.emptyBudgetContainer}>
            <Text style={[styles.caption, { color: palette.muted, textAlign: 'center', marginBottom: 10 }]}>
              Set your monthly take-home income in the Budget tab to activate live Needs, Wants, and Savings tracking.
            </Text>
            <AppButton
              label="Set Monthly Income"
              icon="pie-chart-outline"
              onPress={() => navigateToScreen('budget')}
              palette={palette}
              compact
            />
          </View>
        ) : (
          <>
            {[
              {
                label: 'Needs (50%)',
                spent: budgetBreakdown.needsSpent,
                target: budgetBreakdown.needsTarget,
                pct: budgetBreakdown.needsPct,
                color: '#60a5fa',
              },
              {
                label: 'Wants (30%)',
                spent: budgetBreakdown.wantsSpent,
                target: budgetBreakdown.wantsTarget,
                pct: budgetBreakdown.wantsPct,
                color: '#c084fc',
              },
              {
                label: 'Savings & debt (20%)',
                spent: budgetBreakdown.savingsSpent,
                target: budgetBreakdown.savingsTarget,
                pct: budgetBreakdown.savingsPct,
                color: '#34d399',
              },
            ].map(item => (
              <View key={item.label} style={styles.budgetMeter}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.bodyStrong, { color: palette.text }]}>{item.label}</Text>
                  <Text style={[styles.caption, { color: palette.muted }]}>
                    {formatCurrency(item.spent, 0)} / {formatCurrency(item.target, 0)} ({item.pct.toFixed(0)}%)
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: palette.elevated }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${item.pct}%`,
                        backgroundColor: item.pct > 100 ? '#f59e0b' : item.color,
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
            <AppButton
              label="Open budget & activity"
              icon="pie-chart-outline"
              onPress={() => navigateToScreen('budget')}
              palette={palette}
              variant="quiet"
              compact
            />
          </>
        )}
      </Panel>

      {/* Recent Activity Section */}
      <Panel palette={palette}>
        <View style={styles.rowBetween}>
          <SectionTitle title="Recent activity" subtitle="Latest account entries" palette={palette} />
          <Pressable onPress={() => navigateToScreen('budget')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.link, { color: palette.accent }]}>See all</Text>
          </Pressable>
        </View>
        {renderTransactionList(transactions.slice(0, 5))}
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
      {!cards.length ? (
        <Panel palette={palette} style={styles.centerPanel}>
          <Ionicons name="card-outline" size={32} color={palette.accent} />
          <Text style={[styles.bodyStrong, { color: palette.text, marginTop: 8 }]}>No cards connected</Text>
          <Text style={[styles.caption, { color: palette.muted, textAlign: 'center', marginTop: 4, marginBottom: 12 }]}>Add your credit cards to optimize payoff order and minimize interest.</Text>
          <AppButton label="Add your first card" icon="add" onPress={openNewCard} palette={palette} />
        </Panel>
      ) : null}
    </>
  );

  const renderAgent = () => (
    <View style={styles.agentInner}>
      <Panel palette={palette} style={styles.contextPanel}>
        <View style={[styles.liveDot, { backgroundColor: palette.green }]} />
        <View style={styles.flex}>
          <Text style={[styles.bodyStrong, { color: palette.text }]}>FinAgent live context</Text>
          <Text style={[styles.caption, { color: palette.muted }]}>{cards.length} cards · {formatCurrency(totalCardDebt, 0)} debt · {formatCurrency(liquidCash, 0)} cash</Text>
        </View>
        <Pressable onPress={resetChat} accessibilityLabel="Reset conversation" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="refresh-outline" size={20} color={palette.muted} />
        </Pressable>
      </Panel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} style={styles.chipsContainer}>
        {[
          'Which card should I pay first?',
          'Audit my credit utilization',
          'How much should I allocate to savings?',
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
          keyboardDismissMode="on-drag"
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
          {isLoadingChat ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={palette.accent} size="small" />
              <Text style={[styles.caption, { color: palette.muted, flex: 1 }]}>FinAgent is thinking…</Text>
              <Pressable
                onPress={stopAgent}
                accessibilityLabel="Stop response"
                style={[styles.stopChip, { borderColor: palette.red, backgroundColor: palette.elevated }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="stop-circle" size={15} color={palette.red} />
                <Text style={[styles.caption, { color: palette.red, fontWeight: '800' }]}>Stop</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
        <View style={[styles.chatComposer, { borderColor: palette.border, backgroundColor: palette.input }]}>
          <Pressable
            onPress={() => setModal('compose')}
            accessibilityLabel="Pop up text box to write"
            accessibilityHint="Opens an expanded text area to comfortably write longer questions"
            style={[styles.composerIconButton, { backgroundColor: palette.elevated, borderColor: palette.border }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="expand-outline" size={17} color={palette.accent} />
          </Pressable>
          <TextInput
            value={chatInput}
            onChangeText={setChatInput}
            placeholder="Ask about debt, cash flow, or a goal..."
            placeholderTextColor={palette.muted}
            multiline
            maxLength={2000}
            editable={!isLoadingChat}
            onFocus={() => {
              setTimeout(() => {
                chatScroll.current?.scrollToEnd({ animated: true });
              }, 100);
            }}
            onSubmitEditing={() => void sendMessage()}
            style={[styles.chatInput, { color: palette.text }]}
          />
          {chatInput.length > 0 ? (
            <Pressable
              onPress={() => setChatInput('')}
              accessibilityLabel="Clear text"
              style={styles.clearButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={palette.muted} />
            </Pressable>
          ) : null}
          {isLoadingChat ? (
            <Pressable
              onPress={stopAgent}
              accessibilityLabel="Stop FinAgent response"
              style={[styles.sendButton, styles.stopButton]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="stop" size={16} color="#fff" />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => void sendMessage()}
              disabled={!chatInput.trim()}
              accessibilityLabel="Send message"
              style={[styles.sendButton, { backgroundColor: palette.accent, opacity: !chatInput.trim() ? 0.45 : 1 }]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="send-outline" size={17} color="#fff" />
            </Pressable>
          )}
        </View>
      </Panel>
      {apiError ? <Text style={[styles.caption, { color: palette.red, marginTop: 4 }]}>{apiError}</Text> : null}
    </View>
  );

  const renderBudget = () => (
    <>
      <View style={styles.welcomeBlock}>
        <Text style={[styles.pageTitle, { color: palette.text }]}>Budget & activity</Text>
        <Text style={[styles.caption, { color: palette.muted }]}>Review your cash flow and transaction ledger.</Text>
      </View>
      <Panel palette={palette}>
        <SectionTitle title="Your profile & cash flow" subtitle="Update your profile, income, and cash reserves." palette={palette} />
        <Field label="Your name" value={userName} onChangeText={setUserName} palette={palette} placeholder="Enter your name" />
        <Field label="Monthly income" value={monthlyIncome ? String(monthlyIncome) : ''} onChangeText={value => setMonthlyIncome(Number.parseFloat(value) || 0)} palette={palette} placeholder="0.00" keyboardType="decimal-pad" />
        <Field label="Liquid cash reserve" value={liquidCash ? String(liquidCash) : ''} onChangeText={value => setLiquidCash(Number.parseFloat(value) || 0)} palette={palette} placeholder="0.00" keyboardType="decimal-pad" />
        <View style={styles.rowBetween}>
          <Text style={[styles.bodyStrong, { color: palette.muted }]}>Estimated net worth</Text>
          <Text style={[styles.bodyStrong, { color: palette.green }]}>{formatCurrency(netWorth)}</Text>
        </View>
        <View style={[styles.rowBetween, styles.topGap, { paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.border }]}>
          <Text style={[styles.caption, { color: palette.muted }]}>Start over with a clean slate</Text>
          <AppButton label="Reset Data & Re-onboard" icon="trash-outline" variant="danger" onPress={handleResetData} palette={palette} compact />
        </View>
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
        {renderTransactionList(filteredTransactions)}
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
        <AppButton label="Add bill" icon="add" onPress={() => setModal('bill')} palette={palette} compact />
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
          </View>
        )) : (
          <View style={styles.centerPanel}>
            <Ionicons name="calendar-outline" size={28} color={palette.muted} />
            <Text style={[styles.bodyStrong, { color: palette.text, marginTop: 8 }]}>No upcoming bills</Text>
            <Text style={[styles.caption, { color: palette.muted, textAlign: 'center', marginTop: 4, marginBottom: 10 }]}>Track credit card dues, rent, and utility bill dates.</Text>
            <AppButton label="Add a bill" icon="add" onPress={() => setModal('bill')} palette={palette} compact />
          </View>
        )}
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
          {cards.map(card => (
            <AppButton key={card.id} label={`Charge ${card.cardName}`} icon="card-outline" onPress={() => confirmReceipt(card.cardName)} palette={palette} variant="secondary" />
          ))}
          <AppButton label="Discard receipt" onPress={() => setScannedReceipt(null)} palette={palette} variant="quiet" />
        </Panel>
      ) : null}
    </>
  );

  const renderOnboarding = () => (
    <ScrollView
      style={styles.mainScroll}
      contentContainerStyle={[styles.pageContent, { paddingBottom: 40 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { backgroundColor: 'transparent', borderBottomColor: palette.border, marginBottom: 12 }]}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>F</Text></View>
        <View style={styles.brandCopy}>
          <Text style={[styles.brandName, { color: palette.text }]}>FinAgent</Text>
          <Text style={[styles.brandTagline, { color: palette.muted }]}>Setup & Personalization</Text>
        </View>
        <Pressable onPress={() => setTheme(isDark ? 'light' : 'dark')} accessibilityLabel="Toggle theme" style={[styles.themeButton, { borderColor: palette.border }]}>
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={isDark ? '#fbbf24' : palette.accent} />
        </Pressable>
      </View>

      <View style={[styles.rowBetween, { marginBottom: 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {[
            { step: 1 as const, label: 'Identity' },
            { step: 2 as const, label: 'Cash Flow' },
            { step: 3 as const, label: 'Cards' },
          ].map(s => {
            const active = onboardStep === s.step;
            const completed = onboardStep > s.step;
            return (
              <View
                key={s.step}
                style={{
                  backgroundColor: active ? palette.accent : completed ? palette.green : palette.elevated,
                  marginRight: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 14,
                }}
              >
                <Text style={{ color: active || completed ? '#ffffff' : palette.muted, fontSize: 11, fontWeight: '700' }}>
                  {completed ? '✓ ' : ''}{s.step}. {s.label}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={[styles.caption, { color: palette.muted }]}>Step {onboardStep} of 3</Text>
      </View>

      {onboardStep === 1 ? (
        <Panel palette={palette}>
          <SectionTitle
            title="Welcome to FinAgent"
            subtitle="Your private AI personal financial strategist. We start fresh with zero preset accounts or hardcoded data."
            palette={palette}
          />
          <Field
            label="What should FinAgent call you?"
            value={onboardName}
            onChangeText={setOnboardName}
            palette={palette}
            placeholder="Enter your name"
          />
          <View style={styles.topGap}>
            <AppButton
              label="Continue to Baseline"
              icon="arrow-forward-outline"
              disabled={!onboardName.trim()}
              onPress={() => setOnboardStep(2)}
              palette={palette}
            />
          </View>
        </Panel>
      ) : null}

      {onboardStep === 2 ? (
        <Panel palette={palette}>
          <SectionTitle
            title="Establish your baseline"
            subtitle="FinAgent calculates your real-time net worth and debt payoff timelines from your take-home income and liquid cash."
            palette={palette}
          />
          <Field
            label="Monthly take-home income ($)"
            value={onboardIncome}
            onChangeText={setOnboardIncome}
            palette={palette}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
          <Field
            label="Liquid cash & checking reserve ($)"
            value={onboardCash}
            onChangeText={setOnboardCash}
            palette={palette}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
          <View style={[styles.rowBetween, styles.topGap]}>
            <AppButton
              label="Back"
              icon="arrow-back-outline"
              onPress={() => setOnboardStep(1)}
              palette={palette}
              variant="secondary"
            />
            <AppButton
              label="Continue to Cards"
              icon="arrow-forward-outline"
              onPress={() => setOnboardStep(3)}
              palette={palette}
            />
          </View>
        </Panel>
      ) : null}

      {onboardStep === 3 ? (
        <>
          <Panel palette={palette}>
            <SectionTitle
              title="Add your credit cards"
              subtitle="Add active cards to monitor APR, balances, and debt payoff strategy. You can also skip this step."
              palette={palette}
            />
            <Field
              label="Card name"
              value={onboardCardName}
              onChangeText={setOnboardCardName}
              palette={palette}
              placeholder="e.g. Chase Freedom, Apple Card"
            />
            <Text style={[styles.fieldLabel, { color: palette.muted }]}>Network</Text>
            <ChoiceChips
              values={['visa', 'mastercard', 'amex', 'discover'] as const}
              selected={onboardCardNetwork}
              onSelect={setOnboardCardNetwork}
              palette={palette}
            />
            <View style={styles.formRow}>
              <View style={styles.flex}>
                <Field
                  label="Balance ($)"
                  value={onboardCardBalance}
                  onChangeText={setOnboardCardBalance}
                  palette={palette}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.flex}>
                <Field
                  label="Credit limit ($)"
                  value={onboardCardLimit}
                  onChangeText={setOnboardCardLimit}
                  palette={palette}
                  placeholder="1000.00"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <View style={styles.formRow}>
              <View style={styles.flex}>
                <Field
                  label="APR (%)"
                  value={onboardCardApr}
                  onChangeText={setOnboardCardApr}
                  palette={palette}
                  placeholder="21.99"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.flex}>
                <Field
                  label="Last 4 digits"
                  value={onboardCardLast4}
                  onChangeText={setOnboardCardLast4}
                  palette={palette}
                  placeholder="1234"
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
            </View>
            <View style={styles.topGap}>
              <AppButton
                label="Add Card"
                icon="add-outline"
                disabled={!onboardCardName.trim()}
                onPress={handleAddOnboardCard}
                palette={palette}
                variant="secondary"
              />
            </View>
          </Panel>

          {onboardCards.length > 0 ? (
            <Panel palette={palette}>
              <SectionTitle
                title={`Added cards (${onboardCards.length})`}
                subtitle="Your connected cards for tracking and payoff prioritization."
                palette={palette}
              />
              {onboardCards.map(c => (
                <View key={c.id} style={[styles.transactionRow, { borderBottomColor: palette.border }]}>
                  <View style={[styles.transactionIcon, { backgroundColor: c.colorTheme ?? cardColors[c.network] ?? palette.accent }]}>
                    <Ionicons name="card-outline" size={18} color="#fff" />
                  </View>
                  <View style={styles.transactionInfo}>
                    <Text style={[styles.bodyStrong, { color: palette.text }]}>{c.cardName}</Text>
                    <Text style={[styles.caption, { color: palette.muted }]}>
                      Bal: {formatCurrency(c.balance)} · Limit: {formatCurrency(c.creditLimit)} · {c.apr}% APR
                    </Text>
                  </View>
                  <Pressable onPress={() => handleRemoveOnboardCard(c.id)} hitSlop={8} style={{ padding: 6 }}>
                    <Ionicons name="trash-outline" size={18} color={palette.red} />
                  </Pressable>
                </View>
              ))}
            </Panel>
          ) : (
            <Panel palette={palette}>
              <Text style={[styles.emptyText, { color: palette.muted }]}>
                No cards added yet. You can add them here or later anytime from Cards screen.
              </Text>
            </Panel>
          )}

          <View style={[styles.rowBetween, styles.topGap]}>
            <AppButton
              label="Back"
              icon="arrow-back-outline"
              onPress={() => setOnboardStep(2)}
              palette={palette}
              variant="secondary"
            />
            <AppButton
              label={onboardCards.length > 0 ? 'Finish & Launch' : 'Skip & Launch'}
              icon="checkmark-outline"
              onPress={handleCompleteOnboarding}
              palette={palette}
            />
          </View>
        </>
      ) : null}

      <Text style={[styles.caption, styles.centerText, styles.topGap, { color: palette.muted, marginTop: 24 }]}>
        FinAgent stores all financial data safely and locally on your device.
      </Text>
    </ScrollView>
  );

  const renderScreen = () => {
    switch (screen) {
      case 'home': return renderHome();
      case 'cards': return renderCards();
      case 'agent': return renderAgent();
      case 'budget': return renderBudget();
      case 'bills': return renderBills();
      case 'receipts': return renderReceipts();
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
          <Field label="Last four digits" value={cardLast4} onChangeText={setCardLast4} palette={palette} placeholder="1234" keyboardType="number-pad" maxLength={4} />
          <Field label="Current balance" value={cardBalance} onChangeText={setCardBalance} palette={palette} placeholder="0.00" keyboardType="decimal-pad" />
          <Field label="Credit limit" value={cardLimit} onChangeText={setCardLimit} palette={palette} placeholder="0.00" keyboardType="decimal-pad" />
          <View style={styles.formRow}>
            <View style={styles.flex}><Field label="APR (%)" value={cardApr} onChangeText={setCardApr} palette={palette} placeholder="0.00" keyboardType="decimal-pad" /></View>
            <View style={styles.flex}><Field label="Due date" value={cardDueDate} onChangeText={setCardDueDate} palette={palette} placeholder="e.g. 15th" /></View>
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
          <Text style={[styles.modalTitle, { color: palette.text }]}>Log transaction</Text>
          <ChoiceChips values={['expense', 'income'] as const} selected={txType} onSelect={setTxType} palette={palette} />
          <Field label="Merchant / payee" value={txTitle} onChangeText={setTxTitle} palette={palette} placeholder="e.g. Target, salary" />
          <Field label="Amount" value={txAmount} onChangeText={setTxAmount} palette={palette} placeholder="0.00" keyboardType="decimal-pad" />
          <Text style={[styles.fieldLabel, { color: palette.muted }]}>Category</Text>
          <ChoiceChips values={categories} selected={txCategory} onSelect={setTxCategory} palette={palette} />
          <Text style={[styles.fieldLabel, { color: palette.muted }]}>Account / card used</Text>
          <ChoiceChips values={['Primary Checking', ...cards.map(card => card.cardName)]} selected={txSource} onSelect={setTxSource} palette={palette} />
          <View style={styles.modalButtons}>
            <AppButton label="Cancel" onPress={() => setModal(null)} palette={palette} variant="secondary" />
            <AppButton label="Save transaction" onPress={saveTransaction} palette={palette} />
          </View>
        </>
      );
    }
    if (modal === 'bill') {
      return (
        <>
          <Text style={[styles.modalTitle, { color: palette.text }]}>Add a bill</Text>
          <Field label="Bill name" value={billName} onChangeText={setBillName} palette={palette} placeholder="Internet, insurance…" />
          <Field label="Amount" value={billAmount} onChangeText={setBillAmount} palette={palette} placeholder="0.00" keyboardType="decimal-pad" />
          <Field label="Due date" value={billDueDate} onChangeText={setBillDueDate} palette={palette} placeholder="e.g. 1st of month" />
          <View style={styles.modalButtons}>
            <AppButton label="Cancel" onPress={() => setModal(null)} palette={palette} variant="secondary" />
            <AppButton label="Save bill" onPress={saveBill} palette={palette} />
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
          <Field label="Payment amount" value={paymentAmount} onChangeText={setPaymentAmount} palette={palette} placeholder="0.00" keyboardType="decimal-pad" />
          <Text style={[styles.caption, { color: palette.muted }]}>The payment reduces card debt and available cash.</Text>
          <View style={styles.modalButtons}>
            <AppButton label="Cancel" onPress={() => setModal(null)} palette={palette} variant="secondary" />
            <AppButton label="Apply payment" onPress={savePayment} palette={palette} />
          </View>
        </>
      );
    }
    if (modal === 'compose') {
      return (
        <>
          <View style={styles.rowBetween}>
            <Text style={[styles.modalTitle, { color: palette.text, marginBottom: 4 }]}>Write to FinAgent</Text>
            <View style={[styles.liveDot, { backgroundColor: palette.green }]} />
          </View>
          <Text style={[styles.caption, { color: palette.muted, marginBottom: 10 }]}>
            Type your financial questions, compare card APRs, or calculate payoff plans.
          </Text>
          <View style={styles.modalChipsContainer}>
            {[
              'Which card should I pay first?',
              'Audit my credit utilization',
              'How much should I allocate to savings?',
              'Review my monthly budget',
              'Avalanche debt payoff strategy',
            ].map(q => (
              <Pressable
                key={q}
                onPress={() => setChatInput(q)}
                style={[styles.chip, { backgroundColor: palette.elevated, borderColor: palette.border, marginBottom: 6 }]}
              >
                <Text style={[styles.chipText, { color: palette.text }]}>{q}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={chatInput}
            onChangeText={setChatInput}
            placeholder="Type your message to FinAgent here..."
            placeholderTextColor={palette.muted}
            multiline
            autoFocus
            maxLength={2000}
            textAlignVertical="top"
            style={[
              styles.field,
              styles.modalTextArea,
              { backgroundColor: palette.input, borderColor: palette.border, color: palette.text },
            ]}
          />
          <View style={[styles.rowBetween, { marginTop: 4, marginBottom: 8 }]}>
            <Text style={[styles.caption, { color: palette.muted }]}>
              {chatInput.length} / 2000 characters
            </Text>
            {chatInput.length > 0 ? (
              <Pressable onPress={() => setChatInput('')}>
                <Text style={[styles.link, { color: palette.accent }]}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.modalButtons}>
            <AppButton label="Cancel" onPress={() => setModal(null)} palette={palette} variant="secondary" />
            {isLoadingChat ? (
              <AppButton
                label="Stop response"
                icon="stop-circle"
                onPress={() => {
                  stopAgent();
                  setModal(null);
                }}
                palette={palette}
              />
            ) : (
              <AppButton
                label="Send message"
                icon="send-outline"
                disabled={!chatInput.trim()}
                onPress={() => {
                  setModal(null);
                  void sendMessage();
                }}
                palette={palette}
              />
            )}
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

  if (!isOnboarded) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {renderOnboarding()}
        </KeyboardAvoidingView>
        {toast ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.toast,
              {
                backgroundColor: palette.accent,
                opacity: toastAnim,
                transform: [
                  {
                    translateY: toastAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [16, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Ionicons name="checkmark-circle" size={17} color="#fff" />
            <Text style={styles.toastText}>{toast}</Text>
          </Animated.View>
        ) : null}
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
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['top', 'left', 'right']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.app} {...panResponder.panHandlers}>
        <View style={[styles.header, { backgroundColor: palette.background, borderBottomColor: palette.border }]}>
          {screenHistory.length > 1 ? (
            <Pressable
              onPress={goBack}
              accessibilityLabel="Back to previous screen"
              style={[styles.backButton, { backgroundColor: palette.elevated, borderColor: palette.border }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={20} color={palette.text} />
            </Pressable>
          ) : null}
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>F</Text></View>
          <View style={styles.brandCopy}>
            <Text style={[styles.brandName, { color: palette.text }]}>FinAgent</Text>
            <Text style={[styles.brandTagline, { color: palette.muted }]}>Your money, in focus</Text>
          </View>
          <Pressable onPress={() => setTheme(isDark ? 'light' : 'dark')} accessibilityLabel="Toggle color theme" style={[styles.themeButton, { borderColor: palette.border }]}>
            <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={isDark ? '#fbbf24' : palette.accent} />
          </Pressable>
          <Pressable onPress={handleResetData} accessibilityLabel="Reset all data" style={[styles.themeButton, { borderColor: palette.border }]}>
            <Ionicons name="refresh-outline" size={19} color={palette.red} />
          </Pressable>
          <Pressable onPress={openTransactionModal} accessibilityLabel="Add transaction" style={[styles.headerAdd, { backgroundColor: palette.accent }]}>
            <Ionicons name="add" size={23} color="#fff" />
          </Pressable>
        </View>

        {storageStatus === 'failed' ? (
          <View style={[styles.storageWarning, { backgroundColor: '#7f1d1d' }]}>
            <Ionicons name="alert-circle-outline" size={17} color="#fff" />
            <Text style={styles.storageWarningText}>Storage could not be loaded or saved. Changes may not persist.</Text>
          </View>
        ) : null}

        <Animated.View style={[styles.screenAnimatedContainer, { opacity: screenFadeAnim, transform: [{ translateY: screenSlideAnim }] }]}>
          {screen === 'agent' ? (
            <KeyboardAvoidingView
              style={styles.agentScreen}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 64 : 0}
            >
              {renderAgent()}
            </KeyboardAvoidingView>
          ) : (
            <KeyboardAvoidingView
              style={styles.flex}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 64 : 0}
            >
              <ScrollView
                key={screen}
                style={styles.mainScroll}
                contentContainerStyle={styles.pageContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {renderScreen()}
              </ScrollView>
            </KeyboardAvoidingView>
          )}
        </Animated.View>

        {(!isKeyboardVisible || screen !== 'agent') ? (
          <View style={[styles.tabBar, { backgroundColor: palette.surface, borderTopColor: palette.border }]}>
            {tabs.map(tab => {
              const active = tab.id === screen;
              return (
                <Pressable
                  key={tab.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => navigateToScreen(tab.id)}
                  style={({ pressed }) => [
                    styles.tabItem,
                    {
                      opacity: pressed ? 0.7 : 1,
                      transform: [{ scale: pressed ? 0.93 : 1 }],
                    },
                  ]}
                >
                  <Ionicons name={tab.icon} size={20} color={active ? palette.accent : palette.muted} />
                  <Text style={[styles.tabLabel, { color: active ? palette.accent : palette.muted }]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            {
              backgroundColor: palette.accent,
              opacity: toastAnim,
              transform: [
                {
                  translateY: toastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [18, 0],
                  }),
                },
                {
                  scale: toastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.93, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Ionicons name="checkmark-circle" size={18} color="#fff" />
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
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
  pageContent: { padding: 16, paddingBottom: 32, gap: 16, maxWidth: 760, width: '100%', alignSelf: 'center' },
  welcomeBlock: { marginBottom: 2 },
  pageTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 6 },
  eyebrowWhite: { color: '#ffffffbb', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  netWorth: { fontSize: 32, fontWeight: '900', letterSpacing: -0.7, marginTop: 5, marginBottom: 10 },
  panel: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 12 },
  heroPanel: { padding: 18, gap: 12 },
  heroStatRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  statChip: { flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statChipValue: { fontSize: 14, fontWeight: '800' },
  quickActionsRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  quickActionPill: { flex: 1, minHeight: 40, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 6, paddingVertical: 8 },
  quickActionText: { fontSize: 12, fontWeight: '800' },
  emptyBudgetContainer: { alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8 },
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
  agentScreen: { flex: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, maxWidth: 760, width: '100%', alignSelf: 'center' },
  agentInner: { flex: 1, gap: 10 },
  chipsContainer: { maxHeight: 42, flexGrow: 0 },
  contextPanel: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  chatPanel: { flex: 1, minHeight: 0, padding: 10 },
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
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8, paddingHorizontal: 6 },
  chatComposer: { minHeight: 52, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, gap: 8 },
  composerIconButton: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  clearButton: { padding: 4 },
  chatInput: { flex: 1, minHeight: 44, maxHeight: 120, fontSize: 14, paddingVertical: 8, paddingHorizontal: 4 },
  sendButton: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
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
  toastText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0009' },
  modalKeyboard: { maxHeight: '92%' },
  modalSheet: { maxHeight: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingTop: 10, paddingHorizontal: 18, paddingBottom: 26 },
  modalHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 4, backgroundColor: '#71717a', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 14 },
  backButton: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  screenAnimatedContainer: { flex: 1 },
  stopButton: { backgroundColor: '#ef4444' },
  stopChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  modalButtons: { flexDirection: 'row', gap: 9, marginTop: 12, marginBottom: 8 },
  modalTextArea: { minHeight: 140, maxHeight: 220, paddingTop: 12, fontSize: 14 },
  modalChipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  emptyCardPrompt: { width: 200, minHeight: 170, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', padding: 16 },
  centerPanel: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24, paddingHorizontal: 16 },
});

export default FinAgentApp;
