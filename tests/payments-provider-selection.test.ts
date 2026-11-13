import { describe, it, expect } from 'vitest';
import { getPaymentProvider, StripeProvider, PayPalProvider } from '../src/lib/payments';

describe('Payment Provider Registry & Multi-Gateway Selection', () => {
  it('should return StripeProvider by default when no provider is specified', () => {
    const provider = getPaymentProvider();
    expect(provider).toBeInstanceOf(StripeProvider);
    expect(provider.providerName).toBe('STRIPE');
  });

  it('should return StripeProvider when explicitly requested ("stripe" or "STRIPE")', () => {
    const providerLower = getPaymentProvider('stripe');
    expect(providerLower).toBeInstanceOf(StripeProvider);
    expect(providerLower.providerName).toBe('STRIPE');

    const providerUpper = getPaymentProvider('STRIPE');
    expect(providerUpper).toBeInstanceOf(StripeProvider);
    expect(providerUpper.providerName).toBe('STRIPE');
  });

  it('should return PayPalProvider when explicitly requested ("paypal" or "PAYPAL")', () => {
    const providerLower = getPaymentProvider('paypal');
    expect(providerLower).toBeInstanceOf(PayPalProvider);
    expect(providerLower.providerName).toBe('PAYPAL');

    const providerUpper = getPaymentProvider('PAYPAL');
    expect(providerUpper).toBeInstanceOf(PayPalProvider);
    expect(providerUpper.providerName).toBe('PAYPAL');
  });
});

