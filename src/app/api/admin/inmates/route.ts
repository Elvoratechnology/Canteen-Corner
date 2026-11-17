import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { logAuditAction } from '@/lib/audit';
import { toDecimal, toMoneyNumber, serializeOffender } from '@/lib/money';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Administrator privileges required.' }, { status: 403 });
    }

    const offenders = await prisma.offender.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        unit: true,
        housing: true,
        balance: true,
        weeklyLimit: true,
        currentWeeklySpent: true,
        failedPinAttempts: true,
        pinLockedUntil: true,
        createdAt: true,
        facility: { select: { id: true, name: true, maxWeeklySpend: true, maxDepositAmount: true } },
        _count: { select: { orders: true, deposits: true } },
      },
    });

    return NextResponse.json({ offenders: offenders.map(serializeOffender) });
  } catch (error) {
    console.error('Admin inmates GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

const InmateAdjustmentSchema = z.object({
  offenderId: z.string().min(1),
  action: z.enum(['ADJUST_BALANCE', 'UPDATE_LIMIT', 'RESET_PIN_LOCK', 'LOCK_PIN']),
  amount: z.number().optional(), // for ADJUST_BALANCE (positive for credit, negative for debit)
  newWeeklyLimit: z.number().positive().optional(),
  reason: z.string().min(3, 'Audit reason is required'),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Administrator privileges required.' }, { status: 403 });
    }

    const body = await req.json();
    const result = InmateAdjustmentSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.errors[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const { offenderId, action, amount, newWeeklyLimit, reason } = result.data;
    const offender = await prisma.offender.findUnique({ where: { id: offenderId } });
    if (!offender) {
      return NextResponse.json({ error: 'Inmate record not found' }, { status: 404 });
    }

    if (action === 'RESET_PIN_LOCK') {
      await prisma.offender.update({
        where: { id: offenderId },
        data: { failedPinAttempts: 0, pinLockedUntil: null, tokenVersion: { increment: 1 } },
      });

      await logAuditAction({
        action: 'ADMIN_RESET_INMATE_PIN_LOCK',
        actorId: session.userId || 'admin',
        actorRole: session.role,
        resourceType: 'OFFENDER',
        resourceId: offenderId,
        metadata: { reason },
      });

      return NextResponse.json({ success: true, message: `PIN lock cleared for ${offender.name}.` });
    }

    if (action === 'LOCK_PIN') {
      await prisma.offender.update({
        where: { id: offenderId },
        data: { pinLockedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), tokenVersion: { increment: 1 } },
      });

      await logAuditAction({
        action: 'ADMIN_LOCK_INMATE_PIN',
        actorId: session.userId || 'admin',
        actorRole: session.role,
        resourceType: 'OFFENDER',
        resourceId: offenderId,
        metadata: { reason },
      });

      return NextResponse.json({ success: true, message: `PIN locked for ${offender.name}.` });
    }

    if (action === 'UPDATE_LIMIT') {
      if (!newWeeklyLimit || newWeeklyLimit <= 0) {
        return NextResponse.json({ error: 'Valid weekly limit amount is required' }, { status: 400 });
      }

      const updated = await prisma.offender.update({
        where: { id: offenderId },
        data: { weeklyLimit: toDecimal(newWeeklyLimit!) },
      });

      await logAuditAction({
        action: 'ADMIN_UPDATE_WEEKLY_LIMIT',
        actorId: session.userId || 'admin',
        actorRole: session.role,
        resourceType: 'OFFENDER',
        resourceId: offenderId,
        metadata: { previousLimit: toMoneyNumber(offender.weeklyLimit), newLimit: newWeeklyLimit, reason },
      });

      return NextResponse.json({ success: true, offender: serializeOffender(updated) });
    }

    if (action === 'ADJUST_BALANCE') {
      if (amount === undefined || amount === 0) {
        return NextResponse.json({ error: 'Non-zero adjustment amount is required' }, { status: 400 });
      }

      const isCredit = amount > 0;
      const absAmount = Math.abs(amount);
      const absDecimal = toDecimal(absAmount);

      let previousBalance = toDecimal(0);
      let calculatedNewBalance = toDecimal(0);

      const updated = await prisma.$transaction(async (tx) => {
        if (!isCredit) {
          // Atomic conditional decrement: only deducts if balance >= absDecimal
          const updateResult = await tx.offender.updateMany({
            where: {
              id: offenderId,
              balance: { gte: absDecimal },
            },
            data: {
              balance: { decrement: absDecimal },
            },
          });

          if (updateResult.count === 0) {
            throw new Error('Adjustment would result in a negative balance.');
          }
        } else {
          // Atomic increment for credits
          await tx.offender.update({
            where: { id: offenderId },
            data: {
              balance: { increment: absDecimal },
            },
          });
        }

        // Read the exact post-atomic balance to record in ledger
        const off = await tx.offender.findUniqueOrThrow({
          where: { id: offenderId },
        });

        calculatedNewBalance = off.balance;
        previousBalance = isCredit
          ? calculatedNewBalance.minus(absDecimal)
          : calculatedNewBalance.plus(absDecimal);

        // Atomically create corresponding double-entry ledger entry
        await tx.ledgerEntry.create({
          data: {
            offenderId,
            type: 'ADJUSTMENT',
            credit: isCredit ? absDecimal : toDecimal(0),
            debit: !isCredit ? absDecimal : toDecimal(0),
            balanceBefore: previousBalance,
            balanceAfter: calculatedNewBalance,
            referenceType: 'MANUAL',
            referenceId: `ADMIN-ADJ-${Date.now()}`,
            description: `Admin balance adjustment: ${reason}`,
          },
        });

        return off;
      });

      // 5. Audit log after confirmed transaction commit
      await logAuditAction({
        action: 'ADMIN_ADJUST_BALANCE',
        actorId: session.userId || 'admin',
        actorRole: session.role,
        resourceType: 'OFFENDER',
        resourceId: offenderId,
        metadata: {
          previousBalance: toMoneyNumber(previousBalance),
          adjustment: amount,
          newBalance: toMoneyNumber(calculatedNewBalance),
          reason,
        },
      });

      return NextResponse.json({ success: true, offender: serializeOffender(updated) });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    if (error.message?.includes('negative balance') || error.message?.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Admin inmates PATCH error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

const CreateInmateSchema = z.object({
  id: z.string().trim().min(3, 'Offender ID is required (e.g. A1234567)'),
  name: z.string().trim().min(2, 'Name is required'),
  facilityId: z.string().min(1, 'Facility selection is required'),
  unit: z.string().trim().min(1, 'Housing unit is required (e.g. Unit 4)'),
  housing: z.string().trim().min(1, 'Cell location is required (e.g. Cell Block B - 204)'),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
  weeklyLimit: z.number().positive().optional().default(100.0),
  initialBalance: z.number().nonnegative().optional().default(0.0),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden: Administrator privileges required.' }, { status: 403 });
    }

    const body = await req.json();
    const result = CreateInmateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.errors[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const { id, name, facilityId, unit, housing, pin, weeklyLimit, initialBalance } = result.data;

    // Check facility exists
    const facility = await prisma.facility.findUnique({ where: { id: facilityId } });
    if (!facility) {
      return NextResponse.json({ error: 'Selected facility does not exist.' }, { status: 400 });
    }

    // Check offender ID collision
    const existing = await prisma.offender.findUnique({ where: { id } });
    if (existing) {
      return NextResponse.json({ error: `Inmate with ID ${id} is already registered.` }, { status: 400 });
    }

    const pinHash = await bcrypt.hash(pin, 10);

    const offender = await prisma.$transaction(async (tx) => {
      // 1. Create Inmate User record for unified authentication
      const user = await tx.user.create({
        data: {
          name,
          role: 'INMATE',
          facilityId,
          emailVerified: true,
        },
      });

      // 2. Create Offender record
      const off = await tx.offender.create({
        data: {
          id,
          userId: user.id,
          facilityId,
          name,
          unit,
          housing,
          pinHash,
          balance: toDecimal(initialBalance),
          weeklyLimit: toDecimal(weeklyLimit || facility.maxWeeklySpend || 100.0),
          currentWeeklySpent: toDecimal(0.0),
        },
        include: { facility: true },
      });

      // 3. Create initial ledger entry if initialBalance > 0
      if (initialBalance > 0) {
        const initDecimal = toDecimal(initialBalance);
        await tx.ledgerEntry.create({
          data: {
            offenderId: off.id,
            type: 'DEPOSIT',
            credit: initDecimal,
            debit: toDecimal(0.0),
            balanceBefore: toDecimal(0.0),
            balanceAfter: initDecimal,
            referenceType: 'MANUAL',
            referenceId: `INIT-DEP-${Date.now()}`,
            description: `Initial inmate commissary balance provisioned by Administrator`,
          },
        });
      }

      return off;
    });

    await logAuditAction({
      action: 'ADMIN_CREATE_INMATE',
      actorId: session.userId || 'admin',
      actorRole: session.role,
      resourceType: 'OFFENDER',
      resourceId: offender.id,
      metadata: { name, facilityId, unit, housing, initialBalance },
    });

    return NextResponse.json({ success: true, offender: serializeOffender(offender) }, { status: 201 });
  } catch (error: any) {
    console.error('Admin inmates POST error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}


