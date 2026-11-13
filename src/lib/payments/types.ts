export type SupportedPaymentProvider = 'STRIPE' | 'PAYPAL';

export interface PaymentIntentRequest {
  amount: number;
  offenderId: string;
  familyAccountId?: string;
  idempotencyKey: string;
  customerEmail: string;
  provider?: SupportedPaymentProvider;
}

export interface PaymentIntentResponse {
  provider: SupportedPaymentProvider;
  providerRef: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  amount: number;
  fee: number;
  totalPaid: number;
  checkoutUrl?: string;
  clientSecret?: string;
  instructions?: string;
  sessionParams?: Record<string, unknown>;
}

export interface PaymentWebhookPayload {
  event: string;
  provider: SupportedPaymentProvider;
  providerRef: string;
  idempotencyKey: string;
  amount: number;
  fee: number;
  totalPaid: number;
  currency: string;
  status?: string;
  offenderId?: string;
  familyAccountId?: string;
  timestamp: string;
  signature?: string;
  metadata?: Record<string, unknown>;
}

export interface WebhookVerificationResult {
  valid: boolean;
  payload?: PaymentWebhookPayload;
  error?: string;
}

export interface IPaymentProvider {
  readonly providerName: SupportedPaymentProvider;
  createPaymentIntent(req: PaymentIntentRequest): Promise<PaymentIntentResponse>;
  verifyWebhook(headers: Record<string, string>, rawBody: string): Promise<WebhookVerificationResult>;
  processPaymentConfirmation(
    providerRef: string,
    idempotencyKey: string,
    verifiedAmount?: number
  ): Promise<{ success: boolean; message: string }>;
  getPaymentStatus(providerRef: string): Promise<'PENDING' | 'SUCCEEDED' | 'FAILED'>;
}
