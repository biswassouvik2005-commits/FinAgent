import axios from 'axios';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { useContext, useState } from 'react';
import { Dimensions, FlatList, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PieChart } from 'react-native-chart-kit';
import { ThemeContext } from './_layout';

const screenWidth = Dimensions.get("window").width;
const chartColors = ['#1DA1F2', '#17BF63', '#F45D22', '#794BC4', '#E1E8ED'];

// --- Dynamic Cross-Platform API URL Helper ---
const getApiUrl = () => {
  if (Platform.OS === 'web') {
    return 'http://localhost:8000';
  }
  
  // Extracts host IP automatically when using Expo Go on physical devices
  const debuggerHost = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
  if (debuggerHost) {
    const hostIp = debuggerHost.split(':')[0];
    return `http://${hostIp}:8000`;
  }
  
  // Fallback network IP
  return 'http://192.168.0.105:8000';
};

const API_BASE = getApiUrl();

export default function Index() {
  const { theme, toggleTheme } = useContext(ThemeContext);
  const isDark = theme === 'dark';

  // --- Authentication State ---
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // --- Chat State ---
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<any[]>([
    { id: '1', text: 'Hello! Please log in to view your finances.', sender: 'ai' }
  ]);

  // --- Login Function ---
  const handleLogin = async () => {
    try {
      const res = await axios.post(`${API_BASE}/login`, 
        { username: username, password: password }, 
        { headers: { 'Content-Type': 'application/json' } }
      );
      setToken(res.data.access_token);
      setMessages([{ id: '2', text: 'Authentication successful. How can I help with your budget today?', sender: 'ai' }]);
    } catch (e) {
      alert('Login failed. Please check your credentials or backend server.');
    }
  };

  // --- Chat Function ---
  const sendMessage = () => {
    if (inputText.trim() === '') return;

    const userMessage = { id: Date.now().toString(), text: inputText, sender: 'user' };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    const currentText = inputText; 
    setInputText('');

    axios.post(`${API_BASE}/api/chat`, 
      { message: currentText },
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then(response => {
        const data = response.data;
        const aiMessage = { 
          id: (Date.now() + 1).toString(), 
          text: data.ai_reply || "No text response", 
          sender: 'ai',
          totalBalance: data.total_balance,
          budgetStatus: data.budget_status,
          breakdown: data.category_breakdown || [],
          upcomingBills: data.upcoming_bills || [],
          portfolioHealth: data.portfolio_health
        };
        setMessages(prevMessages => [...prevMessages, aiMessage]);
      })
      .catch(error => {
        console.error("Connection error:", error);
        setMessages(prevMessages => [...prevMessages, { id: (Date.now() + 1).toString(), text: "Failed to connect to the backend.", sender: 'ai' }]);
      });
  };

  // --- Receipt OCR Function ---
  const uploadReceipt = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      alert("Permission to access camera roll is required!");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true, 
    });

    if (!result.canceled && result.assets[0].base64) {
      try {
        setMessages(prev => [...prev, { id: Date.now().toString(), text: "📷 Scanning receipt...", sender: 'user' }]);
        
        const response = await axios.post(`${API_BASE}/api/receipt`, {
          base64Image: result.assets[0].base64,
          mimeType: result.assets[0].mimeType || 'image/jpeg'
        });
        
        const data = response.data;
        const aiMessage = { 
          id: (Date.now() + 1).toString(), 
          text: `Receipt Scanned!\nMerchant: ${data.merchant}\nTotal: $${data.total}\nCategory: ${data.category}`, 
          sender: 'ai' 
        };
        setMessages(prev => [...prev, aiMessage]);
      } catch (error) {
        console.error("OCR Upload failed", error);
        setMessages(prev => [...prev, { id: Date.now().toString(), text: "Failed to read the receipt.", sender: 'ai' }]);
      }
    }
  };

  const renderMessage = ({ item }: any) => (
    <View style={[styles.messageBubble, item.sender === 'user' ? styles.userMessage : [styles.aiMessage, { backgroundColor: isDark ? '#27272a' : '#FFFFFF', borderColor: isDark ? '#3f3f46' : '#E1E8ED' }]]}>
      <Text style={[styles.messageText, item.sender === 'user' ? styles.userMessageText : { color: isDark ? '#f4f4f5' : '#14171A' }]}>
        {item.text}
      </Text>

      {item.budgetStatus && (
        <View style={[styles.badgeContainer, { backgroundColor: isDark ? '#3f3f46' : '#F5F7FA' }]}>
          <Text style={styles.badgeText}>Status: {item.budgetStatus}</Text>
        </View>
      )}

      {item.portfolioHealth && (
        <View style={[styles.badgeContainer, { backgroundColor: isDark ? '#3f3f46' : '#F5F7FA' }]}>
          <Text style={styles.badgeText}>Portfolio: {item.portfolioHealth}</Text>
        </View>
      )}

      {item.upcomingBills && item.upcomingBills.length > 0 && (
        <View style={[styles.chartContainer, { borderColor: isDark ? '#3f3f46' : '#E1E8ED', alignSelf: 'stretch', alignItems: 'flex-start' }]}>
          <Text style={[styles.breakdownTitle, { color: isDark ? '#f4f4f5' : '#14171A' }]}>Upcoming Bills:</Text>
          {item.upcomingBills.map((bill: any, index: number) => (
            <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 4 }}>
              <Text style={{ color: isDark ? '#a1a1aa' : '#555' }}>{bill.bill_name} ({bill.due_date})</Text>
              <Text style={{ fontWeight: 'bold', color: isDark ? '#f4f4f5' : '#14171A' }}>${bill.amount.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      )}

      {item.breakdown && item.breakdown.length > 0 && (
        <View style={[styles.chartContainer, { borderColor: isDark ? '#3f3f46' : '#E1E8ED' }]}>
          <Text style={[styles.breakdownTitle, { color: isDark ? '#f4f4f5' : '#14171A' }]}>Spending Breakdown:</Text>
          <PieChart
            data={item.breakdown.map((cat: any, index: number) => ({
              name: cat.category,
              population: cat.amount,
              color: chartColors[index % chartColors.length],
              legendFontColor: isDark ? "#a1a1aa" : "#14171A",
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

  // --- Render Login Screen if no token ---
  if (!token) {
    return (
      <View style={[styles.center, { backgroundColor: isDark ? '#171717' : '#F5F7FA' }]}>
        <Text style={[styles.title, { color: isDark ? '#ffffff' : '#14171A' }]}>Secure Login</Text>
        <TextInput 
          style={[styles.loginInput, { backgroundColor: isDark ? '#27272a' : '#FFF', color: isDark ? '#FFF' : '#000', borderColor: isDark ? '#3f3f46' : '#DDD' }]} 
          placeholder="Username" 
          placeholderTextColor={isDark ? "#a1a1aa" : "#888"}
          value={username} 
          onChangeText={setUsername} 
          autoCapitalize="none" 
        />
        <TextInput 
          style={[styles.loginInput, { backgroundColor: isDark ? '#27272a' : '#FFF', color: isDark ? '#FFF' : '#000', borderColor: isDark ? '#3f3f46' : '#DDD' }]} 
          placeholder="Password" 
          placeholderTextColor={isDark ? "#a1a1aa" : "#888"}
          secureTextEntry 
          value={password} 
          onChangeText={setPassword} 
        />
        <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
          <Text style={styles.sendButtonText}>Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Render Main Chat Screen if logged in ---
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#171717' : '#F5F7FA' }]}>
      <Pressable onPress={toggleTheme} style={{ padding: 8, alignSelf: 'flex-end', marginRight: 20, marginTop: 10, backgroundColor: isDark ? '#3f3f46' : '#007AFF', borderRadius: 8 }}>
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>{isDark ? 'Light Mode' : 'Dark Mode'}</Text>
      </Pressable>

      <View style={[styles.header, { backgroundColor: isDark ? '#171717' : '#FFFFFF', borderBottomColor: isDark ? '#3f3f46' : '#E1E8ED' }]}>
        <Text style={[styles.headerTitle, { color: isDark ? '#ffffff' : '#14171A' }]}>Financial Assistant</Text>
        <Text style={styles.balanceText}>Total Balance: $10,950.00</Text>
      </View>

      <KeyboardAvoidingView style={styles.chatContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList data={messages} keyExtractor={item => item.id} renderItem={renderMessage} contentContainerStyle={styles.messageList} />
        <View style={[styles.inputContainer, { backgroundColor: isDark ? '#171717' : '#FFFFFF', borderTopColor: isDark ? '#3f3f46' : '#E1E8ED' }]}>
          
          <TouchableOpacity style={[styles.sendButton, { backgroundColor: '#17BF63', marginRight: 10 }]} onPress={uploadReceipt}>
            <Text style={styles.sendButtonText}>📷</Text>
          </TouchableOpacity>

          <TextInput style={[styles.textInput, { backgroundColor: isDark ? '#27272a' : '#F5F7FA', color: isDark ? '#ffffff' : '#000000' }]} value={inputText} onChangeText={setInputText} placeholder="Ask about your budget..." placeholderTextColor={isDark ? "#a1a1aa" : "#888"} />
          
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  loginInput: { width: '100%', padding: 15, borderRadius: 8, marginBottom: 10, borderWidth: 1 },
  loginBtn: { backgroundColor: '#007AFF', padding: 15, borderRadius: 8, justifyContent: 'center', alignItems: 'center', width: '100%' },
  header: { padding: 20, borderBottomWidth: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  balanceText: { fontSize: 24, fontWeight: '800', color: '#1DA1F2', marginTop: 5 },
  chatContainer: { flex: 1 },
  messageList: { padding: 15 },
  messageBubble: { maxWidth: '85%', padding: 14, borderRadius: 16, marginBottom: 12 },
  userMessage: { alignSelf: 'flex-end', backgroundColor: '#1DA1F2', borderBottomRightRadius: 4 },
  aiMessage: { alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1 },
  messageText: { fontSize: 16, lineHeight: 22 },
  userMessageText: { color: '#FFFFFF' },
  inputContainer: { flexDirection: 'row', padding: 10, borderTopWidth: 1 },
  textInput: { flex: 1, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, fontSize: 16, marginRight: 10 },
  sendButton: { backgroundColor: '#1DA1F2', borderRadius: 20, paddingHorizontal: 20, justifyContent: 'center' },
  sendButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  chartContainer: { marginTop: 15, paddingTop: 15, borderTopWidth: 1, alignItems: 'center' },
  breakdownTitle: { fontWeight: '700', marginBottom: 10, alignSelf: 'flex-start' },
  badgeContainer: { marginTop: 10, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, alignSelf: 'flex-start' },
  badgeText: { fontSize: 14, fontWeight: '600', color: '#F45D22' }
});