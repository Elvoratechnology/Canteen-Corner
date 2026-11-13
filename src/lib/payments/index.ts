import { IPaymentProvider, SupportedPaymentProvider } from './types';
import { StripeProvider } from './StripeProvider';
import { PayPalProvider } from './PayPalProvider';

/**
 * Payment provider factory and registry.
 * Supports Stripe (Credit/Debit cards) and PayPal (Institutional e-wallet deposits).
 */
export function getPaymentProvider(
  providerName: SupportedPaymentProvider | 'stripe' | 'paypal' = 'STRIPE'
): IPaymentProvider {
  const normalized = providerName.toUpperCase();

  if (normalized === 'PAYPAL') {
    return new PayPalProvider();
  }

  // Default to Stripe for card payments
  return new StripeProvider();
}

export { StripeProvider } from './StripeProvider';
export { PayPalProvider } from './PayPalProvider';
export * from './types';
export * from './confirmation';

export default getPaymentProvider;
