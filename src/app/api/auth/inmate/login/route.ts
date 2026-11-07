import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';
import { signSession } from '@/lib/auth';
import { logAuditAction } from '@/lib/audit';
import { z } from 'zod';

const InmateLoginSchema = z.object({
  offenderId: z.string().trim().min(1, 'Offender ID is required'),
  pin: z.string().trim().min(4, 'PIN must be at least 4 digits'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = InmateLoginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { offenderId, pin } = result.data;
    const normalizedId = offenderId.toUpperCase();

    const offender = await prisma.offender.findUnique({
      where: { id: normalizedId },
      include: { facility: true },
    });

    if (!offender) {
      return NextResponse.json(
        { error: 'Invalid Offender ID or PIN. Need help? Contact Unit Staff.' },
        { status: 401 }
      );
    }

    // Check account lockout
    if (offender.pinLockedUntil && offender.pinLockedUntil > new Date()) {
      const minutesRemaining = Math.ceil(
        (offender.pinLockedUntil.getTime() - Date.now()) / (1000 * 60)
      );
      return NextResponse.json(
        {
          error: `Account is temporarily locked due to multiple failed attempts. Please try again in ${minutesRemaining} minutes or contact unit staff.`,
        },
        { status: 423 }
      );
    }

    // Verify PIN
    const isPinValid = await bcrypt.compare(pin, offender.pinHash);

    if (!isPinValid) {
      const failedAttempts = offender.failedPinAttempts + 1;
      let lockUntil: Date | null = null;
      if (failedAttempts >= 3) {
        lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 min lockout
      }

      await prisma.offender.update({
        where: { id: offender.id },
        data: {
          failedPinAttempts: failedAttempts,
          pinLockedUntil: lockUntil,
        },
      });

      await logAuditAction({
        action: 'INMATE_LOGIN_FAILED',
        actorId: offender.id,
        actorRole: 'INMATE',
        resourceType: 'OFFENDER',
        resourceId: offender.id,
        metadata: { attempts: failedAttempts },
      });

      return NextResponse.json(
        { error: 'Invalid Offender ID or PIN. Need help? Contact Unit Staff.' },
        { status: 401 }
      );
    }

    // Reset failed attempts on success
    await prisma.offender.update({
      where: { id: offender.id },
      data: {
        failedPinAttempts: 0,
        pinLockedUntil: null,
      },
    });

    const token = await signSession({
      offenderId: offender.id,
      name: offender.name,
      role: 'INMATE',
      facilityId: offender.facilityId,
    });

    await logAuditAction({
      action: 'INMATE_LOGIN_SUCCESS',
      actorId: offender.id,
      actorRole: 'INMATE',
      resourceType: 'OFFENDER',
      resourceId: offender.id,
    });

    const response = NextResponse.json({
      success: true,
      offender: {
        id: offender.id,
        name: offender.name,
        unit: offender.unit,
        housing: offender.housing,
        balance: offender.balance,
        weeklyLimit: offender.weeklyLimit,
      },
    });

    response.cookies.set('canteen_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 60, // 30 mins session timeout for kiosk/inmate safety
    });

    return response;
  } catch (error) {
    console.error('Inmate login error:', error);
    return NextResponse.json(
      { error: 'An unexpected server error occurred.' },
      { status: 500 }
    );
  }
}

