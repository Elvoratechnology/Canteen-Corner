import { NextRequest, NextResponse } from 'next/server';
import { StripeProvider } from '@/lib/payments/StripeProvider';
import { logAuditAction } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const headersRecord: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headersRecord[key.toLowerCase()] = value;
    });

    const provider = new StripeProvider();
    const verification = await provider.verifyWebhook(headersRecord, rawBody);

    if (!verification.valid || !verification.payload) {
      console.warn('Stripe webhook signature verification failed:', verification.error);
      return NextResponse.json(
        { error: verification.error || 'Invalid Stripe signature' },
        { status: 401 }
      );
    }

    const { event, providerRef, idempotencyKey, amount, currency, status } = verification.payload;

    // Strict institutional currency gate
    if (currency && currency.toUpperCase() !== 'USD') {
      await logAuditAction({
        action: 'STRIPE_CURRENCY_MISMATCH_REJECTED',
        actorId: 'STRIPE_GATEWAY',
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

    // Verify event-specific completion state
    if (event === 'checkout.session.completed') {
      if (status !== 'paid') {
        await logAuditAction({
          action: 'STRIPE_UNPAID_SESSION_IGNORED',
          actorId: 'STRIPE_GATEWAY',
          actorRole: 'SYSTEM',
          resourceType: 'DEPOSIT',
          resourceId: providerRef,
          metadata: { paymentStatus: status, event },
        });
        return NextResponse.json({
          received: true,
          processed: false,
          status: 'UNPAID',
          message: `Checkout session completed with payment_status "${status}". Wallet crediting deferred.`,
        });
      }
    } else if (event === 'payment_intent.succeeded') {
      if (status !== 'succeeded') {
        await logAuditAction({
          action: 'STRIPE_INCOMPLETE_INTENT_IGNORED',
          actorId: 'STRIPE_GATEWAY',
          actorRole: 'SYSTEM',
          resourceType: 'DEPOSIT',
          resourceId: providerRef,
          metadata: { status, event },
        });
        return NextResponse.json({
          received: true,
          processed: false,
          status: 'NOT_SUCCEEDED',
          message: `PaymentIntent has status "${status}". Wallet not credited.`,
        });
      }
    } else {
      // Non-success or informational events
      await logAuditAction({
        action: 'STRIPE_PAYMENT_EVENT_RECEIVED',
        actorId: 'STRIPE_GATEWAY',
        actorRole: 'SYSTEM',
        resourceType: 'DEPOSIT',
        resourceId: providerRef,
        metadata: { event, status: 'NOT_PROCESSED' },
      });

      return NextResponse.json({ received: true, event, status: 'NOT_PROCESSED' });
    }

    // Process confirmation through shared engine
    const result = await provider.processPaymentConfirmation(providerRef, idempotencyKey, amount, currency);

    // Duplicate event acknowledged without error (idempotent HTTP 200)
    if (result.alreadyProcessed) {
      await logAuditAction({
        action: 'STRIPE_WEBHOOK_DUPLICATE_ACKNOWLEDGED',
        actorId: 'STRIPE_GATEWAY',
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
        action: 'STRIPE_CONFIRMATION_REJECTED',
        actorId: 'STRIPE_GATEWAY',
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
      action: 'STRIPE_WEBHOOK_PROCESSED',
      actorId: 'STRIPE_GATEWAY',
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
  } catch (error: any) {
    console.error('Stripe webhook handling error:', error);
    return NextResponse.json(
      { error: error.message || 'Stripe webhook processing failed.' },
      { status: 500 }
    );
  }
}
