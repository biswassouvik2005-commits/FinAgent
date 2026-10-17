import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface Transaction {
  id: string;
  title: string;
  category: string;
  date: string;
  amount: number;
  type: 'expense' | 'income';
  icon: keyof typeof Ionicons.glyphMap;
}

export interface SpendingCategory {
  id: string;
  name: string;
  amount: number;
  percentage: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export interface SummaryStats {
  totalBalance: number;
  monthlyGrowthPercent: number;
  monthlyIncome: number;
  monthlyExpenses: number;
}

const defaultStats: SummaryStats = {
  totalBalance: 24850.4,
  monthlyGrowthPercent: 12.4,
  monthlyIncome: 6200.0,
  monthlyExpenses: 2500.0,
};

const spendingCategories: SpendingCategory[] = [
  {
    id: 'cat-1',
    name: 'Rent & Utilities',
    amount: 1250.0,
    percentage: 50,
    color: '#0A84FF',
    icon: 'home-outline',
  },
  {
    id: 'cat-2',
    name: 'Food & Dining',
    amount: 850.0,
    percentage: 34,
    color: '#FF9F0A',
    icon: 'restaurant-outline',
  },
  {
    id: 'cat-3',
    name: 'Entertainment',
    amount: 400.0,
    percentage: 16,
    color: '#BF5AF2',
    icon: 'film-outline',
  },
];

const mockTransactions: Transaction[] = [
  {
    id: 'tx-1',
    title: 'Salary Deposit',
    category: 'Income',
    date: 'Today, 9:00 AM',
    amount: 3200.0,
    type: 'income',
    icon: 'arrow-down-circle-outline',
  },
  {
    id: 'tx-2',
    title: 'Whole Foods Market',
    category: 'Food & Dining',
    date: 'Yesterday, 4:32 PM',
    amount: 86.45,
    type: 'expense',
    icon: 'cart-outline',
  },
  {
    id: 'tx-3',
    title: 'Uber Ride',
    category: 'Transportation',
    date: 'Oct 14, 8:15 PM',
    amount: 24.5,
    type: 'expense',
    icon: 'car-outline',
  },
  {
    id: 'tx-4',
    title: 'Netflix Subscription',
    category: 'Entertainment',
    date: 'Oct 12, 11:00 AM',
    amount: 19.99,
    type: 'expense',
    icon: 'tv-outline',
  },
  {
    id: 'tx-5',
    title: 'Freelance Design',
    category: 'Income',
    date: 'Oct 10, 2:45 PM',
    amount: 850.0,
    type: 'income',
    icon: 'cash-outline',
  },
];

export const DashboardScreen: React.FC = () => {
  const formatCurrency = (val: number) => {
    return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Header / Top Bar */}
      <View style={styles.headerRow}>
        <View style={styles.userInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>S</Text>
          </View>
          <View style={styles.greetingContainer}>
            <Text style={styles.greetingSub}>Welcome back,</Text>
            <Text style={styles.greetingName}>Souvik</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.bellButton}
          activeOpacity={0.7}
          accessibilityLabel="Notifications"
        >
          <Ionicons name="notifications-outline" size={22} color="#FFFFFF" />
          <View style={styles.notificationDot} />
        </TouchableOpacity>
      </View>

      {/* 2. Net Worth / Total Balance Card */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceHeader}>
          <Text style={styles.balanceLabel}>TOTAL BALANCE</Text>
          <View style={styles.trendBadge}>
            <Ionicons name="trending-up" size={14} color="#30D158" />
            <Text style={styles.trendText}>+{defaultStats.monthlyGrowthPercent}% this month</Text>
          </View>
        </View>

        <Text style={styles.balanceAmount}>{formatCurrency(defaultStats.totalBalance)}</Text>

        <View style={styles.quickActionsContainer}>
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.8}
            accessibilityLabel="Send money"
          >
            <View style={[styles.actionIconCircle, { backgroundColor: '#0A84FF' }]}>
              <Ionicons name="paper-plane" size={18} color="#FFFFFF" />
            </View>
            <Text style={styles.actionLabel}>Send</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.8}
            accessibilityLabel="Add expense"
          >
            <View style={[styles.actionIconCircle, { backgroundColor: '#2A2A2A' }]}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.actionLabel}>Add Expense</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.8}
            accessibilityLabel="Scan receipt"
          >
            <View style={[styles.actionIconCircle, { backgroundColor: '#30D158' }]}>
              <Ionicons name="camera" size={18} color="#FFFFFF" />
            </View>
            <Text style={styles.actionLabel}>Scan Receipt</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. Spending Breakdown Widget */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Spending Breakdown</Text>
          <Text style={styles.sectionSubtitle}>This Month</Text>
        </View>

        <View style={styles.categoriesCard}>
          {spendingCategories.map(cat => (
            <View key={cat.id} style={styles.categoryItem}>
              <View style={styles.categoryTopRow}>
                <View style={styles.categoryTitleRow}>
                  <View style={[styles.categoryIconCircle, { backgroundColor: cat.color + '22' }]}>
                    <Ionicons name={cat.icon} size={16} color={cat.color} />
                  </View>
                  <Text style={styles.categoryName}>{cat.name}</Text>
                </View>

                <View style={styles.categoryAmountRow}>
                  <Text style={styles.categoryAmount}>{formatCurrency(cat.amount)}</Text>
                  <Text style={styles.categoryPercent}>{cat.percentage}%</Text>
                </View>
              </View>

              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${cat.percentage}%`,
                      backgroundColor: cat.color,
                    },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* 4. Recent Transactions */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <TouchableOpacity activeOpacity={0.6}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.transactionsCard}>
          {mockTransactions.map((tx, index) => {
            const isLast = index === mockTransactions.length - 1;
            const isIncome = tx.type === 'income';

            return (
              <View
                key={tx.id}
                style={[
                  styles.transactionItem,
                  !isLast && styles.transactionItemBorder,
                ]}
              >
                <View style={styles.txLeft}>
                  <View
                    style={[
                      styles.txIconContainer,
                      isIncome && styles.txIconIncome,
                    ]}
                  >
                    <Ionicons
                      name={tx.icon}
                      size={20}
                      color={isIncome ? '#30D158' : '#A0A0A0'}
                    />
                  </View>
                  <View style={styles.txDetails}>
                    <Text style={styles.txTitle}>{tx.title}</Text>
                    <Text style={styles.txSubtitle}>
                      {tx.category} • {tx.date}
                    </Text>
                  </View>
                </View>

                <Text
                  style={[
                    styles.txAmount,
                    isIncome ? styles.txAmountIncome : styles.txAmountExpense,
                  ]}
                >
                  {isIncome ? '+' : '-'}
                  {formatCurrency(tx.amount)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
};

export default DashboardScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },

  // 1. Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0A84FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  greetingContainer: {
    justifyContent: 'center',
  },
  greetingSub: {
    fontSize: 13,
    color: '#A0A0A0',
  },
  greetingName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bellButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#30D158',
  },

  // 2. Net Worth Card
  balanceCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 20,
    marginBottom: 24,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceLabel: {
    fontSize: 12,
    letterSpacing: 1,
    fontWeight: '600',
    color: '#A0A0A0',
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  trendText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#30D158',
    marginLeft: 4,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 20,
  },
  quickActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
  },
  actionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // 3. Section Headers
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#A0A0A0',
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0A84FF',
  },

  // 4. Categories Card
  categoriesCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 16,
  },
  categoryItem: {
    marginBottom: 16,
  },
  categoryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  categoryAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginRight: 8,
  },
  categoryPercent: {
    fontSize: 12,
    color: '#A0A0A0',
    width: 32,
    textAlign: 'right',
  },
  progressBarBackground: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2A2A2A',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // 5. Transactions Card
  transactionsCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 16,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  transactionItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  txIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txIconIncome: {
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
  },
  txDetails: {
    flex: 1,
  },
  txTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  txSubtitle: {
    fontSize: 12,
    color: '#A0A0A0',
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  txAmountIncome: {
    color: '#30D158',
  },
  txAmountExpense: {
    color: '#FFFFFF',
  },
});
