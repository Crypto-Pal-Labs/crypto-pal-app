import handler from '../../../netlify/functions/create-transak-session';

describe('create-transak-session function', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    process.env.TRANSAK_ACCESS_TOKEN = 'test-token';
    process.env.TRANSAK_ENV = 'staging';
    process.env.REFERRER_DOMAIN = 'cryptopal.app';
    process.env.REDIRECT_URL = 'https://cryptopal.app/transak/return';
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns 405 on non-POST', async () => {
    const res = await (handler as any)(new Request('http://localhost', { method: 'GET' }));
    expect(res.status).toBe(405);
  });

  it('creates session and returns sessionId', async () => {
    const mockJson = { success: true, session_id: 'abc123' };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockJson) });

    const body = { widgetParams: { defaultFlow: 'buy', productsAvailed: 'BUY' } };
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    const res = await (handler as any)(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sessionId).toBe('abc123');
  });

  it('handles Transak HTTP error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('upstream error') });

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ widgetParams: {} }) });
    const res = await (handler as any)(req);
    expect(res.status).toBe(502);
  });
});



