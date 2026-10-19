import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
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
import { resetApiUrlToDefault, resolveDefaultApiUrl, setCustomApiUrl } from '../lib/apiSettings';
import { NetWorthChart } from './NetWorthChart';
import { PieChart, type CategoryItem } from './PieChart';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Screen = 'home' | 'cards' | 'agent' | 'budget' | 'bills' | 'receipts';
type CardNetwork = 'visa' | 'mastercard' | 'amex' | 'discover';
type TransactionType = 'income' | 'expense';
type ModalType = 'card' | 'transaction' | 'bill' | 'payment' | 'compose' | 'receipt' | 'receipt_source' | null;
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
    transaction_id?: string;
    remaining_balance?: number;
    card_or_account?: string;
    is_bank_alert?: boolean;
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

interface ChatMessage {
  id: string;
  text: string;
  sender: 'ai' | 'user';
  timestamp: string;
  data?: ChatMessageData;
}

interface ScannedReceipt {
  merchant: string;
  total: number;
  category: string;
  date: string;
  imageUri?: string;
}

const defaultCards: CreditCardItem[] = [];
const defaultTransactions: TransactionItem[] = [];
const defaultBills: UpcomingBill[] = [];

const categories = ['Groceries', 'Dining', 'Housing', 'Utilities', 'Transportation', 'Entertainment', 'Health', 'Income'];
const categoryColors = ['#6366F1', '#0D9488', '#B89B5E', '#64748B', '#3B82F6', '#EC4899', '#14B8A6', '#F59E0B'];
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
      background: '#09090B',
      surface: '#18181B',
      elevated: '#202024',
      border: '#27272A',
      text: '#FAFAFA',
      muted: '#A1A1AA',
      accent: '#818CF8',
      green: '#4ADE80',
      red: '#F87171',
      input: '#141416',
    }
  : {
      background: '#F8FAFC',
      surface: '#FFFFFF',
      elevated: '#F1F5F9',
      border: '#E2E8F0',
      text: '#0F172A',
      muted: '#64748B',
      accent: '#4F46E5',
      green: '#15803D',
      red: '#B91C1C',
      input: '#F8FAFC',
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
  const isDark = palette.background === '#09090B';
  const backgroundColor = variant === 'primary'
    ? palette.accent
    : variant === 'danger'
      ? palette.red
      : variant === 'secondary'
        ? palette.elevated
        : 'transparent';
  const color = variant === 'quiet'
    ? palette.accent
    : variant === 'secondary'
      ? palette.text
      : variant === 'primary'
        ? (isDark ? '#09090B' : '#FFFFFF')
        : '#FFFFFF';

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
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  palette: Palette;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
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
        autoCapitalize={autoCapitalize}
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

function ChatDataWidget({
  data,
  palette,
  isDark,
  navigateToScreen,
}: {
  data: ChatMessageData;
  palette: Palette;
  isDark: boolean;
  navigateToScreen: (screen: Screen) => void;
}) {
  if (!data) return null;

  // 1. Auto-Logged Expense Card (Bank Alert or Conversational)
  if (data.logged_expense) {
    const exp = data.logged_expense;
    const isAlert = Boolean(exp.is_bank_alert || exp.transaction_id || typeof exp.remaining_balance === 'number');

    if (isAlert) {
      return (
        <View style={[styles.chatWidgetCard, { backgroundColor: isDark ? '#14532d20' : '#f0fdf4', borderColor: isDark ? '#15803d50' : '#bbf7d0' }]}>
          <View style={styles.chatWidgetHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="notifications-outline" size={16} color={palette.green} />
              <Text style={[styles.chatWidgetHeaderTitle, { color: palette.green }]}>
                BANK ALERT RECONCILED
              </Text>
            </View>
            <View style={[styles.chatWidgetStatusBadge, { backgroundColor: `${palette.green}20`, borderColor: palette.green }]}>
              <Text style={[styles.chatWidgetStatusBadgeText, { color: palette.green }]}>SMS Auto-Parsed</Text>
            </View>
          </View>

          <View style={styles.chatWidgetHeroRow}>
            <Text style={[styles.chatWidgetHeroAmount, { color: palette.red }]}>
              -{formatCurrency(exp.amount)}
            </Text>
            <Text style={[styles.caption, { color: palette.muted }]}>
              {typeof exp.remaining_balance === 'number' ? 'Balance Reconciled' : 'Deducted from Checking'}
            </Text>
          </View>

          <View style={styles.chatWidgetDetailsRow}>
            <View style={[styles.chatWidgetDetailPill, { backgroundColor: palette.elevated, borderColor: palette.border }]}>
              <Ionicons name="storefront-outline" size={13} color={palette.muted} />
              <Text numberOfLines={1} style={[styles.caption, { color: palette.text, fontWeight: '700' }]}>{exp.merchant}</Text>
            </View>
            <View style={[styles.chatWidgetDetailPill, { backgroundColor: palette.elevated, borderColor: palette.border }]}>
              <Ionicons name="pricetag-outline" size={13} color={palette.accent} />
              <Text numberOfLines={1} style={[styles.caption, { color: palette.accent, fontWeight: '700' }]}>{exp.category}</Text>
            </View>
            {exp.card_or_account ? (
              <View style={[styles.chatWidgetDetailPill, { backgroundColor: palette.elevated, borderColor: palette.border }]}>
                <Ionicons name="card-outline" size={13} color={palette.muted} />
                <Text numberOfLines={1} style={[styles.caption, { color: palette.muted, fontWeight: '600' }]}>{exp.card_or_account}</Text>
              </View>
            ) : null}
            {exp.transaction_id ? (
              <View style={[styles.chatWidgetDetailPill, { backgroundColor: palette.elevated, borderColor: palette.border }]}>
                <Ionicons name="barcode-outline" size={13} color={palette.muted} />
                <Text numberOfLines={1} style={[styles.caption, { color: palette.muted }]}>Ref: {exp.transaction_id}</Text>
              </View>
            ) : null}
            <View style={[styles.chatWidgetDetailPill, { backgroundColor: palette.elevated, borderColor: palette.border }]}>
              <Ionicons name="calendar-outline" size={13} color={palette.muted} />
              <Text numberOfLines={1} style={[styles.caption, { color: palette.muted }]}>{exp.date || 'Today'}</Text>
            </View>
          </View>

          {typeof exp.remaining_balance === 'number' ? (
            <View style={[styles.chatWidgetBalanceRow, { borderTopColor: isDark ? '#15803d40' : '#bbf7d0' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="checkmark-done" size={15} color={palette.green} />
                <Text style={[styles.caption, { color: palette.muted }]}>Checking Reconciled to:</Text>
              </View>
              <Text style={[styles.bodyStrong, { color: palette.green }]}>{formatCurrency(exp.remaining_balance)}</Text>
            </View>
          ) : typeof data.total_balance === 'number' ? (
            <View style={[styles.chatWidgetBalanceRow, { borderTopColor: isDark ? '#15803d40' : '#bbf7d0' }]}>
              <Text style={[styles.caption, { color: palette.muted }]}>New Checking Reserve:</Text>
              <Text style={[styles.bodyStrong, { color: palette.green }]}>{formatCurrency(data.total_balance)}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => navigateToScreen('budget')}
            style={({ pressed }) => [
              styles.chatWidgetActionBtn,
              { backgroundColor: `${palette.green}20`, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Ionicons name="receipt-outline" size={14} color={palette.green} />
            <Text style={[styles.chatWidgetActionBtnText, { color: palette.green }]}>
              View in Ledger & Activity
            </Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={[styles.chatWidgetCard, { backgroundColor: isDark ? '#14532d20' : '#f0fdf4', borderColor: isDark ? '#15803d50' : '#bbf7d0' }]}>
        <View style={styles.chatWidgetHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="checkmark-circle" size={17} color={palette.green} />
            <Text style={[styles.chatWidgetHeaderTitle, { color: palette.green }]}>
              TRANSACTION AUTO-LOGGED
            </Text>
          </View>
          <View style={[styles.chatWidgetStatusBadge, { backgroundColor: `${palette.green}20`, borderColor: palette.green }]}>
            <Text style={[styles.chatWidgetStatusBadgeText, { color: palette.green }]}>Live Saved</Text>
          </View>
        </View>

        <View style={styles.chatWidgetHeroRow}>
          <Text style={[styles.chatWidgetHeroAmount, { color: palette.red }]}>
            -{formatCurrency(exp.amount)}
          </Text>
          <Text style={[styles.caption, { color: palette.muted }]}>
            Deducted from Checking
          </Text>
        </View>

        <View style={styles.chatWidgetDetailsRow}>
          <View style={[styles.chatWidgetDetailPill, { backgroundColor: palette.elevated, borderColor: palette.border }]}>
            <Ionicons name="storefront-outline" size={13} color={palette.muted} />
            <Text numberOfLines={1} style={[styles.caption, { color: palette.text, fontWeight: '700' }]}>{exp.merchant}</Text>
          </View>
          <View style={[styles.chatWidgetDetailPill, { backgroundColor: palette.elevated, borderColor: palette.border }]}>
            <Ionicons name="pricetag-outline" size={13} color={palette.accent} />
            <Text numberOfLines={1} style={[styles.caption, { color: palette.accent, fontWeight: '700' }]}>{exp.category}</Text>
          </View>
          <View style={[styles.chatWidgetDetailPill, { backgroundColor: palette.elevated, borderColor: palette.border }]}>
            <Ionicons name="calendar-outline" size={13} color={palette.muted} />
            <Text numberOfLines={1} style={[styles.caption, { color: palette.muted }]}>{exp.date || 'Today'}</Text>
          </View>
        </View>

        {typeof data.total_balance === 'number' && (
          <View style={[styles.chatWidgetBalanceRow, { borderTopColor: isDark ? '#15803d40' : '#bbf7d0' }]}>
            <Text style={[styles.caption, { color: palette.muted }]}>New Checking Reserve:</Text>
            <Text style={[styles.bodyStrong, { color: palette.green }]}>{formatCurrency(data.total_balance)}</Text>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => navigateToScreen('budget')}
          style={({ pressed }) => [
            styles.chatWidgetActionBtn,
            { backgroundColor: `${palette.green}20`, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Ionicons name="receipt-outline" size={14} color={palette.green} />
          <Text style={[styles.chatWidgetActionBtnText, { color: palette.green }]}>
            View in Ledger & Activity
          </Text>
        </Pressable>
      </View>
    );
  }

  // 2. Budget & Category Breakdown Card
  if (data.category_breakdown && data.category_breakdown.length > 0) {
    const totalSpentInBreakdown = data.category_breakdown.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const statusColor = data.budget_status === 'Over Budget' ? palette.red : (data.budget_status === 'Nearing Limit' ? '#f59e0b' : palette.green);

    return (
      <View style={[styles.chatWidgetCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.chatWidgetHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="pie-chart" size={16} color={palette.accent} />
            <Text style={[styles.chatWidgetHeaderTitle, { color: palette.text }]}>
              EXPENSE ANALYST BREAKDOWN
            </Text>
          </View>
          {data.budget_status ? (
            <View style={[styles.chatWidgetStatusBadge, { backgroundColor: `${statusColor}22`, borderColor: statusColor }]}>
              <Text style={[styles.chatWidgetStatusBadgeText, { color: statusColor }]}>
                {data.budget_status}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={{ gap: 8, marginVertical: 4 }}>
          {data.category_breakdown.map((item, idx) => {
            const pct = totalSpentInBreakdown > 0 ? (item.amount / totalSpentInBreakdown) * 100 : 0;
            const barColor = categoryColors[idx % categoryColors.length];
            return (
              <View key={`${item.category}-${idx}`} style={{ gap: 3 }}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.caption, { color: palette.text, fontWeight: '700' }]}>{item.category}</Text>
                  <Text style={[styles.caption, { color: palette.muted, fontWeight: '800' }]}>
                    {formatCurrency(item.amount)} ({pct.toFixed(0)}%)
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: palette.elevated, height: 5 }]}>
                  <View style={[styles.progressFill, { width: `${Math.min(100, pct)}%`, backgroundColor: barColor }]} />
                </View>
              </View>
            );
          })}
        </View>

        {data.safe_to_spend ? (
          <View style={[styles.chatWidgetMiniCallout, { backgroundColor: palette.elevated, borderColor: palette.border }]}>
            <Ionicons name="shield-checkmark" size={14} color={palette.green} />
            <Text style={[styles.caption, { color: palette.muted, flex: 1 }]}>
              Daily Safe-to-Spend: <Text style={{ color: palette.green, fontWeight: '800' }}>{formatCurrency(data.safe_to_spend.dailySafeToSpend)}/day</Text> ({data.safe_to_spend.daysLeft}d left)
            </Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => navigateToScreen('budget')}
          style={({ pressed }) => [
            styles.chatWidgetActionBtn,
            { backgroundColor: palette.elevated, borderColor: palette.border, borderWidth: 1, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Ionicons name="bar-chart-outline" size={14} color={palette.accent} />
          <Text style={[styles.chatWidgetActionBtnText, { color: palette.accent }]}>
            Open 50/30/20 Targets & Ledger
          </Text>
        </Pressable>
      </View>
    );
  }

  // 3. Upcoming Bills & Subscriptions Card
  if (data.upcoming_bills && data.upcoming_bills.length > 0) {
    const totalBills = data.upcoming_bills.reduce((s, b) => s + (Number(b.amount) || 0), 0);
    return (
      <View style={[styles.chatWidgetCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.chatWidgetHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="calendar" size={16} color="#f59e0b" />
            <Text style={[styles.chatWidgetHeaderTitle, { color: palette.text }]}>
              UPCOMING BILLS & SUBSCRIPTIONS
            </Text>
          </View>
          <View style={[styles.chatWidgetStatusBadge, { backgroundColor: '#f59e0b25', borderColor: '#f59e0b' }]}>
            <Text style={[styles.chatWidgetStatusBadgeText, { color: '#fbbf24' }]}>
              {data.upcoming_bills.length} Due Soon
            </Text>
          </View>
        </View>

        <View style={{ gap: 6, marginVertical: 4 }}>
          {data.upcoming_bills.map((bill, idx) => (
            <View key={`${bill.bill_name}-${idx}`} style={[styles.chatWidgetBillItem, { backgroundColor: palette.elevated, borderColor: palette.border }]}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={[styles.bodyStrong, { color: palette.text, fontSize: 13 }]}>{bill.bill_name}</Text>
                <Text style={[styles.caption, { color: palette.muted, fontSize: 11 }]}>Due {bill.due_date}</Text>
              </View>
              <Text style={[styles.bodyStrong, { color: '#f59e0b', fontSize: 14 }]}>
                {formatCurrency(bill.amount)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.rowBetween}>
          <Text style={[styles.caption, { color: palette.muted }]}>Total Upcoming Due:</Text>
          <Text style={[styles.bodyStrong, { color: palette.red, fontSize: 14 }]}>{formatCurrency(totalBills)}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => navigateToScreen('bills')}
          style={({ pressed }) => [
            styles.chatWidgetActionBtn,
            { backgroundColor: palette.elevated, borderColor: palette.border, borderWidth: 1, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Ionicons name="calendar-outline" size={14} color="#f59e0b" />
          <Text style={[styles.chatWidgetActionBtnText, { color: '#f59e0b' }]}>
            Manage & Schedule Bills
          </Text>
        </Pressable>
      </View>
    );
  }

  // 4. Portfolio Health & Investment Card
  if (data.portfolio_health) {
    const isHealthy = data.portfolio_health.toLowerCase().includes('healthy') || data.portfolio_health.toLowerCase().includes('good');
    return (
      <View style={[styles.chatWidgetCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.chatWidgetHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="trending-up" size={16} color={palette.accent} />
            <Text style={[styles.chatWidgetHeaderTitle, { color: palette.text }]}>
              PORTFOLIO HEALTH
            </Text>
          </View>
          <View style={[styles.chatWidgetStatusBadge, { backgroundColor: isHealthy ? '#10b98125' : '#f59e0b25', borderColor: isHealthy ? palette.green : '#f59e0b' }]}>
            <Text style={[styles.chatWidgetStatusBadgeText, { color: isHealthy ? palette.green : '#fbbf24' }]}>
              {data.portfolio_health}
            </Text>
          </View>
        </View>

        {typeof data.total_balance === 'number' && (
          <View style={styles.chatWidgetHeroRow}>
            <Text style={[styles.chatWidgetHeroAmount, { color: palette.text }]}>
              {formatCurrency(data.total_balance)}
            </Text>
            <Text style={[styles.caption, { color: palette.muted }]}>
              Combined Liquid Assets
            </Text>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => navigateToScreen('cards')}
          style={({ pressed }) => [
            styles.chatWidgetActionBtn,
            { backgroundColor: palette.elevated, borderColor: palette.border, borderWidth: 1, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Ionicons name="card-outline" size={14} color={palette.accent} />
          <Text style={[styles.chatWidgetActionBtnText, { color: palette.accent }]}>
            View Cards & Strategy
          </Text>
        </Pressable>
      </View>
    );
  }

  // 5. Standalone Safe-to-Spend Card
  if (data.safe_to_spend) {
    const sts = data.safe_to_spend;
    const isGood = sts.dailySafeToSpend > 0;
    return (
      <View style={[styles.chatWidgetCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.chatWidgetHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="shield-checkmark" size={16} color={isGood ? palette.green : palette.red} />
            <Text style={[styles.chatWidgetHeaderTitle, { color: palette.text }]}>
              SAFE-TO-SPEND SNAPSHOT
            </Text>
          </View>
          <View style={[styles.chatWidgetStatusBadge, { backgroundColor: isGood ? '#10b98125' : '#ef444425', borderColor: isGood ? palette.green : palette.red }]}>
            <Text style={[styles.chatWidgetStatusBadgeText, { color: isGood ? palette.green : palette.red }]}>
              {sts.statusLabel || (isGood ? 'Guilt-Free' : 'Deficit')}
            </Text>
          </View>
        </View>

        <View style={styles.chatWidgetHeroRow}>
          <Text style={[styles.chatWidgetHeroAmount, { color: isGood ? palette.green : palette.red }]}>
            {formatCurrency(sts.dailySafeToSpend)}
          </Text>
          <Text style={[styles.caption, { color: palette.muted }]}>
            / day ({sts.daysLeft} days remaining)
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => navigateToScreen('budget')}
          style={({ pressed }) => [
            styles.chatWidgetActionBtn,
            { backgroundColor: palette.elevated, borderColor: palette.border, borderWidth: 1, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Ionicons name="analytics-outline" size={14} color={palette.accent} />
          <Text style={[styles.chatWidgetActionBtnText, { color: palette.accent }]}>
            Review Monthly Budget
          </Text>
        </Pressable>
      </View>
    );
  }

  return null;
}

// Conversational & Bank Alert Expense Parser
function parseExpenseFromNaturalLanguage(text: string) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();
  const lower = clean.toLowerCase();

  const isBankAlert =
    /(?:alert|notification|authorized|approved|declined|charge of|transaction of|purchase of|avail(?:able)?\s*bal|ending bal|acct bal|balance:|ref:|txn|ref\s*#|card ending|ending in \d{4})/i.test(clean) ||
    /^(?:chase|citi|wells fargo|bofa|bank of america|amex|apple card|capital one|venmo|paypal|discover)/i.test(clean);

  const hasExpenseIntent =
    isBankAlert ||
    /(spent|paid|bought|cost|charged)\s*(\$|\d)/i.test(clean) ||
    /\$\s*\d+.*(on|at|for)/i.test(clean) ||
    /(on lunch|on dinner|for coffee|at subway|at starbucks|at walmart|for groceries)/i.test(clean);

  if (!hasExpenseIntent) return null;

  // 1. Balance
  let remaining_balance: number | undefined;
  const balanceMatch = clean.match(/(?:avail(?:able)?\s*bal(?:ance)?|total\s*bal(?:ance)?|acct\s*bal(?:ance)?|ending\s*bal(?:ance)?|bal(?:ance)?):?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i);
  if (balanceMatch && balanceMatch[1]) {
    const parsedBal = parseFloat(balanceMatch[1].replace(/,/g, ''));
    if (Number.isFinite(parsedBal)) {
      remaining_balance = parsedBal;
    }
  }

  // 2. Amount
  let amount = 0;
  const alertAmtMatch = clean.match(/(?:charge of|transaction of|purchase of|made a|payment of|spent|paid|amount:?)\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (alertAmtMatch && alertAmtMatch[1]) {
    amount = parseFloat(alertAmtMatch[1].replace(/,/g, ''));
  } else {
    const allDollarMatches = [...clean.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/gi)];
    for (const m of allDollarMatches) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (remaining_balance != null && Math.abs(val - remaining_balance) < 0.001) {
        continue;
      }
      amount = val;
      break;
    }
    if (!amount) {
      const genericNumber = clean.match(/(?:^|\s)(\d+(?:\.\d{1,2})?)(?:\s*(?:dollars?|bucks?|usd))?/i);
      if (genericNumber) {
        amount = parseFloat(genericNumber[1]);
      }
    }
  }

  if (!amount || amount <= 0) return null;

  // 3. Txn ID
  let transaction_id: string | undefined;
  const txnMatch = clean.match(/(?:ref(?:erence)?\s*(?:#|id|no\.?)?|txn(?:\s*id)?|auth(?:\s*code)?|confirmation\s*#?)\s*[:#]?\s*([A-Za-z0-9-]+)/i);
  if (txnMatch && txnMatch[1]) {
    transaction_id = txnMatch[1].trim();
  }

  // 4. Card or Account
  let card_or_account: string | undefined;
  const cardEndingMatch = clean.match(/(?:card|acct|account)\s*(?:ending(?:\s*in)?|#)?\s*[:#]?\s*(\d{4})/i);
  if (cardEndingMatch && cardEndingMatch[1]) {
    card_or_account = `Card ending ${cardEndingMatch[1].trim()}`;
  } else if (/apple card/i.test(clean)) {
    card_or_account = 'Apple Card';
  } else if (/venmo/i.test(clean)) {
    card_or_account = 'Venmo';
  } else if (/chase/i.test(clean)) {
    card_or_account = 'Chase Checking';
  } else if (/citi/i.test(clean)) {
    card_or_account = 'Citi Card';
  }

  // 5. Merchant
  let merchant = '';
  const atMatch = clean.match(/(?:at|from|to|with|paid)\s+([A-Za-z0-9\s'&.#\-]+?)(?:\s*(?:\.|\$|\s+(?:for|on|yesterday|today|with|using|in|ref|ref:|txn|bal|balance|avail|total)|$))/i);
  if (atMatch && atMatch[1]) {
    merchant = atMatch[1].trim();
  }
  if (!merchant || merchant.toLowerCase() === 'card' || merchant.toLowerCase() === 'you') {
    const commonMerchants = ['subway', 'starbucks', 'walmart', 'target', 'amazon', 'uber', 'lyft', 'shell', 'mcdonalds', 'whole foods', "trader joe's"];
    const found = commonMerchants.find(m => lower.includes(m));
    merchant = found ? (found.charAt(0).toUpperCase() + found.slice(1)) : (isBankAlert ? 'Card Transaction' : 'Expense');
  }

  merchant = merchant
    .replace(/\s*(?:#\d+|\b\d{3,}\b|\bstore\b\s*\d*|\bpos\b).*$/i, '')
    .trim();
  merchant = merchant.replace(/[.#\-,]+$/, '').trim();

  if (merchant.length > 2 && merchant === merchant.toUpperCase()) {
    merchant = merchant.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // 6. Date
  let date = 'Today';
  const dateMatch = clean.match(/(?:on|date:?)\s+([A-Za-z]{3}\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i);
  if (dateMatch && dateMatch[1]) {
    date = dateMatch[1].trim();
  }

  // 7. Category
  let category = 'General';
  const mLower = merchant.toLowerCase();
  if (/groceries|grocery|supermarket|apples|milk|produce|trader joe|whole foods/i.test(lower) || /trader joe|safeway|kroger|aldi|publix/i.test(mLower)) {
    category = 'Groceries';
  } else if (/lunch|dinner|breakfast|meal|food|subway|starbucks|mcdonalds|burger|sandwich|pizza|coffee|cafe|restaurant|dining|snack|drink/i.test(lower) || /starbucks|subway|mcdonald/i.test(mLower)) {
    category = 'Dining';
  } else if (/gas|fuel|shell|chevron|exxon|uber|lyft|taxi|subway fare|train|bus|transport|parking|toll/i.test(lower) || /shell|chevron|exxon|bp|mobil/i.test(mLower)) {
    category = 'Transportation';
  } else if (/movie|cinema|netflix|spotify|game|entertainment|concert|ticket/i.test(lower)) {
    category = 'Entertainment';
  } else if (/clothes|shoes|amazon|target|shopping|mall|electronics|store|retail/i.test(lower) || /target|walmart|amazon/i.test(mLower)) {
    category = 'Shopping';
  } else if (/bill|electric|power|water|internet|utility|utilities|wifi|phone|rent/i.test(lower)) {
    category = 'Utilities';
  } else if (/gym|pharmacy|medicine|doctor|health|dentist/i.test(lower) || /cvs|walgreens/i.test(mLower)) {
    category = 'Healthcare';
  }

  return {
    amount,
    merchant,
    category,
    date,
    transaction_id,
    remaining_balance,
    card_or_account,
    is_bank_alert: isBankAlert
  };
}

interface QuickPromptItem {
  id: string;
  label: string;
  prompt: string;
  action?: 'receipt' | 'prompt';
}

const quickPrompts: QuickPromptItem[] = [
  { id: 'bank_sms', label: '📱 Bank SMS alert', prompt: "Chase Alert: You made a $24.50 transaction at TRADER JOE'S #542 on Oct 19 with card ending 4321. Avail bal: $2,425.50" },
  { id: 'budget', label: '📊 Am I on budget?', prompt: 'Am I on budget?' },
  { id: 'receipt', label: '🧾 Scan a receipt', prompt: 'Scan a receipt', action: 'receipt' },
  { id: 'bills', label: '📅 Bills due soon', prompt: 'Which bills are due soon?' },
  { id: 'cut_spending', label: '💡 Where can I cut spending?', prompt: 'Where can I cut spending?' },
];

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
  const [serverUrl, setServerUrl] = useState(api.defaults.baseURL || resolveDefaultApiUrl());

  const updateServerUrl = (val: string) => setServerUrl(val);

  const saveServerUrl = async () => {
    try {
      await setCustomApiUrl(serverUrl);
      showToast('Backend server address saved');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save the backend server address.');
    }
  };

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
  const [receiptMerchant, setReceiptMerchant] = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [receiptTotal, setReceiptTotal] = useState('');
  const [receiptCategory, setReceiptCategory] = useState('Dining');
  const [receiptSource, setReceiptSource] = useState('Primary Checking');
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
  const [isListening, setIsListening] = useState(false);
  const speechRecognitionRef = useRef<any>(null);

  const toggleVoice = () => {
    if (isListening) {
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch {}
      }
      setIsListening(false);
      return;
    }

    if (Platform.OS === 'web') {
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRec) {
        showToast('Speech recognition is not supported in this browser. You can type directly.');
        return;
      }

      try {
        const recognition = new SpeechRec();
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
            setChatInput(transcript);
            void sendMessage(transcript);
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
        console.warn('Speech recognition start failed:', err);
        setIsListening(false);
      }
    } else {
      showToast('Dictate or type your expense statement directly.');
    }
  };

  const [isScanning, setIsScanning] = useState(false);
  const [scannedReceipt, setScannedReceipt] = useState<ScannedReceipt | null>(null);
  const [receiptImageUri, setReceiptImageUri] = useState<string | null>(null);
  const [scanStepIndex, setScanStepIndex] = useState(0);
  const scanLaserAnim = useRef(new Animated.Value(0)).current;

  const scanSteps = [
    'Aligning viewfinder…',
    'AI Vision: Detecting receipt borders & angle…',
    'Neural OCR: Extracting merchant & line items…',
    'Computing total amount & tax…',
    'Categorizing with 50/30/20 budget…',
  ];

  useEffect(() => {
    if (isScanning) {
      setScanStepIndex(0);
      const stepTimer = setInterval(() => {
        setScanStepIndex(prev => (prev + 1) % 5);
      }, 1200);

      const laserLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLaserAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scanLaserAnim, {
            toValue: 0,
            duration: 1500,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      laserLoop.start();

      return () => {
        clearInterval(stepTimer);
        laserLoop.stop();
        scanLaserAnim.setValue(0);
      };
    } else {
      scanLaserAnim.stopAnimation();
      scanLaserAnim.setValue(0);
    }
  }, [isScanning]);

  const [toast, setToast] = useState('');
  const toastAnim = useRef(new Animated.Value(0)).current;
  const [apiError, setApiError] = useState('');
  const insets = useSafeAreaInsets();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const chatScroll = useRef<ScrollViewRef>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag-to-cancel bottom sheet gesture & animation
  const modalPanY = useRef(new Animated.Value(0)).current;
  const modalScrollOffset = useRef(0);
  const isClosingRef = useRef(false);
  const previousModalRef = useRef<ModalType | null>(null);
  const closeModalRef = useRef<() => void>(() => {});

  const closeModal = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    Keyboard.dismiss();
    Animated.timing(modalPanY, {
      toValue: 650,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setModal(null);
      modalPanY.setValue(0);
      modalScrollOffset.current = 0;
      isClosingRef.current = false;
      previousModalRef.current = null;
    });
  };
  closeModalRef.current = closeModal;

  useEffect(() => {
    if (modal !== null) {
      if (previousModalRef.current === null) {
        isClosingRef.current = false;
        modalPanY.setValue(350);
        modalScrollOffset.current = 0;
        Animated.spring(modalPanY, {
          toValue: 0,
          tension: 70,
          friction: 11,
          useNativeDriver: true,
        }).start();
      } else {
        modalPanY.setValue(0);
        modalScrollOffset.current = 0;
      }
      previousModalRef.current = modal;
    } else {
      previousModalRef.current = null;
    }
  }, [modal]);

  const handlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        Keyboard.dismiss();
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          modalPanY.setValue(gestureState.dy);
        } else {
          modalPanY.setValue(gestureState.dy * 0.15);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 70 || (gestureState.dy > 25 && gestureState.vy > 0.3)) {
          closeModalRef.current();
        } else {
          Animated.spring(modalPanY, {
            toValue: 0,
            tension: 80,
            friction: 10,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(modalPanY, {
          toValue: 0,
          tension: 80,
          friction: 10,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  const modalPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return (
          modalScrollOffset.current <= 0 &&
          gestureState.dy > 10 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.5
        );
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        return (
          modalScrollOffset.current <= 0 &&
          gestureState.dy > 10 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.5
        );
      },
      onPanResponderGrant: () => {
        Keyboard.dismiss();
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          modalPanY.setValue(gestureState.dy);
        } else {
          modalPanY.setValue(gestureState.dy * 0.15);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 80 || (gestureState.dy > 25 && gestureState.vy > 0.35)) {
          closeModalRef.current();
        } else {
          Animated.spring(modalPanY, {
            toValue: 0,
            tension: 80,
            friction: 10,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(modalPanY, {
          toValue: 0,
          tension: 80,
          friction: 10,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;
  const isDark = theme === 'dark';
  const palette = useMemo(() => paletteFor(isDark), [isDark]);

  const totalCardDebt = cards.reduce((sum, card) => sum + (card.balance || 0), 0);
  const totalCreditLimit = cards.reduce((sum, card) => sum + (card.creditLimit || 0), 0);
  const utilization = totalCreditLimit > 0 ? (totalCardDebt / totalCreditLimit) * 100 : 0;
  const netWorth = liquidCash - totalCardDebt;
  const sortedCards = [...cards].sort((a, b) =>
    debtStrategy === 'Avalanche' ? b.apr - a.apr : a.balance - b.balance
  );

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
      statusDetail = 'Set your monthly income or budget to activate real-time safe-to-spend tracking.';
    } else if (dailyAmount <= 0) {
      status = 'red';
      statusLabel = 'Spending Deficit';
      statusDetail = `Past spending and unpaid bills exceed your monthly budget by ${formatCurrency(Math.abs(remainingPool))}. Pause non-essential purchases.`;
    } else if (dailyAmount < Math.min(25, dailyBaseline * 0.35)) {
      status = 'amber';
      statusLabel = 'Pacing Tight';
      statusDetail = `Daily allowance is low. Cap discretionary spending at ${formatCurrency(dailyAmount)} today to ensure remaining bills stay covered.`;
    } else {
      status = 'green';
      statusLabel = 'Guilt-Free Spending';
      statusDetail = `You have ${formatCurrency(dailyAmount)} guilt-free to spend today while remaining 100% on track for all upcoming bills.`;
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

  const safeToSpendColors = useMemo(() => {
    if (safeToSpendData.status === 'green') {
      return {
        badgeBg: isDark ? '#14532d50' : '#dcfce7',
        badgeBorder: isDark ? '#15803d60' : '#bbf7d0',
        badgeText: isDark ? '#4ade80' : '#15803d',
        heroAmount: isDark ? '#4ade80' : '#15803d',
        dot: isDark ? '#4ade80' : '#15803d',
        cardBorder: isDark ? '#15803d50' : '#bbf7d0',
        bannerBg: isDark ? '#14532d25' : '#f0fdf4',
        bannerBorder: isDark ? '#15803d40' : '#bbf7d0',
        bannerText: isDark ? '#86efac' : '#166534',
      };
    }
    if (safeToSpendData.status === 'amber') {
      return {
        badgeBg: isDark ? '#78350f50' : '#fef3c7',
        badgeBorder: isDark ? '#d9770660' : '#fde68a',
        badgeText: isDark ? '#fbbf24' : '#b45309',
        heroAmount: isDark ? '#fbbf24' : '#d97706',
        dot: '#f59e0b',
        cardBorder: isDark ? '#d9770640' : '#fde68a',
        bannerBg: isDark ? '#78350f25' : '#fffbeb',
        bannerBorder: isDark ? '#d9770640' : '#fed7aa',
        bannerText: isDark ? '#fde68a' : '#92400e',
      };
    }
    return {
      badgeBg: isDark ? '#7f1d1d50' : '#fee2e2',
      badgeBorder: isDark ? '#b91c1c60' : '#fecaca',
      badgeText: isDark ? '#f87171' : '#b91c1c',
      heroAmount: isDark ? '#f87171' : '#b91c1c',
      dot: isDark ? '#f87171' : '#b91c1c',
      cardBorder: isDark ? '#b91c1c40' : '#fecaca',
      bannerBg: isDark ? '#7f1d1d25' : '#fef2f2',
      bannerBorder: isDark ? '#b91c1c40' : '#fca5a5',
      bannerText: isDark ? '#fca5a5' : '#991b1b',
    };
  }, [safeToSpendData.status, isDark]);

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
        const customUrl = await AsyncStorage.getItem('fin_custom_api_url');
        if (customUrl) {
          setServerUrl(customUrl);
          api.defaults.baseURL = customUrl;
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
      if (!api.defaults.baseURL) {
        api.defaults.baseURL = resolveDefaultApiUrl();
      }
      const response = await api.post(
        '/api/chat',
        {
          message: text,
          userContext: {
            cards: cards.map(({ id, cardName, network, last4, balance, creditLimit, apr, dueDate, minPayment }) => ({
              id, cardName, network, last4, balance, creditLimit, apr, dueDate, minPayment,
            })),
            totalBalance: liquidCash,
            monthlyIncome,
            bills: bills.map(({ id, bill_name, due_date, amount, paid, category }) => ({
              id, bill_name, due_date, amount, paid, category,
            })),
            transactions: transactions.map(({ id, title, category, date, amount, type, source }) => ({
              id, title, category, date, amount, type, source,
            })),
          },
        },
        {
          signal: abortController.signal,
        }
      );
      const reply = response.data?.ai_reply;
      if (typeof reply !== 'string' || !reply.trim()) throw new Error('The AI service returned an empty response.');

      if (response.data?.logged_expense || response.data?.transaction) {
        const exp = response.data.logged_expense || response.data.transaction;
        const isAlert = Boolean(exp.is_bank_alert || exp.transaction_id || typeof exp.remaining_balance === 'number');
        const newTx: TransactionItem = {
          id: exp.id || `tx-${Date.now()}`,
          title: exp.merchant || exp.title || 'Expense',
          amount: Number(exp.amount) || 0,
          category: exp.category || 'General',
          date: exp.date || 'Today',
          type: 'expense',
          source: exp.card_or_account || exp.source || (isAlert ? 'Bank Alert' : 'AI Log'),
        };
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setTransactions(previous => [newTx, ...previous]);

        if (typeof exp.remaining_balance === 'number' && Number.isFinite(exp.remaining_balance) && exp.remaining_balance >= 0) {
          setLiquidCash(exp.remaining_balance);
        } else if (typeof response.data.total_balance === 'number') {
          setLiquidCash(response.data.total_balance);
        } else {
          setLiquidCash(prev => Math.max(0, prev - newTx.amount));
        }

        if (isAlert) {
          showToast(`Reconciled $${newTx.amount.toFixed(2)} at ${newTx.title}!`);
        } else {
          showToast(`Auto-logged $${newTx.amount.toFixed(2)} at ${newTx.title}!`);
        }
      }

      const structuredData: ChatMessageData = {
        intent: response.data?.intent,
        total_balance: response.data?.total_balance,
        budget_status: response.data?.budget_status,
        category_breakdown: response.data?.category_breakdown,
        upcoming_bills: response.data?.upcoming_bills,
        portfolio_health: response.data?.portfolio_health,
        logged_expense: response.data?.logged_expense || (response.data?.transaction ? {
          amount: Number(response.data.transaction.amount) || 0,
          merchant: response.data.transaction.merchant || response.data.transaction.title || 'Expense',
          category: response.data.transaction.category || 'General',
          date: response.data.transaction.date || 'Today',
          transaction_id: response.data.transaction.transaction_id,
          remaining_balance: response.data.transaction.remaining_balance,
          card_or_account: response.data.transaction.card_or_account,
          is_bank_alert: response.data.transaction.is_bank_alert,
        } : undefined),
        safe_to_spend: response.data?.safe_to_spend,
      };

      const hasStructuredContent = Boolean(
        structuredData.logged_expense ||
        (structuredData.category_breakdown && structuredData.category_breakdown.length > 0) ||
        (structuredData.upcoming_bills && structuredData.upcoming_bills.length > 0) ||
        structuredData.portfolio_health ||
        structuredData.safe_to_spend
      );

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMessages(previous => [...previous, {
        id: `ai-${Date.now()}`,
        text: reply,
        sender: 'ai',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        data: hasStructuredContent ? structuredData : undefined,
      }]);
    } catch (error: any) {
      if (abortController.signal.aborted || error?.name === 'CanceledError' || axios.isCancel(error)) {
        return;
      }
      console.error('AI chat request failed', error);

      // Local fallback expense parsing if network fails or server unreachable
      const localExp = parseExpenseFromNaturalLanguage(text);
      if (localExp && localExp.amount > 0) {
        const isAlert = Boolean(localExp.is_bank_alert || localExp.transaction_id || typeof localExp.remaining_balance === 'number');
        const newTx: TransactionItem = {
          id: `tx-${Date.now()}`,
          title: localExp.merchant,
          amount: localExp.amount,
          category: localExp.category,
          date: localExp.date || 'Today',
          type: 'expense',
          source: localExp.card_or_account || (isAlert ? 'Bank Alert' : 'AI Log'),
        };
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setTransactions(previous => [newTx, ...previous]);

        let updatedBalance = liquidCash;
        if (typeof localExp.remaining_balance === 'number' && Number.isFinite(localExp.remaining_balance) && localExp.remaining_balance >= 0) {
          updatedBalance = localExp.remaining_balance;
          setLiquidCash(updatedBalance);
        } else {
          updatedBalance = Math.max(0, liquidCash - newTx.amount);
          setLiquidCash(updatedBalance);
        }

        if (isAlert) {
          showToast(`Reconciled $${newTx.amount.toFixed(2)} at ${newTx.title}!`);
        } else {
          showToast(`Auto-logged $${newTx.amount.toFixed(2)} at ${newTx.title}!`);
        }

        const fallbackReply = isAlert
          ? (localExp.remaining_balance != null
            ? `Bank alert parsed: Logged $${newTx.amount.toFixed(2)} at ${newTx.title} under ${newTx.category}. Checking balance reconciled to $${localExp.remaining_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}!`
            : `Bank alert parsed: Logged $${newTx.amount.toFixed(2)} at ${newTx.title} under ${newTx.category}. Added to your transactions!`)
          : `Logged $${newTx.amount.toFixed(2)} at ${newTx.title} under ${newTx.category} automatically. Added to your transactions!`;

        setMessages(previous => [...previous, {
          id: `ai-${Date.now()}`,
          text: fallbackReply,
          sender: 'ai',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          data: {
            intent: 'log_expense',
            logged_expense: {
              amount: newTx.amount,
              merchant: newTx.title,
              category: newTx.category,
              date: newTx.date,
              transaction_id: localExp.transaction_id,
              remaining_balance: localExp.remaining_balance,
              card_or_account: localExp.card_or_account,
              is_bank_alert: isAlert,
            },
            total_balance: updatedBalance,
          },
        }]);
        return;
      }

      const isNetworkErr = error?.code === 'ERR_NETWORK' || error?.message?.includes('Network Error') || error?.message?.includes('Failed to fetch');
      const targetBase = api.defaults.baseURL || resolveDefaultApiUrl();
      const message = isNetworkErr
        ? `Cannot reach backend at ${targetBase}. Please make sure your server is running ("npm run dev" or "npm start").`
        : error instanceof Error ? error.message : 'Unable to connect to the AI service.';
      setApiError(message);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMessages(previous => [...previous, {
        id: `ai-${Date.now()}`,
        text: `I could not reach the AI service: ${message}`,
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

  const loadDemoReceipt = () => {
    setModal(null);
    const sample: ScannedReceipt = {
      merchant: 'Subway',
      date: new Date().toISOString().split('T')[0],
      total: 14.0,
      category: 'Dining',
    };
    setReceiptImageUri(null);
    setScannedReceipt(sample);
    setReceiptMerchant(sample.merchant);
    setReceiptTotal(sample.total.toFixed(2));
    setReceiptCategory(sample.category);
    setReceiptDate(sample.date);
    setReceiptSource(cards.length > 0 ? cards[0].cardName : 'Primary Checking');
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setModal('receipt');
    showToast('Loaded Demo Receipt ($14 Subway)');
  };

  const processReceipt = async (fromCamera: boolean) => {
    try {
      setModal(null);
      setIsScanning(true);
      navigateToScreen('receipts');
      if (fromCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera permission needed', 'Allow camera access to scan a receipt, or choose a photo from your library.');
          setIsScanning(false);
          return;
        }
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 });
      if (result.canceled) {
        setIsScanning(false);
        return;
      }
      const asset = result.assets[0];
      if (!asset?.base64) throw new Error('The selected image could not be read. Please select another image.');
      if (asset.uri) {
        setReceiptImageUri(asset.uri);
      }
      if (!api.defaults.baseURL) {
        api.defaults.baseURL = resolveDefaultApiUrl();
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
      const merchant = String(data.merchant).trim();
      const category = typeof data.category === 'string' && data.category.trim() ? data.category.trim() : 'Dining';
      const date = typeof data.date === 'string' && data.date.trim() ? data.date.trim() : new Date().toISOString().split('T')[0];

      setScannedReceipt({
        merchant,
        total,
        category,
        date,
        imageUri: asset.uri,
      });

      // Pre-fill editable fields
      setReceiptMerchant(merchant);
      setReceiptTotal(total.toFixed(2));
      setReceiptCategory(category);
      setReceiptDate(date);
      setReceiptSource(cards.length > 0 ? cards[0].cardName : 'Primary Checking');

      // Slide up bottom modal confirmation sheet
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setModal('receipt');
      showToast(`Receipt scanned: ${merchant}`);
    } catch (error) {
      const isNetworkErr = (error as any)?.code === 'ERR_NETWORK' || (error as any)?.message?.includes('Network Error');
      const targetBase = api.defaults.baseURL || resolveDefaultApiUrl();
      const message = isNetworkErr
        ? `Cannot reach backend at ${targetBase}. Please make sure your server is running ("npm run dev" or "npm start").`
        : error instanceof Error ? error.message : 'Unable to scan this receipt.';
      console.error('Receipt scan failed', error);
      Alert.alert('Receipt scan failed', message);
    } finally {
      setIsScanning(false);
    }
  };

  const chooseReceiptSource = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setModal('receipt_source');
  };

  const confirmAndAddReceiptExpense = () => {
    const rawAmt = receiptTotal.replace(/[^0-9.]/g, '');
    const amount = parseFloat(rawAmt);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid total', 'Please enter a valid expense total greater than 0.');
      return;
    }

    const merchant = receiptMerchant.trim() || 'Receipt Expense';
    const category = receiptCategory.trim() || 'General';
    const date = receiptDate.trim() || 'Today';
    const source = receiptSource || (cards.length > 0 ? cards[0].cardName : 'Primary Checking');

    const newTx: TransactionItem = {
      id: `tx-${Date.now()}`,
      title: merchant,
      category,
      date,
      amount,
      type: 'expense',
      source,
    };

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTransactions(previous => [newTx, ...previous]);

    const targetCard = cards.find(card => card.cardName === source);
    if (targetCard) {
      setCards(previous =>
        previous.map(card =>
          card.id === targetCard.id ? { ...card, balance: card.balance + amount } : card
        )
      );
    } else {
      setLiquidCash(previous => Math.max(0, previous - amount));
    }

    setScannedReceipt(null);
    setModal(null);
    navigateToScreen('home');
    showToast(`Added $${amount.toFixed(2)} at ${merchant} to expenses!`);
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

      {/* Daily Safe-to-Spend Hero Metric Card */}
      <Panel
        palette={palette}
        style={[
          styles.safeToSpendCard,
          {
            borderColor: safeToSpendColors.cardBorder,
            backgroundColor: palette.surface,
          },
        ]}
      >
        <View style={styles.safeToSpendHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="shield-checkmark" size={17} color={safeToSpendColors.dot} />
            <Text style={[styles.eyebrow, { color: palette.muted, marginBottom: 0 }]}>
              DAILY SAFE-TO-SPEND
            </Text>
          </View>
          <View
            style={[
              styles.safeToSpendBadge,
              {
                backgroundColor: safeToSpendColors.badgeBg,
                borderColor: safeToSpendColors.badgeBorder,
                borderWidth: 1,
              },
            ]}
          >
            <View style={[styles.safeToSpendDot, { backgroundColor: safeToSpendColors.dot }]} />
            <Text style={[styles.safeToSpendBadgeText, { color: safeToSpendColors.badgeText }]}>
              {safeToSpendData.statusLabel}
            </Text>
          </View>
        </View>

        {/* Hero Number */}
        <View style={styles.safeToSpendHeroRow}>
          <Text style={[styles.safeToSpendHeroAmount, { color: safeToSpendColors.heroAmount }]}>
            {safeToSpendData.dailyAmount < 0 ? '-' : ''}
            {formatCurrency(Math.abs(safeToSpendData.dailyAmount))}
          </Text>
          <View style={{ marginBottom: 4 }}>
            <Text style={[styles.safeToSpendHeroUnit, { color: palette.muted }]}>/ day</Text>
            <Text style={[styles.caption, { color: palette.muted, fontSize: 11 }]}>
              {safeToSpendData.daysLeft} days left this month
            </Text>
          </View>
        </View>

        {/* Status Message */}
        <View
          style={[
            styles.safeToSpendDetailBanner,
            {
              backgroundColor: safeToSpendColors.bannerBg,
              borderColor: safeToSpendColors.bannerBorder,
            },
          ]}
        >
          <Text style={[styles.safeToSpendDetailText, { color: safeToSpendColors.bannerText }]}>
            {safeToSpendData.statusDetail}
          </Text>
        </View>

        {/* Formula Breakdown Chips */}
        <View style={styles.safeToSpendBreakdownGrid}>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigateToScreen('budget')}
            style={({ pressed }) => [
              styles.safeToSpendBreakdownChip,
              {
                backgroundColor: palette.elevated,
                borderColor: palette.border,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Text style={[styles.safeToSpendBreakdownLabel, { color: palette.muted }]}>Budget</Text>
            <Text style={[styles.safeToSpendBreakdownValue, { color: palette.text }]}>
              {formatCurrency(safeToSpendData.monthlyBudget, 0)}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => navigateToScreen('budget')}
            style={({ pressed }) => [
              styles.safeToSpendBreakdownChip,
              {
                backgroundColor: palette.elevated,
                borderColor: palette.border,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Text style={[styles.safeToSpendBreakdownLabel, { color: palette.muted }]}>Spent</Text>
            <Text style={[styles.safeToSpendBreakdownValue, { color: palette.red }]}>
              -{formatCurrency(safeToSpendData.spentSoFar, 0)}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => navigateToScreen('bills')}
            style={({ pressed }) => [
              styles.safeToSpendBreakdownChip,
              {
                backgroundColor: palette.elevated,
                borderColor: palette.border,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Text style={[styles.safeToSpendBreakdownLabel, { color: palette.muted }]}>Bills Due</Text>
            <Text style={[styles.safeToSpendBreakdownValue, { color: '#f59e0b' }]}>
              -{formatCurrency(safeToSpendData.upcomingBills, 0)}
            </Text>
          </Pressable>

          <View
            style={[
              styles.safeToSpendBreakdownChip,
              {
                backgroundColor: palette.elevated,
                borderColor: palette.border,
              },
            ]}
          >
            <Text style={[styles.safeToSpendBreakdownLabel, { color: palette.muted }]}>Days Left</Text>
            <Text style={[styles.safeToSpendBreakdownValue, { color: palette.green }]}>
              {safeToSpendData.daysLeft}d
            </Text>
          </View>
        </View>

        {/* Traceable Formula */}
        <View style={[styles.safeToSpendFormulaRow, { borderTopColor: palette.border }]}>
          <Text style={[styles.safeToSpendFormulaText, { color: palette.muted }]} numberOfLines={1}>
            Formula: (${formatCurrency(safeToSpendData.monthlyBudget, 0)} - ${formatCurrency(safeToSpendData.spentSoFar, 0)} - ${formatCurrency(safeToSpendData.upcomingBills, 0)}) ÷ {safeToSpendData.daysLeft}d
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigateToScreen('budget')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.caption, { color: palette.accent, fontWeight: '700' }]}>
              Audit &rarr;
            </Text>
          </Pressable>
        </View>
      </Panel>

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
                <Text style={[styles.messageText, { color: message.sender === 'user' ? (isDark ? '#09090B' : '#FFFFFF') : palette.text }]}>{message.text}</Text>
                {message.data ? (
                  <ChatDataWidget
                    data={message.data}
                    palette={palette}
                    isDark={isDark}
                    navigateToScreen={navigateToScreen}
                  />
                ) : null}
                <View style={styles.messageFooter}>
                  <Text style={[styles.messageTime, { color: message.sender === 'user' ? (isDark ? '#27272A' : '#E0E7FF') : palette.muted }]}>{message.timestamp}</Text>
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

        {/* Quick-Prompt Chips Above the Keyboard / Chat Input */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickPromptChipsRow}
          style={styles.quickPromptChipsScroll}
          keyboardShouldPersistTaps="handled"
        >
          {quickPrompts.map(item => (
            <Pressable
              key={item.id}
              onPress={() => {
                if (item.action === 'receipt') {
                  chooseReceiptSource();
                } else {
                  void sendMessage(item.prompt);
                }
              }}
              disabled={isLoadingChat}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              style={({ pressed }) => [
                styles.quickPromptChip,
                {
                  backgroundColor: pressed ? palette.surface : palette.elevated,
                  borderColor: palette.border,
                  opacity: isLoadingChat ? 0.6 : 1,
                },
              ]}
            >
              <Text style={[styles.quickPromptChipText, { color: palette.text }]}>{item.label}</Text>
            </Pressable>
          ))}
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
          <Pressable
            onPress={toggleVoice}
            accessibilityLabel="Voice expense logging"
            accessibilityHint="Speak an expense like Spent $14 on lunch at Subway"
            style={[
              styles.composerIconButton,
              {
                backgroundColor: isListening ? '#ef4444' : palette.elevated,
                borderColor: isListening ? '#dc2626' : palette.border,
              },
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={17} color={isListening ? '#fff' : palette.accent} />
          </Pressable>
          <TextInput
            value={chatInput}
            onChangeText={setChatInput}
            placeholder="Type or speak (e.g. 'Spent $14 on lunch at Subway')..."
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
              <Ionicons name="send-outline" size={17} color={isDark ? '#09090B' : '#FFFFFF'} />
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
        <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.border }}>
          <Field
            label="Backend Server Address"
            value={serverUrl}
            onChangeText={updateServerUrl}
            palette={palette}
            placeholder="http://localhost:3000"
            autoCapitalize="none"
          />
          <View style={[styles.rowBetween, { marginTop: -4, marginBottom: 8 }]}>
            <Text style={[styles.caption, { color: palette.muted }]}>Auto: {resolveDefaultApiUrl()}</Text>
            <AppButton
              label="Save URL"
              variant="quiet"
              compact
              palette={palette}
              onPress={saveServerUrl}
            />
            <AppButton
              label="Reset URL"
              variant="quiet"
              compact
              palette={palette}
              onPress={async () => {
                try {
                  const def = await resetApiUrlToDefault();
                  setServerUrl(def);
                  showToast('Server URL reset to ' + def);
                } catch (error) {
                  showToast(error instanceof Error ? error.message : 'Could not reset the backend server address.');
                }
              }}
            />
          </View>
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
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={[styles.eyebrow, { color: palette.accent }]}>AI OCR VISION</Text>
            <Text style={[styles.pageTitle, { color: palette.text }]}>Receipt Scanner</Text>
          </View>
          <View style={[styles.scannerHeaderBadge, { backgroundColor: isDark ? `${palette.accent}25` : '#e0e7ff', borderColor: palette.accent }]}>
            <Ionicons name="sparkles" size={12} color={palette.accent} />
            <Text style={[styles.scannerHeaderBadgeText, { color: palette.accent }]}>Neural OCR</Text>
          </View>
        </View>
        <Text style={[styles.caption, { color: palette.muted, marginTop: 4 }]}>
          Scan receipts to auto-extract merchant, total, date & 50/30/20 category with edge detection.
        </Text>
      </View>

      {/* High-tech Viewfinder HUD */}
      <View style={[styles.viewfinderCard, { borderColor: palette.border, backgroundColor: isDark ? '#0b0f19' : '#1e293b' }]}>
        {/* Corner Reticles */}
        <View style={[styles.cornerReticle, styles.cornerReticleTL, { borderColor: palette.accent }]} />
        <View style={[styles.cornerReticle, styles.cornerReticleTR, { borderColor: palette.accent }]} />
        <View style={[styles.cornerReticle, styles.cornerReticleBL, { borderColor: palette.accent }]} />
        <View style={[styles.cornerReticle, styles.cornerReticleBR, { borderColor: palette.accent }]} />

        {/* Viewfinder Content Area */}
        {receiptImageUri ? (
          <View style={styles.viewfinderImageWrap}>
            <Image source={{ uri: receiptImageUri }} style={styles.viewfinderImg} resizeMode="contain" />
            <View style={styles.viewfinderImgBadge}>
              <Ionicons name="image-outline" size={12} color="#34d399" />
              <Text style={styles.viewfinderImgBadgeText}>PREVIEW CAPTURED</Text>
            </View>
          </View>
        ) : (
          <View style={styles.viewfinderEmptyContent}>
            <View style={[styles.viewfinderIconCircle, { backgroundColor: isDark ? '#1e1b4b70' : '#312e8170' }]}>
              <Ionicons name="scan-outline" size={38} color={palette.accent} />
            </View>
            <Text style={styles.viewfinderTitle}>Position receipt within frame</Text>
            <Text style={styles.viewfinderSubtitle}>Ensure good lighting & keep receipt flat</Text>
          </View>
        )}

        {/* Animated Sweeping Laser Scanner Line */}
        {isScanning ? (
          <>
            <Animated.View
              style={[
                styles.laserBeam,
                {
                  transform: [
                    {
                      translateY: scanLaserAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [12, 185],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.laserCoreLine} />
              <View style={styles.laserGlowAura} />
            </Animated.View>

            <View style={styles.scannerLiveTicker}>
              <ActivityIndicator size="small" color="#34d399" style={{ marginRight: 6 }} />
              <Text style={styles.scannerLiveTickerText}>
                {scanSteps[scanStepIndex] || 'AI Vision: Processing receipt…'}
              </Text>
            </View>
          </>
        ) : null}
      </View>

      {/* Direct Quick Action Tiles */}
      <View style={styles.scannerActionGrid}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void processReceipt(true)}
          disabled={isScanning}
          style={({ pressed }) => [
            styles.scannerActionCard,
            { backgroundColor: palette.surface, borderColor: palette.border, opacity: isScanning ? 0.6 : pressed ? 0.75 : 1 },
          ]}
        >
          <View style={[styles.scannerActionIconWrap, { backgroundColor: `${palette.accent}20` }]}>
            <Ionicons name="camera" size={20} color={palette.accent} />
          </View>
          <Text style={[styles.scannerActionTitle, { color: palette.text }]}>Snap Photo</Text>
          <Text style={[styles.scannerActionSub, { color: palette.muted }]}>Open Camera</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => void processReceipt(false)}
          disabled={isScanning}
          style={({ pressed }) => [
            styles.scannerActionCard,
            { backgroundColor: palette.surface, borderColor: palette.border, opacity: isScanning ? 0.6 : pressed ? 0.75 : 1 },
          ]}
        >
          <View style={[styles.scannerActionIconWrap, { backgroundColor: '#3b82f620' }]}>
            <Ionicons name="images" size={20} color="#3b82f6" />
          </View>
          <Text style={[styles.scannerActionTitle, { color: palette.text }]}>Gallery</Text>
          <Text style={[styles.scannerActionSub, { color: palette.muted }]}>Choose Image</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={loadDemoReceipt}
          disabled={isScanning}
          style={({ pressed }) => [
            styles.scannerActionCard,
            { backgroundColor: palette.surface, borderColor: palette.border, opacity: isScanning ? 0.6 : pressed ? 0.75 : 1 },
          ]}
        >
          <View style={[styles.scannerActionIconWrap, { backgroundColor: '#10b98120' }]}>
            <Ionicons name="flash" size={20} color={palette.green} />
          </View>
          <Text style={[styles.scannerActionTitle, { color: palette.text }]}>Demo Receipt</Text>
          <Text style={[styles.scannerActionSub, { color: palette.muted }]}>$14 Subway</Text>
        </Pressable>
      </View>

      {/* Scanned Receipt Voucher Ticket */}
      {scannedReceipt ? (
        <View style={[styles.ticketVoucherCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.ticketHeaderRow}>
            <View style={[styles.ticketStoreBadge, { backgroundColor: '#10b98120', borderColor: palette.green }]}>
              <Ionicons name="storefront" size={18} color={palette.green} />
            </View>
            <View style={styles.flex}>
              <View style={styles.rowBetween}>
                <Text numberOfLines={1} style={[styles.ticketMerchantName, { color: palette.text }]}>
                  {receiptMerchant || scannedReceipt.merchant}
                </Text>
                <View style={[styles.ticketStatusPill, { backgroundColor: '#10b98120', borderColor: palette.green }]}>
                  <Ionicons name="checkmark-circle" size={11} color={palette.green} />
                  <Text style={[styles.ticketStatusPillText, { color: palette.green }]}>OCR VERIFIED</Text>
                </View>
              </View>
              <Text style={[styles.caption, { color: palette.muted }]}>
                {receiptDate || scannedReceipt.date} · {receiptSource}
              </Text>
            </View>
          </View>

          <View style={styles.ticketAmountRow}>
            <View>
              <Text style={[styles.caption, { color: palette.muted }]}>TOTAL DETECTED</Text>
              <Text style={[styles.ticketAmountText, { color: palette.green }]}>
                {formatCurrency(parseFloat(receiptTotal) || scannedReceipt.total)}
              </Text>
            </View>
            <View style={[styles.ticketCategoryPill, { backgroundColor: palette.elevated, borderColor: palette.border }]}>
              <Ionicons name="pricetag-outline" size={13} color={palette.accent} />
              <Text style={[styles.caption, { color: palette.accent, fontWeight: '700' }]}>
                {receiptCategory || scannedReceipt.category}
              </Text>
            </View>
          </View>

          {/* Barcode & Reference */}
          <View style={styles.ticketBarcodeSection}>
            <View style={[styles.ticketDashedDivider, { borderColor: palette.border }]} />
            <View style={styles.ticketBarcodeRow}>
              <Text style={[styles.ticketBarcodeBars, { color: palette.muted }]}>
                ||| | || |||| | ||| || |||| | ||| || |
              </Text>
              <Text style={[styles.ticketBarcodeCode, { color: palette.muted }]}>
                REF: OCR-{(receiptMerchant || 'RC').slice(0, 3).toUpperCase()}-{(receiptTotal || '0').replace('.', '')}
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.ticketActionsContainer}>
            <AppButton
              label="Confirm & Add to Ledger"
              icon="checkmark-circle-outline"
              onPress={confirmAndAddReceiptExpense}
              palette={palette}
            />
            <AppButton
              label="Review & Edit in Sheet"
              icon="create-outline"
              onPress={() => setModal('receipt')}
              palette={palette}
              variant="secondary"
            />
            <AppButton
              label="Discard Receipt"
              onPress={() => {
                setScannedReceipt(null);
                setReceiptImageUri(null);
              }}
              palette={palette}
              variant="quiet"
            />
          </View>
        </View>
      ) : null}

      {/* Pro Tips Panel */}
      <Panel palette={palette} style={styles.receiptTipsPanel}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Ionicons name="bulb-outline" size={18} color="#f59e0b" />
          <Text style={[styles.bodyStrong, { color: palette.text }]}>Tips for Best OCR Accuracy</Text>
        </View>
        <View style={styles.receiptTipItem}>
          <Ionicons name="checkmark-outline" size={14} color={palette.green} />
          <Text style={[styles.caption, { color: palette.muted, flex: 1 }]}>
            Place receipt flat on a dark or high-contrast surface.
          </Text>
        </View>
        <View style={styles.receiptTipItem}>
          <Ionicons name="checkmark-outline" size={14} color={palette.green} />
          <Text style={[styles.caption, { color: palette.muted, flex: 1 }]}>
            Ensure the merchant name, date, and total line are clearly visible.
          </Text>
        </View>
        <View style={styles.receiptTipItem}>
          <Ionicons name="shield-checkmark-outline" size={14} color={palette.accent} />
          <Text style={[styles.caption, { color: palette.muted, flex: 1 }]}>
            Receipts are parsed in real-time via AI vision without permanent cloud storage.
          </Text>
        </View>
      </Panel>
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
        <View style={[styles.brandMark, { backgroundColor: palette.accent }]}><Text style={[styles.brandMarkText, { color: isDark ? '#09090B' : '#FFFFFF' }]}>F</Text></View>
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
            <AppButton label="Cancel" onPress={closeModal} palette={palette} variant="secondary" />
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
            <AppButton label="Cancel" onPress={closeModal} palette={palette} variant="secondary" />
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
            <AppButton label="Cancel" onPress={closeModal} palette={palette} variant="secondary" />
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
            <AppButton label="Cancel" onPress={closeModal} palette={palette} variant="secondary" />
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

          {/* Quick-Prompt Chips inside Modal Compose */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickPromptChipsRow}
            style={[styles.quickPromptChipsScroll, { marginTop: 2, marginBottom: 10 }]}
            keyboardShouldPersistTaps="handled"
          >
            {quickPrompts.map(item => (
              <Pressable
                key={item.id}
                onPress={() => {
                  if (item.action === 'receipt') {
                    setModal(null);
                    chooseReceiptSource();
                  } else {
                    setChatInput(item.prompt);
                  }
                }}
                disabled={isLoadingChat}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                style={({ pressed }) => [
                  styles.quickPromptChip,
                  {
                    backgroundColor: pressed ? palette.surface : palette.elevated,
                    borderColor: palette.border,
                    opacity: isLoadingChat ? 0.6 : 1,
                  },
                ]}
              >
                <Text style={[styles.quickPromptChipText, { color: palette.text }]}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.modalButtons}>
            <AppButton label="Cancel" onPress={closeModal} palette={palette} variant="secondary" />
            {isLoadingChat ? (
              <AppButton
                label="Stop response"
                icon="stop-circle"
                onPress={() => {
                  stopAgent();
                  closeModal();
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
    if (modal === 'receipt_source') {
      return (
        <>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={[styles.eyebrow, { color: palette.accent }]}>AI OCR CAPTURE</Text>
              <Text style={[styles.modalTitle, { color: palette.text, marginBottom: 2 }]}>Scan Receipt</Text>
              <Text style={[styles.caption, { color: palette.muted }]}>
                Choose a source to extract receipt items and amounts automatically.
              </Text>
            </View>
            <Pressable
              onPress={closeModal}
              accessibilityLabel="Close receipt source sheet"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle-outline" size={24} color={palette.muted} />
            </Pressable>
          </View>

          <View style={styles.sourceCardsContainer}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void processReceipt(true)}
              style={({ pressed }) => [
                styles.sourceCard,
                { backgroundColor: palette.elevated, borderColor: palette.border, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <View style={[styles.sourceIconWrap, { backgroundColor: `${palette.accent}20` }]}>
                <Ionicons name="camera" size={24} color={palette.accent} />
              </View>
              <View style={styles.flex}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.bodyStrong, { color: palette.text }]}>Snap with Camera</Text>
                  <View style={[styles.sourceBadge, { backgroundColor: '#10b98120', borderColor: palette.green }]}>
                    <Text style={[styles.sourceBadgeText, { color: palette.green }]}>LIVE OCR</Text>
                  </View>
                </View>
                <Text style={[styles.caption, { color: palette.muted, marginTop: 2 }]}>
                  Point at your physical paper receipt in real-time
                </Text>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => void processReceipt(false)}
              style={({ pressed }) => [
                styles.sourceCard,
                { backgroundColor: palette.elevated, borderColor: palette.border, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <View style={[styles.sourceIconWrap, { backgroundColor: '#3b82f620' }]}>
                <Ionicons name="images" size={24} color="#3b82f6" />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.bodyStrong, { color: palette.text }]}>Choose from Gallery</Text>
                <Text style={[styles.caption, { color: palette.muted, marginTop: 2 }]}>
                  Upload a photo, screenshot, or digital receipt
                </Text>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={loadDemoReceipt}
              style={({ pressed }) => [
                styles.sourceCard,
                { backgroundColor: palette.elevated, borderColor: palette.border, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <View style={[styles.sourceIconWrap, { backgroundColor: '#10b98120' }]}>
                <Ionicons name="flash" size={24} color={palette.green} />
              </View>
              <View style={styles.flex}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.bodyStrong, { color: palette.text }]}>Try Demo Receipt</Text>
                  <View style={[styles.sourceBadge, { backgroundColor: '#f59e0b20', borderColor: '#f59e0b' }]}>
                    <Text style={[styles.sourceBadgeText, { color: '#f59e0b' }]}>$14 SUBWAY</Text>
                  </View>
                </View>
                <Text style={[styles.caption, { color: palette.muted, marginTop: 2 }]}>
                  Instant test with sample dining expense
                </Text>
              </View>
            </Pressable>
          </View>

          <View style={{ marginTop: 12, marginBottom: 8 }}>
            <AppButton
              label="Cancel"
              onPress={closeModal}
              palette={palette}
              variant="quiet"
            />
          </View>
        </>
      );
    }
    if (modal === 'receipt') {
      return (
        <>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={[styles.eyebrow, { color: palette.accent }]}>RECEIPT OCR CONFIRMATION</Text>
              <Text style={[styles.modalTitle, { color: palette.text, marginBottom: 2 }]}>Review & Confirm Receipt</Text>
              <Text style={[styles.caption, { color: palette.muted }]}>
                Pre-filled from OCR scan. Tap any field to edit before adding.
              </Text>
            </View>
            <Pressable
              onPress={closeModal}
              accessibilityLabel="Close confirmation sheet"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle-outline" size={24} color={palette.muted} />
            </Pressable>
          </View>

          {receiptImageUri ? (
            <View style={[styles.receiptReviewThumbnail, { backgroundColor: palette.elevated, borderColor: palette.border }]}>
              <Image source={{ uri: receiptImageUri }} style={styles.receiptReviewImg} resizeMode="cover" />
              <View style={styles.receiptReviewBadge}>
                <Ionicons name="scan-outline" size={12} color="#10b981" />
                <Text style={styles.receiptReviewBadgeText}>OCR Source Captured</Text>
              </View>
            </View>
          ) : null}

          <Field
            label="Merchant / Business"
            value={receiptMerchant}
            onChangeText={setReceiptMerchant}
            palette={palette}
            placeholder="e.g. Subway, Target"
          />

          <View style={styles.formRow}>
            <View style={styles.flex}>
              <Field
                label="Total Amount ($)"
                value={receiptTotal}
                onChangeText={setReceiptTotal}
                palette={palette}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.flex}>
              <Field
                label="Date"
                value={receiptDate}
                onChangeText={setReceiptDate}
                palette={palette}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>

          <Field
            label="Category"
            value={receiptCategory}
            onChangeText={setReceiptCategory}
            palette={palette}
            placeholder="e.g. Dining, Groceries"
          />

          <Text style={[styles.fieldLabel, { color: palette.muted, marginTop: 4 }]}>Quick Category</Text>
          <ChoiceChips
            values={['Dining', 'Groceries', 'Shopping', 'Transportation', 'Utilities', 'Entertainment', 'Health', 'Other'] as const}
            selected={receiptCategory}
            onSelect={setReceiptCategory}
            palette={palette}
          />

          <Text style={[styles.fieldLabel, { color: palette.muted, marginTop: 8 }]}>Payment Account / Card</Text>
          <ChoiceChips
            values={['Primary Checking', ...cards.map(c => c.cardName)]}
            selected={receiptSource}
            onSelect={setReceiptSource}
            palette={palette}
          />

          <View style={{ marginTop: 20, marginBottom: 8, gap: 8 }}>
            <AppButton
              label="Confirm & Add to Expenses"
              icon="checkmark-circle-outline"
              onPress={confirmAndAddReceiptExpense}
              palette={palette}
            />
            <AppButton
              label="Cancel"
              onPress={closeModal}
              palette={palette}
              variant="quiet"
            />
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
          <View style={[styles.brandMark, { backgroundColor: palette.accent }]}><Text style={[styles.brandMarkText, { color: isDark ? '#09090B' : '#FFFFFF' }]}>F</Text></View>
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
            <Ionicons name="add" size={23} color={isDark ? '#09090B' : '#FFFFFF'} />
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
          <Ionicons name="checkmark-circle" size={18} color={isDark ? '#09090B' : '#FFFFFF'} />
          <Text style={[styles.toastText, { color: isDark ? '#09090B' : '#FFFFFF' }]}>{toast}</Text>
        </Animated.View>
      ) : null}

      <Modal
        visible={modal !== null}
        transparent
        animationType="fade"
        statusBarTranslucent={true}
        onRequestClose={closeModal}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeModal}
            accessibilityRole="button"
            accessibilityLabel="Close sheet backdrop"
          />
          <KeyboardAvoidingView
            pointerEvents="box-none"
            style={styles.modalKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Animated.View
              {...modalPanResponder.panHandlers}
              style={[
                styles.modalSheet,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                  transform: [{ translateY: modalPanY }],
                },
              ]}
            >
              <View {...handlePanResponder.panHandlers} style={styles.modalHandleArea}>
                <View style={[styles.modalHandle, { backgroundColor: isDark ? '#3F3F46' : '#CBD5E1' }]} />
              </View>
              <ScrollView
                bounces={false}
                overScrollMode="never"
                scrollEventThrottle={16}
                onScroll={(e) => {
                  modalScrollOffset.current = e.nativeEvent.contentOffset.y;
                }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {renderModalContent()}
              </ScrollView>
            </Animated.View>
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
  brandMark: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' },
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
  safeToSpendCard: {
    borderRadius: 22,
    borderWidth: 1.5,
    padding: 18,
    gap: 12,
  },
  safeToSpendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  safeToSpendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 5,
  },
  safeToSpendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  safeToSpendBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  safeToSpendHeroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 2,
  },
  safeToSpendHeroAmount: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1,
  },
  safeToSpendHeroUnit: {
    fontSize: 14,
    fontWeight: '700',
  },
  safeToSpendDetailBanner: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
  },
  safeToSpendDetailText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  safeToSpendBreakdownGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  safeToSpendBreakdownChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  safeToSpendBreakdownLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  safeToSpendBreakdownValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  safeToSpendFormulaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  safeToSpendFormulaText: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '600',
    flex: 1,
    marginRight: 6,
  },
  heroPanel: { padding: 18, gap: 12 },
  heroStatRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  statChip: { flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statChipValue: { fontSize: 14, fontWeight: '800' },
  quickActionsRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  quickActionPill: { flex: 1, minHeight: 40, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 6, paddingVertical: 8 },
  quickActionText: { fontSize: 12, fontWeight: '800' },
  emptyBudgetContainer: { alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8 },
  metricRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  metric: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#818CF815' },
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
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(9, 9, 11, 0.78)' },
  modalKeyboard: { maxHeight: '92%', width: '100%' },
  modalSheet: { maxHeight: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingTop: 4, paddingHorizontal: 18, paddingBottom: 26, elevation: 24 },
  modalHandleArea: { width: '100%', alignItems: 'center', justifyContent: 'center', paddingTop: 6, paddingBottom: 14 },
  modalHandle: { width: 44, height: 5, borderRadius: 3 },
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
  quickPromptChipsScroll: { maxHeight: 42, flexGrow: 0, marginTop: 4, marginBottom: 8 },
  quickPromptChipsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 2, alignItems: 'center' },
  quickPromptChip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  quickPromptChipText: { fontSize: 12, fontWeight: '700' },
  chatWidgetCard: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  chatWidgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  chatWidgetHeaderTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  chatWidgetStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  chatWidgetStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  chatWidgetHeroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginVertical: 2,
  },
  chatWidgetHeroAmount: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  chatWidgetDetailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chatWidgetDetailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  chatWidgetBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chatWidgetBillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  chatWidgetMiniCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  chatWidgetActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginTop: 2,
  },
  chatWidgetActionBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  scannerHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  scannerHeaderBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  viewfinderCard: {
    height: 220,
    width: '100%',
    borderRadius: 22,
    borderWidth: 1.5,
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  cornerReticle: {
    position: 'absolute',
    width: 26,
    height: 26,
    zIndex: 10,
  },
  cornerReticleTL: {
    top: 14,
    left: 14,
    borderTopWidth: 3.5,
    borderLeftWidth: 3.5,
    borderTopLeftRadius: 8,
  },
  cornerReticleTR: {
    top: 14,
    right: 14,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
    borderTopRightRadius: 8,
  },
  cornerReticleBL: {
    bottom: 14,
    left: 14,
    borderBottomWidth: 3.5,
    borderLeftWidth: 3.5,
    borderBottomLeftRadius: 8,
  },
  cornerReticleBR: {
    bottom: 14,
    right: 14,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
    borderBottomRightRadius: 8,
  },
  viewfinderEmptyContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 20,
  },
  viewfinderIconCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  viewfinderTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  viewfinderSubtitle: {
    color: '#94a3b8',
    fontSize: 11.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  viewfinderImageWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderImg: {
    width: '90%',
    height: '85%',
    borderRadius: 12,
  },
  viewfinderImgBadge: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#052e16ee',
    borderColor: '#34d399',
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
  },
  viewfinderImgBadgeText: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  laserBeam: {
    position: 'absolute',
    left: 18,
    right: 18,
    zIndex: 15,
  },
  laserCoreLine: {
    height: 2.5,
    backgroundColor: '#34d399',
    borderRadius: 2,
    shadowColor: '#10b981',
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 8,
  },
  laserGlowAura: {
    height: 14,
    backgroundColor: '#10b98125',
    marginTop: -2,
    borderRadius: 6,
  },
  scannerLiveTicker: {
    position: 'absolute',
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172aee',
    borderColor: '#34d39960',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    zIndex: 20,
    elevation: 6,
  },
  scannerLiveTickerText: {
    color: '#f8fafc',
    fontSize: 11.5,
    fontWeight: '700',
  },
  scannerActionGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  scannerActionCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    elevation: 2,
  },
  scannerActionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  scannerActionTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  scannerActionSub: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  ticketVoucherCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 16,
    gap: 12,
    elevation: 3,
  },
  ticketHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ticketStoreBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketMerchantName: {
    fontSize: 17,
    fontWeight: '800',
  },
  ticketStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 10,
    borderWidth: 1,
  },
  ticketStatusPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  ticketAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  ticketAmountText: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  ticketCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  ticketBarcodeSection: {
    gap: 8,
    paddingVertical: 2,
  },
  ticketDashedDivider: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    width: '100%',
    marginVertical: 4,
  },
  ticketBarcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ticketBarcodeBars: {
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
  },
  ticketBarcodeCode: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
  },
  ticketActionsContainer: {
    gap: 8,
    marginTop: 4,
  },
  receiptTipsPanel: {
    gap: 8,
  },
  receiptTipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sourceCardsContainer: {
    gap: 10,
    marginVertical: 12,
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    elevation: 2,
  },
  sourceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  sourceBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  receiptReviewThumbnail: {
    height: 140,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  receiptReviewImg: {
    width: '100%',
    height: '100%',
  },
  receiptReviewBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0f172acc',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  receiptReviewBadgeText: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '700',
  },
});

export default FinAgentApp;
