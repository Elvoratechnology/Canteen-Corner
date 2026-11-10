import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('TouchPay Provider Selection Security Guard', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('Scenario 1: Production + TOUCHPAY_PROVIDER_TYPE unset -> TouchPayProvider', async () => {
    const { getPaymentProvider } = await import('../src/lib/payments');
    const { TouchPayProvider } = await import('../src/lib/payments/TouchPayProvider');
    const { MockTouchPayProvider } = await import('../src/lib/payments/MockTouchPayProvider');

    process.env.NODE_ENV = 'production';
    delete process.env.TOUCHPAY_PROVIDER_TYPE;

    const provider = getPaymentProvider();
    expect(provider).toBeInstanceOf(TouchPayProvider);
    expect(provider).not.toBeInstanceOf(MockTouchPayProvider);
  });

  it('Scenario 2: Production + TOUCHPAY_PROVIDER_TYPE=touchpay -> TouchPayProvider', async () => {
    const { getPaymentProvider } = await import('../src/lib/payments');
    const { TouchPayProvider } = await import('../src/lib/payments/TouchPayProvider');
    const { MockTouchPayProvider } = await import('../src/lib/payments/MockTouchPayProvider');

    process.env.NODE_ENV = 'production';
    process.env.TOUCHPAY_PROVIDER_TYPE = 'touchpay';

    const provider = getPaymentProvider();
    expect(provider).toBeInstanceOf(TouchPayProvider);
    expect(provider).not.toBeInstanceOf(MockTouchPayProvider);
  });

  it('Scenario 3: Production + TOUCHPAY_PROVIDER_TYPE=mock -> Explicit security configuration error', async () => {
    const { getPaymentProvider } = await import('../src/lib/payments');

    process.env.NODE_ENV = 'production';
    process.env.TOUCHPAY_PROVIDER_TYPE = 'mock';

    expect(() => getPaymentProvider()).toThrow(
      'Security Configuration Error: MockTouchPayProvider cannot be instantiated when NODE_ENV is production.'
    );
  });

  it('Scenario 4: Development + TOUCHPAY_PROVIDER_TYPE=mock -> MockTouchPayProvider', async () => {
    const { getPaymentProvider } = await import('../src/lib/payments');
    const { MockTouchPayProvider } = await import('../src/lib/payments/MockTouchPayProvider');
    const { TouchPayProvider } = await import('../src/lib/payments/TouchPayProvider');

    process.env.NODE_ENV = 'development';
    process.env.TOUCHPAY_PROVIDER_TYPE = 'mock';

    const provider = getPaymentProvider();
    expect(provider).toBeInstanceOf(MockTouchPayProvider);
    expect(provider).not.toBeInstanceOf(TouchPayProvider);
  });

  it('Scenario 5: Development + TOUCHPAY_PROVIDER_TYPE=touchpay -> TouchPayProvider', async () => {
    const { getPaymentProvider } = await import('../src/lib/payments');
    const { TouchPayProvider } = await import('../src/lib/payments/TouchPayProvider');
    const { MockTouchPayProvider } = await import('../src/lib/payments/MockTouchPayProvider');

    process.env.NODE_ENV = 'development';
    process.env.TOUCHPAY_PROVIDER_TYPE = 'touchpay';

    const provider = getPaymentProvider();
    expect(provider).toBeInstanceOf(TouchPayProvider);
    expect(provider).not.toBeInstanceOf(MockTouchPayProvider);
  });

  it('Scenario 6: Development + TOUCHPAY_PROVIDER_TYPE unset -> MockTouchPayProvider (default)', async () => {
    const { getPaymentProvider } = await import('../src/lib/payments');
    const { MockTouchPayProvider } = await import('../src/lib/payments/MockTouchPayProvider');
    const { TouchPayProvider } = await import('../src/lib/payments/TouchPayProvider');

    process.env.NODE_ENV = 'development';
    delete process.env.TOUCHPAY_PROVIDER_TYPE;

    const provider = getPaymentProvider();
    expect(provider).toBeInstanceOf(MockTouchPayProvider);
    expect(provider).not.toBeInstanceOf(TouchPayProvider);
  });
});
