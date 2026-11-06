import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { logAuditAction } from '@/lib/audit';
import { z } from 'zod';

const ForgotPasswordSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = ForgotPasswordSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Valid email is required' },
        { status: 400 }
      );
    }

    const { email } = result.data;
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (user && user.role === 'FAMILY') {
      await logAuditAction({
        action: 'PASSWORD_RESET_REQUESTED',
        actorId: user.id,
        actorRole: 'FAMILY',
        resourceType: 'USER',
        resourceId: user.id,
      });
    }

    // Always return success for security (prevent email enumeration)
    return NextResponse.json({
      success: true,
      message: 'If an account exists with this email, password reset instructions have been sent.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: 'Failed to process password reset.' },
      { status: 500 }
    );
  }
}

