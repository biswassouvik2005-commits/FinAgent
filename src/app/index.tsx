import axios from 'axios';
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function Index() {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState([
    { id: '1', text: 'Hello! I am your personal finance assistant. How can I help you manage your budget today?', sender: 'ai' }
  ]);

  const sendMessage = () => {
    if (inputText.trim() === '') return;

    const userMessage = { id: Date.now().toString(), text: inputText, sender: 'user' };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    const currentText = inputText; // Save text before clearing
    setInputText('');

    // Connect to your local backend
    axios.post('http://192.168.0.106:8000/api/chat', { message: currentText })
      .then(response => {
        const aiMessage = { id: (Date.now() + 1).toString(), text: response.data.reply, sender: 'ai' };
        setMessages(prevMessages => [...prevMessages, aiMessage]);
      })
      .catch(error => {
        console.error("Connection error:", error);
        const errorMessage = { id: (Date.now() + 1).toString(), text: "Failed to connect to the brain.", sender: 'ai' };
        setMessages(prevMessages => [...prevMessages, errorMessage]);
      });
  };

  const renderMessage = ({ item }: any) => (
    <View style={[styles.messageBubble, item.sender === 'user' ? styles.userMessage : styles.aiMessage]}>
      <Text style={[styles.messageText, item.sender === 'user' ? styles.userMessageText : styles.aiMessageText]}>
        {item.text}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Financial Assistant</Text>
        <Text style={styles.balanceText}>Balance: $4,250.00</Text>
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
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 10 },
  userMessage: { alignSelf: 'flex-end', backgroundColor: '#1DA1F2', borderBottomRightRadius: 4 },
  aiMessage: { alignSelf: 'flex-start', backgroundColor: '#E1E8ED', borderBottomLeftRadius: 4 },
  messageText: { fontSize: 16 },
  userMessageText: { color: '#FFFFFF' },
  aiMessageText: { color: '#14171A' },
  inputContainer: { flexDirection: 'row', padding: 10, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E1E8ED' },
  textInput: { flex: 1, backgroundColor: '#F5F7FA', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, fontSize: 16, marginRight: 10 },
  sendButton: { backgroundColor: '#1DA1F2', borderRadius: 20, paddingHorizontal: 20, justifyContent: 'center' },
  sendButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
});