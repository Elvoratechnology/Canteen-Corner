import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { logAuditAction } from '@/lib/audit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Administrator privileges required.' }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        staffId: true,
        name: true,
        role: true,
        facilityId: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        emailVerified: true,
        createdAt: true,
        facility: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Admin users GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

const CreateUserSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  email: z.string().email('Valid email is required'),
  role: z.enum(['WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR', 'ADMIN', 'FAMILY']),
  staffId: z.string().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  facilityId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Administrator privileges required.' }, { status: 403 });
    }

    const body = await req.json();
    const result = CreateUserSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.errors[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const { name, email, role, staffId, password, facilityId } = result.data;
    const lowerEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: lowerEmail },
          ...(staffId ? [{ staffId: staffId.toUpperCase() }] : []),
        ],
      },
    });

    if (existing) {
      return NextResponse.json({ error: 'A user with that email or staff ID already exists.' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email: lowerEmail,
        role,
        staffId: staffId ? staffId.toUpperCase() : null,
        passwordHash,
        facilityId: facilityId || null,
        emailVerified: true,
      },
    });

    await logAuditAction({
      action: 'ADMIN_CREATE_USER',
      actorId: session.userId || 'admin',
      actorRole: session.role,
      resourceType: 'USER',
      resourceId: user.id,
      metadata: { email: user.email, role: user.role, staffId: user.staffId },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        staffId: user.staffId,
      },
    });
  } catch (error: any) {
    console.error('Admin users POST error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

const UpdateUserSchema = z.object({
  userId: z.string().min(1),
  action: z.enum(['UNLOCK', 'LOCK', 'CHANGE_ROLE']),
  newRole: z.enum(['WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR', 'ADMIN']).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Administrator privileges required.' }, { status: 403 });
    }

    const body = await req.json();
    const result = UpdateUserSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.errors[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const { userId, action, newRole } = result.data;
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Admin self-action protections: prevent self-lockout or self-demotion
    const isSelfAction =
      (session.userId && targetUser.id === session.userId) ||
      (session.email && targetUser.email?.toLowerCase() === session.email.toLowerCase()) ||
      (session.staffId && targetUser.staffId?.toUpperCase() === session.staffId.toUpperCase());

    if (isSelfAction) {
      if (action === 'LOCK') {
        return NextResponse.json(
          { error: 'Administrative self-lockout is prohibited. You cannot lock your own account.' },
          { status: 400 }
        );
      }
      if (action === 'CHANGE_ROLE' && newRole && newRole !== 'ADMIN') {
        return NextResponse.json(
          { error: 'Administrative self-demotion is prohibited. You cannot remove your own administrator privileges.' },
          { status: 400 }
        );
      }
    }

    let updateData: any = {};
    if (action === 'UNLOCK') {
      updateData = { failedLoginAttempts: 0, lockedUntil: null };
    } else if (action === 'LOCK') {
      updateData = { lockedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) };
    } else if (action === 'CHANGE_ROLE' && newRole) {
      updateData = { role: newRole };
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    await logAuditAction({
      action: `ADMIN_USER_${action}`,
      actorId: session.userId || 'admin',
      actorRole: session.role,
      resourceType: 'USER',
      resourceId: userId,
      metadata: { previousRole: targetUser.role, updateData },
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (error: any) {
    console.error('Admin users PATCH error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

