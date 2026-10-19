import axios from 'axios';

export const API_BASE_URL = 'https://fin-agent-server-bioa.vercel.app';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

export function getApiErrorMessage(error: unknown, feature: 'chat' | 'receipt'): string {
  const serviceName = feature === 'chat' ? 'AI service' : 'receipt scanning service';

  if (axios.isAxiosError(error)) {
    const responseError = error.response?.data?.error;
    if (typeof responseError === 'string' && responseError.trim()) return responseError;
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return `The ${serviceName} did not respond in time. Please try again.`;
    }
    if (error.code === 'ERR_NETWORK') {
      return `Cannot reach the FinAgent API at ${API_BASE_URL}. Check your network connection and try again.`;
    }
    if (error.response?.status) {
      return `The ${serviceName} returned an error (${error.response.status}). Please try again later.`;
    }
  }

  return error instanceof Error && error.message
    ? error.message
    : `Unable to connect to the ${serviceName}.`;
}

export default api;
