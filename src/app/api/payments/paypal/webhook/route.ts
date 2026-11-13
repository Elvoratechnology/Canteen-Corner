import { NextRequest, NextResponse } from 'next/server';
import { PayPalProvider } from '@/lib/payments/PayPalProvider';
import { logAuditAction } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const headersRecord: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headersRecord[key.toLowerCase()] = value;
    });

    const provider = new PayPalProvider();
    const verification = await provider.verifyWebhook(headersRecord, rawBody);

    if (!verification.valid || !verification.payload) {
      console.warn('PayPal webhook signature verification failed:', verification.error);
      return NextResponse.json(
        { error: verification.error || 'Invalid PayPal signature' },
        { status: 401 }
      );
    }

    const { event, providerRef, idempotencyKey, amount, currency } = verification.payload;

    // Strict institutional currency gate
    if (currency && currency.toUpperCase() !== 'USD') {
      await logAuditAction({
        action: 'PAYPAL_CURRENCY_MISMATCH_REJECTED',
        actorId: 'PAYPAL_GATEWAY',
        actorRole: 'SYSTEM',
        resourceType: 'DEPOSIT',
        resourceId: providerRef,
        metadata: { currency, status: 'REJECTED' },
      });
      return NextResponse.json(
        { received: true, processed: false, error: `Unsupported currency: ${currency}. Canteen Corner only accepts USD.` },
        { status: 400 }
      );
    }

    // Capture Safety Guard:
    // CHECKOUT.ORDER.APPROVED MUST NEVER credit wallet balances directly.
    if (event === 'CHECKOUT.ORDER.APPROVED') {
      await logAuditAction({
        action: 'PAYPAL_ORDER_APPROVED_AWAITING_CAPTURE',
        actorId: 'PAYPAL_GATEWAY',
        actorRole: 'SYSTEM',
        resourceType: 'DEPOSIT',
        resourceId: providerRef,
        metadata: { event, status: 'PENDING_CAPTURE' },
      });

      return NextResponse.json({
        received: true,
        processed: false,
        status: 'PENDING_CAPTURE',
        message: 'Order approved by customer; awaiting capture confirmation before crediting funds.',
      });
    }

    // Only PAYMENT.CAPTURE.COMPLETED is eligible for wallet crediting
    if (event === 'PAYMENT.CAPTURE.COMPLETED') {
      const result = await provider.processPaymentConfirmation(providerRef, idempotencyKey, amount, currency);

      // Handle duplicate webhook events gracefully (idempotent HTTP 200)
      if (result.alreadyProcessed) {
        await logAuditAction({
          action: 'PAYPAL_WEBHOOK_DUPLICATE_ACKNOWLEDGED',
          actorId: 'PAYPAL_GATEWAY',
          actorRole: 'SYSTEM',
          resourceType: 'DEPOSIT',
          resourceId: providerRef,
          metadata: { status: 'SUCCEEDED', duplicate: true, message: result.message },
        });

        return NextResponse.json({
          received: true,
          processed: false,
          duplicate: true,
          message: result.message,
        });
      }

      if (!result.success) {
        await logAuditAction({
          action: 'PAYPAL_CONFIRMATION_REJECTED',
          actorId: 'PAYPAL_GATEWAY',
          actorRole: 'SYSTEM',
          resourceType: 'DEPOSIT',
          resourceId: providerRef,
          metadata: { status: 'FAILED', message: result.message },
        });

        return NextResponse.json({
          received: true,
          processed: false,
          message: result.message,
        });
      }

      await logAuditAction({
        action: 'PAYPAL_WEBHOOK_PROCESSED',
        actorId: 'PAYPAL_GATEWAY',
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
    }

    // Informational or non-captured events
    await logAuditAction({
      action: 'PAYPAL_PAYMENT_EVENT_RECEIVED',
      actorId: 'PAYPAL_GATEWAY',
      actorRole: 'SYSTEM',
      resourceType: 'DEPOSIT',
      resourceId: providerRef,
      metadata: { event, status: 'NOT_PROCESSED' },
    });

    return NextResponse.json({ received: true, event, status: 'NOT_PROCESSED' });
  } catch (error: any) {
    console.error('PayPal webhook handling error:', error);
    return NextResponse.json(
      { error: error.message || 'PayPal webhook processing failed.' },
      { status: 500 }
    );
  }
}
