import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.GEMINI_API_KEY;
const { app, default: vercelHandler } = await import('../server');

test('validates API requests and serves deterministic calculations without Gemini', async () => {
  assert.equal(vercelHandler, app);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const invalid = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'budget', userContext: { monthlyIncome: -10 } }),
    });
    assert.equal(invalid.status, 400);

    const calculation = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Show my budget', userContext: { monthlyIncome: 5_000 } }),
    });
    assert.equal(calculation.status, 200);
    const result = await calculation.json() as { intent: string; ai_reply: string };
    assert.equal(result.intent, 'budget');
    assert.match(result.ai_reply, /Needs \(50%\): \$2500\.00/);

    const unavailable = await fetch(`${baseUrl}/api/receipt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ base64Image: 'AQ==', mimeType: 'image/jpeg' }),
    });
    assert.equal(unavailable.status, 503);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
