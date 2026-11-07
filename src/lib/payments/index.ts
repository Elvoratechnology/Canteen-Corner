import { IPaymentProvider } from './types';
import { MockTouchPayProvider } from './MockTouchPayProvider';
import { TouchPayProvider } from './TouchPayProvider';

let paymentProviderInstance: IPaymentProvider | null = null;

export function getPaymentProvider(): IPaymentProvider {
  if (!paymentProviderInstance) {
    const isProduction = process.env.NODE_ENV === 'production';
    const providerType = process.env.TOUCHPAY_PROVIDER_TYPE;

    // Enforce production security: In production, always default to production TouchPayProvider
    if (providerType === 'touchpay' || (isProduction && providerType !== 'mock')) {
      paymentProviderInstance = new TouchPayProvider();
    } else {
      paymentProviderInstance = new MockTouchPayProvider();
    }
  }
  return paymentProviderInstance;
}

export default getPaymentProvider;

