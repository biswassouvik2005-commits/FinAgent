import { Slot } from 'expo-router';
import { createContext, useState } from 'react';

export const ThemeContext = createContext<any>(null);

export default function RootLayout() {
  const [theme, setTheme] = useState('dark');

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <Slot />
    </ThemeContext.Provider>
  );
}