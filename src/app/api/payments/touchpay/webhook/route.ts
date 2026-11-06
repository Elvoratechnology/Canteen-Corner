import { NextRequest, NextResponse } from 'next/server';
import { getPaymentProvider } from '@/lib/payments';
import { logAuditAction } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const headersRecord: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headersRecord[key.toLowerCase()] = value;
    });

    const provider = getPaymentProvider();
    const verification = await provider.verifyWebhook(headersRecord, rawBody);

    if (!verification.valid || !verification.payload) {
      console.warn('TouchPay webhook signature verification failed:', verification.error);
      return NextResponse.json(
        { error: verification.error || 'Invalid signature' },
        { status: 401 }
      );
    }

    const { event, providerRef, idempotencyKey } = verification.payload;

    if (event === 'payment.succeeded') {
      const result = await provider.processPaymentConfirmation(providerRef, idempotencyKey);

      await logAuditAction({
        action: 'TOUCHPAY_WEBHOOK_PROCESSED',
        actorId: 'TOUCHPAY_GATEWAY',
        actorRole: 'SYSTEM',
        resourceType: 'DEPOSIT',
        resourceId: providerRef,
        metadata: { status: 'SUCCEEDED', message: result.message },
      });

      return NextResponse.json({
        received: true,
        processed: true,
        message: result.message,
      });
    } else {
      // Payment failed
      await logAuditAction({
        action: 'TOUCHPAY_PAYMENT_FAILED',
        actorId: 'TOUCHPAY_GATEWAY',
        actorRole: 'SYSTEM',
        resourceType: 'DEPOSIT',
        resourceId: providerRef,
        metadata: { status: 'FAILED' },
      });

      return NextResponse.json({ received: true, status: 'FAILED' });
    }
  } catch (error: any) {
    console.error('TouchPay webhook handling error:', error);
    return NextResponse.json(
      { error: error.message || 'Webhook processing failed.' },
      { status: 500 }
    );
  }
}

