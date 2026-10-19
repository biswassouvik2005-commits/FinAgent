import assert from 'node:assert/strict';
import test from 'node:test';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import api, { API_BASE_URL, getApiErrorMessage } from '../src/lib/api';

test('uses the deployed API URL and explains network failures', () => {
  assert.equal(API_BASE_URL, 'https://fin-agent-server-bioa.vercel.app');
  assert.equal(api.defaults.baseURL, API_BASE_URL);

  const error = new AxiosError(
    'Network Error',
    AxiosError.ERR_NETWORK,
    { baseURL: API_BASE_URL } as InternalAxiosRequestConfig
  );
  const message = getApiErrorMessage(error, 'chat');
  assert.match(message, /fin-agent-server-bioa\.vercel\.app/);
  assert.match(message, /network connection/);
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
