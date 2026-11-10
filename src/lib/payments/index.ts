import { IPaymentProvider } from './types';
import { MockTouchPayProvider } from './MockTouchPayProvider';
import { TouchPayProvider } from './TouchPayProvider';

let paymentProviderInstance: IPaymentProvider | null = null;

export function getPaymentProvider(): IPaymentProvider {
  if (!paymentProviderInstance) {
    const isProduction = process.env.NODE_ENV === 'production';
    const providerType = process.env.TOUCHPAY_PROVIDER_TYPE;

    // Strict Production Gate: In production, always instantiate TouchPayProvider.
    // If TOUCHPAY_PROVIDER_TYPE=mock in production, throw an explicit security error.
    if (isProduction) {
      if (providerType === 'mock') {
        throw new Error(
          'Security Configuration Error: MockTouchPayProvider cannot be instantiated when NODE_ENV is production.'
        );
      }
      paymentProviderInstance = new TouchPayProvider();
    } else if (providerType === 'touchpay') {
      paymentProviderInstance = new TouchPayProvider();
    } else {
      paymentProviderInstance = new MockTouchPayProvider();
    }
  }
  return paymentProviderInstance;
}

export default getPaymentProvider;

