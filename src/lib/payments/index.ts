import { IPaymentProvider } from './types';
import { MockTouchPayProvider } from './MockTouchPayProvider';
import { TouchPayProvider } from './TouchPayProvider';

let paymentProviderInstance: IPaymentProvider | null = null;

export function getPaymentProvider(): IPaymentProvider {
  if (!paymentProviderInstance) {
    const providerType = process.env.TOUCHPAY_PROVIDER_TYPE || 'mock';
    if (providerType === 'touchpay') {
      paymentProviderInstance = new TouchPayProvider();
    } else {
      paymentProviderInstance = new MockTouchPayProvider();
    }
  }
  return paymentProviderInstance;
}

export default getPaymentProvider;

