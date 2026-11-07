import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';
import { signSession } from '@/lib/auth';
import { logAuditAction } from '@/lib/audit';
import { z } from 'zod';

const WarehouseLoginSchema = z.object({
  identifier: z.string().trim().min(1, 'Staff ID or Email is required'),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = WarehouseLoginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { identifier, password } = result.data;
    const lowerId = identifier.toLowerCase();

    // Staff can log in with their email or their Staff ID (e.g. STF-01)
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: lowerId },
          { staffId: identifier.toUpperCase() },
        ],
        role: {
          in: ['WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR', 'ADMIN'],
        },
      },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: 'Invalid Staff ID/Email or Password.' },
        { status: 401 }
      );
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return NextResponse.json(
        { error: 'Account is temporarily locked. Please contact the commissary supervisor.' },
        { status: 423 }
      );
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      const attempts = user.failedLoginAttempts + 1;
      let lockUntil: Date | null = null;
      if (attempts >= 5) {
        lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: attempts, lockedUntil: lockUntil },
      });

      return NextResponse.json(
        { error: 'Invalid Staff ID/Email or Password.' },
        { status: 401 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    const token = await signSession({
      userId: user.id,
      name: user.name,
      email: user.email || '',
      staffId: user.staffId || undefined,
      facilityId: (user as any).facilityId || undefined,
      role: user.role as any,
    });

    await logAuditAction({
      action: 'WAREHOUSE_LOGIN_SUCCESS',
      actorId: user.id,
      actorRole: user.role,
      resourceType: 'USER',
      resourceId: user.id,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        staffId: user.staffId,
        role: user.role,
      },
    });

    response.cookies.set('canteen_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60, // 8 hour staff shift
    });

    return response;
  } catch (error) {
    console.error('Warehouse login error:', error);
    return NextResponse.json(
      { error: 'An unexpected server error occurred.' },
      { status: 500 }
    );
  }
}

