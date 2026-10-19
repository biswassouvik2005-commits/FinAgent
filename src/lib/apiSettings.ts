import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from './api';

export function resolveDefaultApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl && envUrl !== 'undefined') return envUrl.replace(/\/+$/, '');

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.origin) {
      const { origin, port } = window.location;
      if (port !== '8081') return origin.replace(/\/+$/, '');
    }
    return 'http://localhost:3000';
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri?.includes(':')) {
    const host = hostUri.slice(0, hostUri.lastIndexOf(':'));
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:3000`;
    }
  }

  return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

function normalizeApiUrl(value: string): string {
  const clean = value.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    throw new Error('Enter a valid server URL, such as http://192.168.1.20:3000.');
  }

  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('Enter a valid HTTP(S) server URL without credentials or query parameters.');
  }
  return clean;
}

export async function setCustomApiUrl(value: string): Promise<void> {
  const url = normalizeApiUrl(value);
  await AsyncStorage.setItem('fin_custom_api_url', url);
  api.defaults.baseURL = url;
}

export async function resetApiUrlToDefault(): Promise<string> {
  const defaultUrl = resolveDefaultApiUrl();
  await AsyncStorage.removeItem('fin_custom_api_url');
  api.defaults.baseURL = defaultUrl;
  return defaultUrl;
}
