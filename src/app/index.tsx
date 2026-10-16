import axios from 'axios';
import { useState } from 'react';
import { Dimensions, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PieChart } from 'react-native-chart-kit';

const screenWidth = Dimensions.get("window").width;

// Define chart colors
const chartColors = ['#1DA1F2', '#17BF63', '#F45D22', '#794BC4', '#E1E8ED'];

export default function Index() {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<any[]>([
    { id: '1', text: 'Hello! I am your personal finance assistant. How can I help you manage your budget today?', sender: 'ai' }
  ]);

  const sendMessage = () => {
    if (inputText.trim() === '') return;

    const userMessage = { id: Date.now().toString(), text: inputText, sender: 'user' };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    const currentText = inputText; 
    setInputText('');

    axios.post('http://192.168.0.106:8000/api/chat', { message: currentText })
      .then(response => {
        const data = response.data;
        const aiMessage = { 
          id: (Date.now() + 1).toString(), 
          text: data.ai_reply || "No text response", 
          sender: 'ai',
          totalBalance: data.total_balance,
          budgetStatus: data.budget_status, // New budget status field
          breakdown: data.category_breakdown || []
        };
        setMessages(prevMessages => [...prevMessages, aiMessage]);
      })
      .catch(error => {
        console.error("Connection error:", error);
        const errorMessage = { id: (Date.now() + 1).toString(), text: "Failed to connect to the backend.", sender: 'ai' };
        setMessages(prevMessages => [...prevMessages, errorMessage]);
      });
  };

  const renderMessage = ({ item }: any) => (
    <View style={[styles.messageBubble, item.sender === 'user' ? styles.userMessage : styles.aiMessage]}>
      <Text style={[styles.messageText, item.sender === 'user' ? styles.userMessageText : styles.aiMessageText]}>
        {item.text}
      </Text>

      {/* Budget Status Badge */}
      {item.budgetStatus && (
        <View style={styles.badgeContainer}>
          <Text style={styles.badgeText}>Status: {item.budgetStatus}</Text>
        </View>
      )}

      {/* Visual Pie Chart */}
      {item.breakdown && item.breakdown.length > 0 && (
        <View style={styles.chartContainer}>
          <Text style={styles.breakdownTitle}>Spending Breakdown:</Text>
          <PieChart
            data={item.breakdown.map((cat: any, index: number) => ({
              name: cat.category,
              population: cat.amount,
              color: chartColors[index % chartColors.length],
              legendFontColor: "#14171A",
              legendFontSize: 12
            }))}
            width={screenWidth * 0.65}
            height={150}
            chartConfig={{ color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})` }}
            accessor={"population"}
            backgroundColor={"transparent"}
            paddingLeft={"0"}
            absolute
          />
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Financial Assistant</Text>
        <Text style={styles.balanceText}>Total Balance: $10,950.00</Text>
      </View>

      <KeyboardAvoidingView 
        style={styles.chatContainer} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask about your budget..."
            placeholderTextColor="#888"
          />
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { padding: 20, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E1E8ED', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#14171A' },
  balanceText: { fontSize: 24, fontWeight: '800', color: '#1DA1F2', marginTop: 5 },
  chatContainer: { flex: 1 },
  messageList: { padding: 15 },
  messageBubble: { maxWidth: '85%', padding: 14, borderRadius: 16, marginBottom: 12 },
  userMessage: { alignSelf: 'flex-end', backgroundColor: '#1DA1F2', borderBottomRightRadius: 4 },
  aiMessage: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#E1E8ED' },
  messageText: { fontSize: 16, lineHeight: 22 },
  userMessageText: { color: '#FFFFFF' },
  aiMessageText: { color: '#14171A' },
  inputContainer: { flexDirection: 'row', padding: 10, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E1E8ED' },
  textInput: { flex: 1, backgroundColor: '#F5F7FA', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, fontSize: 16, marginRight: 10 },
  sendButton: { backgroundColor: '#1DA1F2', borderRadius: 20, paddingHorizontal: 20, justifyContent: 'center' },
  sendButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  chartContainer: { marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderColor: '#E1E8ED', alignItems: 'center' },
  breakdownTitle: { fontWeight: '700', marginBottom: 10, color: '#14171A', alignSelf: 'flex-start' },
  badgeContainer: { marginTop: 10, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#F5F7FA', borderRadius: 12, alignSelf: 'flex-start' },
  badgeText: { fontSize: 14, fontWeight: '600', color: '#F45D22' }
});