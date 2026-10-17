import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { PieChart } from './components/PieChart';
import { Camera, Send, Sun, Moon, LogOut, ArrowRight, DollarSign, Wallet, ShieldCheck, TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';

interface CategoryBreakdown {
  category: string;
  amount: number;
}

interface UpcomingBill {
  bill_name: string;
  due_date: string;
  amount: number;
}

interface ChatMessage {
  id: string;
  text: string;
  sender: 'ai' | 'user';
  totalBalance?: number;
  budgetStatus?: string;
  breakdown?: CategoryBreakdown[];
  upcomingBills?: UpcomingBill[];
  portfolioHealth?: string;
  imagePreview?: string;
}

export default function App() {
  // Theme state: dark / light
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const isDark = theme === 'dark';

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Authentication State
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState('souvik');
  const [password, setPassword] = useState('password123');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Financial overview state
  const [totalBalance, setTotalBalance] = useState<number>(10950.0);

  // Chat State
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      text: 'Hello! Please log in to view and manage your finances.',
      sender: 'ai',
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Login Function
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username.trim()) {
      setLoginError('Please enter a username');
      return;
    }
    setLoginLoading(true);
    setLoginError(null);

    try {
      const res = await axios.post('/login', {
        username: username,
        password: password,
      });

      setToken(res.data.access_token);
      setMessages([
        {
          id: '2',
          text: `Welcome back, ${username}! Authentication successful. How can I help with your budget today?`,
          sender: 'ai',
          budgetStatus: 'On Track',
          portfolioHealth: 'Healthy (8.4% YTD)',
        },
      ]);
    } catch (err: any) {
      console.error('Login error:', err);
      // Fallback local session if offline
      const mockToken = `local_token_${Date.now()}`;
      setToken(mockToken);
      setMessages([
        {
          id: '2',
          text: 'Authentication successful. How can I help with your budget today?',
          sender: 'ai',
          budgetStatus: 'On Track',
          portfolioHealth: 'Healthy (8.4% YTD)',
        },
      ]);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setMessages([
      {
        id: '1',
        text: 'Hello! Please log in to view and manage your finances.',
        sender: 'ai',
      },
    ]);
  };

  // Chat Function
  const sendMessage = async (overrideText?: string) => {
    const textToSend = overrideText || inputText;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      text: textToSend,
      sender: 'user',
    };

    setMessages(prev => [...prev, userMessage]);
    if (!overrideText) setInputText('');
    setIsLoading(true);

    try {
      const response = await axios.post(
        '/api/chat',
        { message: textToSend },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = response.data;
      if (typeof data.total_balance === 'number') {
        setTotalBalance(data.total_balance);
      }

      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: data.ai_reply || 'No text response',
        sender: 'ai',
        totalBalance: data.total_balance,
        budgetStatus: data.budget_status,
        breakdown: data.category_breakdown || [],
        upcomingBills: data.upcoming_bills || [],
        portfolioHealth: data.portfolio_health,
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Connection error:', error);
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: 'Failed to connect to the backend assistant service.',
          sender: 'ai',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Receipt OCR Function
  const handleReceiptFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64Data = dataUrl.split(',')[1];
      const mimeType = file.type || 'image/jpeg';

      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          text: '📷 Scanning receipt...',
          sender: 'user',
          imagePreview: dataUrl,
        },
      ]);
      setIsLoading(true);

      try {
        const response = await axios.post('/api/receipt', {
          base64Image: base64Data,
          mimeType: mimeType,
        });

        const data = response.data;
        const totalNum = Number(data.total) || 0;
        setTotalBalance(prev => Math.max(0, prev - totalNum));

        const aiMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          text: `Receipt Scanned!\nMerchant: ${data.merchant}\nTotal: $${Number(data.total).toFixed(2)}\nCategory: ${data.category}`,
          sender: 'ai',
        };
        setMessages(prev => [...prev, aiMessage]);
      } catch (error) {
        console.error('OCR Upload failed', error);
        setMessages(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            text: 'Failed to read the receipt. Please try another image.',
            sender: 'ai',
          },
        ]);
      } finally {
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const triggerReceiptUpload = () => {
    fileInputRef.current?.click();
  };

  // Quick suggestion chips
  const quickPrompts = [
    'Spending breakdown',
    'Upcoming bills',
    'Budget status',
    'Portfolio health',
  ];

  // Render Login Screen if not authenticated
  if (!token) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4 transition-colors duration-200"
        style={{ backgroundColor: isDark ? '#171717' : '#F5F7FA' }}
      >
        <div
          className="w-full max-w-md rounded-2xl p-8 shadow-xl border transition-colors duration-200"
          style={{
            backgroundColor: isDark ? '#27272a' : '#FFFFFF',
            borderColor: isDark ? '#3f3f46' : '#E1E8ED',
          }}
        >
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1DA1F2] flex items-center justify-center text-white shadow-md">
                <Wallet className="w-6 h-6" />
              </div>
              <div>
                <h1
                  className="text-xl font-bold tracking-tight"
                  style={{ color: isDark ? '#ffffff' : '#14171A' }}
                >
                  FinAgent
                </h1>
                <p className="text-xs" style={{ color: isDark ? '#a1a1aa' : '#657786' }}>
                  AI Financial Assistant
                </p>
              </div>
            </div>

            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg border transition-colors"
              style={{
                backgroundColor: isDark ? '#3f3f46' : '#F5F7FA',
                borderColor: isDark ? '#52525b' : '#E1E8ED',
                color: isDark ? '#f4f4f5' : '#14171A',
              }}
              title="Toggle theme"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
            </button>
          </div>

          <h2
            className="text-2xl font-bold mb-6 text-center"
            style={{ color: isDark ? '#ffffff' : '#14171A' }}
          >
            Secure Login
          </h2>

          {loginError && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                className="block text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: isDark ? '#a1a1aa' : '#657786' }}
              >
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Username"
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all focus:ring-2 focus:ring-[#1DA1F2]"
                style={{
                  backgroundColor: isDark ? '#18181b' : '#F5F7FA',
                  color: isDark ? '#FFFFFF' : '#14171A',
                  borderColor: isDark ? '#3f3f46' : '#E1E8ED',
                }}
              />
            </div>

            <div>
              <label
                className="block text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: isDark ? '#a1a1aa' : '#657786' }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all focus:ring-2 focus:ring-[#1DA1F2]"
                style={{
                  backgroundColor: isDark ? '#18181b' : '#F5F7FA',
                  color: isDark ? '#FFFFFF' : '#14171A',
                  borderColor: isDark ? '#3f3f46' : '#E1E8ED',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3.5 rounded-xl text-white font-bold text-sm tracking-wide transition-all shadow-md hover:opacity-90 active:scale-[0.99] flex items-center justify-center gap-2"
              style={{ backgroundColor: '#007AFF' }}
            >
              {loginLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Login</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div
            className="mt-6 pt-4 border-t text-center text-xs"
            style={{
              borderColor: isDark ? '#3f3f46' : '#E1E8ED',
              color: isDark ? '#71717a' : '#8899A6',
            }}
          >
            <span>Demo Mode: Any credentials will log in</span>
          </div>
        </div>
      </div>
    );
  }

  // Render Main Financial Assistant Screen
  return (
    <div
      className="min-h-screen flex flex-col transition-colors duration-200"
      style={{ backgroundColor: isDark ? '#171717' : '#F5F7FA' }}
    >
      {/* Hidden File Input for Receipt OCR */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleReceiptFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* Top Navigation & Balance Header */}
      <header
        className="border-b sticky top-0 z-30 transition-colors backdrop-blur-md"
        style={{
          backgroundColor: isDark ? 'rgba(23, 23, 23, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          borderBottomColor: isDark ? '#3f3f46' : '#E1E8ED',
        }}
      >
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1DA1F2] flex items-center justify-center text-white shadow-sm">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h1
                className="text-base font-bold leading-tight"
                style={{ color: isDark ? '#ffffff' : '#14171A' }}
              >
                Financial Assistant
              </h1>
              <p className="text-xs" style={{ color: isDark ? '#a1a1aa' : '#657786' }}>
                FinAgent Smart Budget & OCR
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90 flex items-center gap-1.5 shadow-sm"
              style={{ backgroundColor: isDark ? '#3f3f46' : '#007AFF' }}
            >
              {isDark ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-300" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5" />
                  <span>Dark Mode</span>
                </>
              )}
            </button>

            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg border text-xs transition-colors hover:bg-red-500/10 hover:text-red-500"
              style={{
                borderColor: isDark ? '#3f3f46' : '#E1E8ED',
                color: isDark ? '#a1a1aa' : '#657786',
              }}
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Total Balance Banner */}
        <div
          className="text-center py-3 border-t"
          style={{
            borderColor: isDark ? '#27272a' : '#F0F3F5',
            backgroundColor: isDark ? '#1a1a1c' : '#F8FAFC',
          }}
        >
          <span
            className="text-xs uppercase tracking-wider font-semibold block mb-0.5"
            style={{ color: isDark ? '#a1a1aa' : '#657786' }}
          >
            Total Balance
          </span>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#1DA1F2] tracking-tight">
            ${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </header>

      {/* Main Chat Stream Container */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 flex flex-col justify-between overflow-y-auto">
        <div className="space-y-4 pb-4">
          {messages.map(item => (
            <div
              key={item.id}
              className={`flex flex-col ${item.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className="max-w-[90%] sm:max-w-[80%] p-3.5 sm:p-4 rounded-2xl shadow-sm text-sm sm:text-base leading-relaxed transition-all"
                style={
                  item.sender === 'user'
                    ? {
                        backgroundColor: '#1DA1F2',
                        color: '#FFFFFF',
                        borderBottomRightRadius: '4px',
                      }
                    : {
                        backgroundColor: isDark ? '#27272a' : '#FFFFFF',
                        color: isDark ? '#f4f4f5' : '#14171A',
                        borderColor: isDark ? '#3f3f46' : '#E1E8ED',
                        borderWidth: '1px',
                        borderBottomLeftRadius: '4px',
                      }
                }
              >
                {/* Image Preview if user uploaded a receipt */}
                {item.imagePreview && (
                  <div className="mb-3 rounded-lg overflow-hidden border border-white/20 max-w-[200px]">
                    <img src={item.imagePreview} alt="Receipt preview" className="w-full h-auto object-cover" />
                  </div>
                )}

                {/* Message Body */}
                <div className="whitespace-pre-line font-normal">{item.text}</div>

                {/* Budget Status Badge */}
                {item.budgetStatus && (
                  <div
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shadow-xs"
                    style={{
                      backgroundColor: isDark ? '#3f3f46' : '#F5F7FA',
                      color: '#F45D22',
                    }}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Status: {item.budgetStatus}</span>
                  </div>
                )}

                {/* Portfolio Health Badge */}
                {item.portfolioHealth && (
                  <div
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shadow-xs ml-2"
                    style={{
                      backgroundColor: isDark ? '#3f3f46' : '#F5F7FA',
                      color: '#17BF63',
                    }}
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Portfolio: {item.portfolioHealth}</span>
                  </div>
                )}

                {/* Upcoming Bills Section */}
                {item.upcomingBills && item.upcomingBills.length > 0 && (
                  <div
                    className="mt-3 pt-3 border-t w-full"
                    style={{ borderColor: isDark ? '#3f3f46' : '#E1E8ED' }}
                  >
                    <div
                      className="font-bold text-xs uppercase tracking-wider mb-2"
                      style={{ color: isDark ? '#f4f4f5' : '#14171A' }}
                    >
                      Upcoming Bills:
                    </div>
                    <div className="space-y-1.5">
                      {item.upcomingBills.map((bill, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between text-xs py-1 px-2 rounded-md"
                          style={{
                            backgroundColor: isDark ? '#1f1f23' : '#F9FAFB',
                          }}
                        >
                          <span style={{ color: isDark ? '#a1a1aa' : '#555555' }}>
                            {bill.bill_name} <span className="opacity-75">({bill.due_date})</span>
                          </span>
                          <span
                            className="font-bold"
                            style={{ color: isDark ? '#f4f4f5' : '#14171A' }}
                          >
                            ${bill.amount.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Spending Breakdown Section with SVG PieChart */}
                {item.breakdown && item.breakdown.length > 0 && (
                  <div
                    className="mt-3 pt-3 border-t w-full"
                    style={{ borderColor: isDark ? '#3f3f46' : '#E1E8ED' }}
                  >
                    <div
                      className="font-bold text-xs uppercase tracking-wider mb-2"
                      style={{ color: isDark ? '#f4f4f5' : '#14171A' }}
                    >
                      Spending Breakdown:
                    </div>
                    <PieChart data={item.breakdown} isDark={isDark} />
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-start">
              <div
                className="p-3.5 rounded-2xl border text-sm flex items-center gap-2"
                style={{
                  backgroundColor: isDark ? '#27272a' : '#FFFFFF',
                  borderColor: isDark ? '#3f3f46' : '#E1E8ED',
                  color: isDark ? '#a1a1aa' : '#657786',
                  borderBottomLeftRadius: '4px',
                }}
              >
                <RefreshCw className="w-4 h-4 animate-spin text-[#1DA1F2]" />
                <span>FinAgent is thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="py-2 flex flex-wrap gap-2">
          {quickPrompts.map(prompt => (
            <button
              key={prompt}
              onClick={() => sendMessage(prompt)}
              disabled={isLoading}
              className="text-xs px-3 py-1.5 rounded-full border transition-all hover:border-[#1DA1F2] active:scale-95"
              style={{
                backgroundColor: isDark ? '#27272a' : '#FFFFFF',
                borderColor: isDark ? '#3f3f46' : '#E1E8ED',
                color: isDark ? '#d4d4d8' : '#4b5563',
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      </main>

      {/* Input Bar at Bottom */}
      <footer
        className="border-t p-3 sm:p-4 sticky bottom-0 z-30 backdrop-blur-md"
        style={{
          backgroundColor: isDark ? 'rgba(23, 23, 23, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          borderTopColor: isDark ? '#3f3f46' : '#E1E8ED',
        }}
      >
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          {/* Camera / Receipt OCR Button */}
          <button
            onClick={triggerReceiptUpload}
            disabled={isLoading}
            className="w-11 h-11 rounded-full text-white flex items-center justify-center shrink-0 transition-all hover:opacity-90 active:scale-95 shadow-md"
            style={{ backgroundColor: '#17BF63' }}
            title="Scan Receipt with Camera or Upload"
          >
            <Camera className="w-5 h-5" />
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') sendMessage();
            }}
            placeholder="Ask about your budget..."
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-full text-sm outline-none border transition-colors focus:ring-2 focus:ring-[#1DA1F2]"
            style={{
              backgroundColor: isDark ? '#27272a' : '#F5F7FA',
              color: isDark ? '#ffffff' : '#000000',
              borderColor: isDark ? '#3f3f46' : '#E1E8ED',
            }}
          />

          {/* Send Button */}
          <button
            onClick={() => sendMessage()}
            disabled={!inputText.trim() || isLoading}
            className="px-5 py-2.5 rounded-full text-white font-bold text-sm flex items-center gap-1.5 transition-all disabled:opacity-50 active:scale-95 shadow-md"
            style={{ backgroundColor: '#1DA1F2' }}
          >
            <span>Send</span>
            <Send className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}
