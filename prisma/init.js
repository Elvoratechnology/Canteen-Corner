/**
 * Canteen Corner — Normal Database Initialization Script
 * 
 * Sets up core facility tenant configuration and initial administrative provisioning account.
 * NEVER creates demo inmate accounts, sample orders, sample balances, or simulated transactions.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function init() {
  console.log('Initializing Canteen Corner database configuration...');

  // 1. Mandatory Facility System Configuration
  const facility = await prisma.facility.upsert({
    where: { id: 'FACILITY_CC_01' },
    update: {},
    create: {
      id: 'FACILITY_CC_01',
      name: 'Cumberland Regional Correctional Center',
      weeklyResetDay: 0, // Sunday
      giftPackagesEnabled: true,
      maxWeeklySpend: 100.0,
      maxDepositAmount: 300.0,
    },
  });
  console.log(`[INIT] Facility configuration ensured: ${facility.name} (${facility.id})`);

  // 2. Initial Institutional System Administrator
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@canteen.local';
  const existingAdmin = await prisma.user.findFirst({
    where: {
      OR: [
        { email: adminEmail },
        { role: 'ADMIN' },
      ],
    },
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('Admin123!', 10);
    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        staffId: 'ADM-01',
        name: 'Warden & System Administrator',
        passwordHash,
        role: 'ADMIN',
        facilityId: facility.id,
        emailVerified: true,
      },
    });
    console.log(`[INIT] System Administrator provisioned: ${adminUser.email} (${adminUser.role})`);
  } else {
    console.log(`[INIT] System Administrator already present: ${existingAdmin.email}`);
  }

  console.log('[INIT] Clean initialization complete. All portals start empty of operational data.');
}

init()
  .catch((e) => {
    console.error('[INIT ERROR]', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

