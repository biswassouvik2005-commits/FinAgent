import assert from 'node:assert/strict';
import test from 'node:test';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { getApiErrorMessage } from '../src/lib/api';

test('explains a network failure using the configured API host and Expo restart guidance', () => {
  const error = new AxiosError(
    'Network Error',
    AxiosError.ERR_NETWORK,
    { baseURL: 'http://192.168.0.105:3000' } as InternalAxiosRequestConfig
  );
  const message = getApiErrorMessage(error, 'chat');
  assert.match(message, /192\.168\.0\.105:3000/);
  assert.match(message, /same Wi-Fi/);
  assert.match(message, /fully restart Expo/);
});

test('uses meaningful API response errors and timeout guidance', () => {
  const serverError = new AxiosError('Request failed', undefined, undefined, undefined, {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {},
    config: { headers: new axios.AxiosHeaders() } as InternalAxiosRequestConfig,
    data: { error: 'AI service is not configured.' },
  });
  assert.equal(getApiErrorMessage(serverError, 'chat'), 'AI service is not configured.');

  const timeoutError = new AxiosError('timeout', 'ECONNABORTED');
  assert.match(getApiErrorMessage(timeoutError, 'receipt'), /did not respond in time/);
});
