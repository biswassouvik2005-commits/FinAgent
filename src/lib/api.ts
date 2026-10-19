import axios from 'axios';

const envUrl = "http://192.168.0.104:3000";
const api = axios.create({ baseURL: envUrl, timeout: 20_000 });

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
