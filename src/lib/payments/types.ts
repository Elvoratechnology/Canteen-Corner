export interface PaymentIntentRequest {
  amount: number;
  offenderId: string;
  familyAccountId?: string;
  idempotencyKey: string;
  customerEmail: string;
}

export interface PaymentIntentResponse {
  providerRef: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  amount: number;
  fee: number;
  totalPaid: number;
  checkoutUrl?: string;
  instructions?: string;
}

export interface TouchPayWebhookPayload {
  event: 'payment.succeeded' | 'payment.failed';
  providerRef: string;
  idempotencyKey: string;
  amount: number;
  fee: number;
  totalPaid: number;
  offenderId: string;
  familyAccountId?: string;
  timestamp: string;
  signature?: string;
}

export interface WebhookVerificationResult {
  valid: boolean;
  payload?: TouchPayWebhookPayload;
  error?: string;
}

export interface IPaymentProvider {
  createPaymentIntent(req: PaymentIntentRequest): Promise<PaymentIntentResponse>;
  verifyWebhook(headers: Record<string, string>, rawBody: string): Promise<WebhookVerificationResult>;
  processPaymentConfirmation(
    providerRef: string,
    idempotencyKey: string,
    verifiedAmount?: number
  ): Promise<{ success: boolean; message: string }>;
  getPaymentStatus(providerRef: string): Promise<'PENDING' | 'SUCCEEDED' | 'FAILED'>;
}

