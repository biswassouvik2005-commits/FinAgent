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

  // 2. Web environment: use current window origin or local IP
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

  // 4. Android Emulator loopback / Physical device fallback
  if (Platform.OS === 'android') {
    return 'http://192.168.0.106:3000';
  }

  // 5. iOS Simulator & standard physical device fallback
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

export default api;