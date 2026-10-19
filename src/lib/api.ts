import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function resolveDefaultApiUrl(): string {
  // 1. Explicit environment variable takes highest priority
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl && envUrl !== 'undefined') {
    return envUrl.replace(/\/$/, '');
  }

  // 2. Web environment: use current window origin or your PC's IP
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.origin && !window.location.origin.includes(':8081')) {
      return window.location.origin.replace(/\/$/, '');
    }
    return 'http://192.168.0.106:3000';
  }

  // 3. Dynamic Expo host detection (points to development machine IP when running on LAN/device)
  const hostUri = Constants.expoConfig?.hostUri || (Constants as any)?.manifest2?.extra?.expoClient?.hostUri;
  if (typeof hostUri === 'string' && hostUri.includes(':')) {
    const hostIp = hostUri.split(':')[0];
    if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1') {
      return `http://${hostIp}:3000`;
    }
  }

  // 4. Android Emulator & Physical device fallback
  if (Platform.OS === 'android') {
    return 'http://192.168.0.106:3000';
  }

  // 5. iOS Simulator & standard fallback
  return 'http://192.168.0.106:3000';
}

const initialBaseUrl = resolveDefaultApiUrl();

const api = axios.create({
  baseURL: initialBaseUrl,
  timeout: 30000,
});

// Restore any custom user-configured server URL from AsyncStorage
AsyncStorage.getItem('fin_custom_api_url')
  .then(saved => {
    if (saved && saved.trim()) {
      api.defaults.baseURL = saved.trim().replace(/\/$/, '');
    }
  })
  .catch(() => {});

export async function setCustomApiUrl(url: string) {
  const clean = url.trim().replace(/\/$/, '');
  api.defaults.baseURL = clean;
  await AsyncStorage.setItem('fin_custom_api_url', clean);
}

export async function resetApiUrlToDefault(): Promise<string> {
  const def = resolveDefaultApiUrl();
  api.defaults.baseURL = def;
  await AsyncStorage.removeItem('fin_custom_api_url');
  return def;
}

export function getApiErrorMessage(error: unknown, feature: 'chat' | 'receipt') {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : 'The request could not be completed.';
  }

  const serverMessage = error.response?.data?.error;
  if (typeof serverMessage === 'string' && serverMessage.trim()) return serverMessage;

  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return `The ${feature === 'chat' ? 'AI service' : 'receipt service'} did not respond in time. Check that the API server is running and try again.`;
  }

  if (!error.response) {
    let serverAddress = 'EXPO_PUBLIC_API_URL is not configured';
    if (error.config?.baseURL) {
      try {
        const url = new URL(error.config.baseURL);
        serverAddress = `${url.protocol}//${url.hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`;
      } catch {
        serverAddress = 'EXPO_PUBLIC_API_URL is not a valid URL';
      }
    }
    return `Cannot reach the API server at ${serverAddress}. Confirm the server is running on port 3000, the phone and computer are on the same Wi-Fi, and the computer's firewall allows incoming connections. After changing .env.local, fully restart Expo and reload the app.`;
  }

  return `The API request failed with HTTP ${error.response.status}. Please try again.`;
}

export default api;