import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';
import { signSession } from '@/lib/auth';
import { logAuditAction } from '@/lib/audit';
import { z } from 'zod';

const AdminLoginSchema = z.object({
  identifier: z.string().trim().min(1, 'Admin Email or Staff ID is required'),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = AdminLoginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { identifier, password } = result.data;
    const lowerId = identifier.toLowerCase();

    // Look for user by email or staffId
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: lowerId },
          { staffId: identifier.toUpperCase() },
        ],
      },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: 'Invalid Administrator credentials.' },
        { status: 401 }
      );
    }

    // Role-Based Authentication Boundary: Enforce ADMIN role
    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Access denied: User account lacks Administrator privileges.' },
        { status: 403 }
      );
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return NextResponse.json(
        { error: 'Account is temporarily locked. Please contact the security administrator.' },
        { status: 423 }
      );
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      const attempts = user.failedLoginAttempts + 1;
      let lockUntil: Date | null = null;
      if (attempts >= 5) {
        lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15-minute lockout
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: attempts, lockedUntil: lockUntil },
      });

      return NextResponse.json(
        { error: 'Invalid Administrator credentials.' },
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
      facilityId: user.facilityId || undefined,
      role: 'ADMIN',
    });

    await logAuditAction({
      action: 'ADMIN_LOGIN_SUCCESS',
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
      maxAge: 4 * 60 * 60, // 4 hours
    });

    return response;
  } catch (error) {
    console.error('Admin login error:', error);
    return NextResponse.json({ error: 'Server error during authentication' }, { status: 500 });
  }
}

