import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || session.role !== 'FAMILY') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const familyAccount = await prisma.familyAccount.findUnique({
      where: { userId: session.userId },
    });

    if (!familyAccount) {
      return NextResponse.json({ deposits: [] });
    }

    const deposits = await prisma.deposit.findMany({
      where: { familyAccountId: familyAccount.id },
      orderBy: { createdAt: 'desc' },
      include: {
        offender: {
          select: {
            id: true,
            name: true,
            unit: true,
          },
        },
      },
    });

    return NextResponse.json({ deposits });
  } catch (error) {
    console.error('Error fetching family deposits:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

