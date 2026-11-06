import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';
import { signSession } from '@/lib/auth';
import { logAuditAction } from '@/lib/audit';
import { z } from 'zod';

const FamilyRegisterSchema = z.object({
  name: z.string().trim().min(2, 'Full name is required'),
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  relationship: z.string().default('Family/Friend'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = FamilyRegisterSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0]?.message || 'Invalid input data' },
        { status: 400 }
      );
    }

    const { name, email, password, relationship } = result.data;
    const normalizedEmail = email.toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email address already exists.' },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        passwordHash,
        role: 'FAMILY',
        emailVerified: true, // Auto-verified for seamless demonstration
        familyAccount: {
          create: {
            relationship,
            verifiedAt: new Date(),
          },
        },
      },
      include: {
        familyAccount: true,
      },
    });

    const token = await signSession({
      userId: user.id,
      name: user.name,
      email: user.email || '',
      role: 'FAMILY',
    });

    await logAuditAction({
      action: 'FAMILY_REGISTER_SUCCESS',
      actorId: user.id,
      actorRole: 'FAMILY',
      resourceType: 'USER',
      resourceId: user.id,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Account created and verified successfully.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

    response.cookies.set('canteen_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 4 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error('Family registration error:', error);
    return NextResponse.json(
      { error: 'An unexpected server error occurred during registration.' },
      { status: 500 }
    );
  }
}

