/**
 * Canteen Corner — Development-Only Demo Data Seeding Script
 * 
 * STRICT SECURITY RESTRICTION:
 * This script is exclusively intended for local development prototyping and manual verification.
 * Execution is unconditionally blocked in Production and Staging environments.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedDemo() {
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
    console.error('SECURITY ERROR: Demo data seeding is strictly prohibited in production and staging environments.');
    process.exit(1);
  }

  console.log('Seeding Canteen Corner development demo records...');

  // 1. Ensure Facility
  const facility = await prisma.facility.upsert({
    where: { id: 'FACILITY_CC_01' },
    update: {},
    create: {
      id: 'FACILITY_CC_01',
      name: 'Cumberland Regional Correctional Center',
      weeklyResetDay: 0,
      giftPackagesEnabled: true,
      maxWeeklySpend: 100.0,
      maxDepositAmount: 300.0,
    },
  });

  const pinHash = await bcrypt.hash('1234', 10);
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const staffPasswordHash = await bcrypt.hash('Staff123!', 10);
  const adminPasswordHash = await bcrypt.hash('Admin123!', 10);

  // 2. Demo Admin User
  await prisma.user.upsert({
    where: { email: 'admin@canteen.local' },
    update: { passwordHash: adminPasswordHash },
    create: {
      email: 'admin@canteen.local',
      staffId: 'ADM-01',
      name: 'Warden & System Administrator',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      facilityId: facility.id,
      emailVerified: true,
    },
  });

  // 3. Demo Inmate User & Offender Record
  const inmateUser = await prisma.user.upsert({
    where: { id: 'usr_inmate_john' },
    update: {},
    create: {
      id: 'usr_inmate_john',
      name: 'John Smith',
      role: 'INMATE',
      emailVerified: true,
    },
  });

  const offender = await prisma.offender.upsert({
    where: { id: 'A1234567' },
    update: {
      balance: 82.50,
      weeklyLimit: 100.00,
      currentWeeklySpent: 0.00,
    },
    create: {
      id: 'A1234567',
      userId: inmateUser.id,
      facilityId: facility.id,
      name: 'John Smith',
      unit: 'Unit 4',
      housing: 'Cell Block B - 204',
      pinHash: pinHash,
      balance: 82.50,
      weeklyLimit: 100.00,
      currentWeeklySpent: 0.00,
    },
  });

  // Initial balance ledger entry for John Smith
  await prisma.ledgerEntry.deleteMany({ where: { offenderId: offender.id } });
  await prisma.ledgerEntry.create({
    data: {
      offenderId: offender.id,
      type: 'DEPOSIT',
      debit: 0.0,
      credit: 82.50,
      balanceBefore: 0.0,
      balanceAfter: 82.50,
      referenceType: 'DEPOSIT',
      referenceId: 'DEP-INIT-8250',
      description: 'Initial commissary account balance deposit via electronic payment',
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
  });

  // 4. Products from specification
  const productsData = [
    { sku: 'SNK-001', name: 'Ramen noodles', category: 'Snacks', price: 1.50, stock: 120, reorderLevel: 25, description: 'Instant chicken flavor noodles, 3oz package.' },
    { sku: 'SNK-002', name: 'Peanut butter', category: 'Snacks', price: 2.50, stock: 45, reorderLevel: 15, description: 'Creamy peanut butter, 16oz jar.' },
    { sku: 'BEV-001', name: 'Coffee', category: 'Beverages', price: 5.00, stock: 60, reorderLevel: 20, description: '100% Colombian freeze-dried instant coffee, 3oz.' },
    { sku: 'SNK-003', name: 'Biscuits', category: 'Snacks', price: 1.20, stock: 80, reorderLevel: 20, description: 'Crispy butter sandwich cookies, 6-pack.' },
    { sku: 'PC-001', name: 'Toothpaste', category: 'Personal Care', price: 1.80, stock: 50, reorderLevel: 15, description: 'Fluoride mint toothpaste, 4.2oz tube.' },
    { sku: 'PC-002', name: 'Bar soap', category: 'Personal Care', price: 2.00, stock: 95, reorderLevel: 30, description: 'Antibacterial deodorant cleansing bar, 4oz.' },
    { sku: 'STN-001', name: 'Writing pad', category: 'Stationery', price: 1.50, stock: 70, reorderLevel: 20, description: 'Standard lined 50-sheet legal writing pad.' },
    { sku: 'STN-002', name: 'Envelopes (10)', category: 'Stationery', price: 1.00, stock: 110, reorderLevel: 25, description: 'Pack of 10 security-tinted white mailing envelopes.' },
    { sku: 'HW-001', name: 'Vitamins', category: 'Health & Wellness', price: 4.50, stock: 40, reorderLevel: 10, description: 'Daily multivitamin dietary supplement, 30 tablets.' },
  ];

  for (const item of productsData) {
    await prisma.product.upsert({
      where: { sku: item.sku },
      update: {
        price: item.price,
        stock: item.stock,
        reorderLevel: item.reorderLevel,
      },
      create: item,
    });
  }

  // 5. Past delivered orders for John Smith
  await prisma.orderItem.deleteMany({ where: { order: { offenderId: offender.id } } });
  await prisma.orderStatusHistory.deleteMany({ where: { order: { offenderId: offender.id } } });
  await prisma.pickingList.deleteMany({ where: { order: { offenderId: offender.id } } });
  await prisma.order.deleteMany({ where: { offenderId: offender.id } });

  const ramen = await prisma.product.findUnique({ where: { sku: 'SNK-001' } });
  const coffee = await prisma.product.findUnique({ where: { sku: 'BEV-001' } });
  const soap = await prisma.product.findUnique({ where: { sku: 'PC-002' } });
  const biscuits = await prisma.product.findUnique({ where: { sku: 'SNK-003' } });
  const toothpaste = await prisma.product.findUnique({ where: { sku: 'PC-001' } });
  const pb = await prisma.product.findUnique({ where: { sku: 'SNK-002' } });

  const pastOrders = [
    {
      orderNumber: '#24512',
      total: 22.00,
      subtotal: 22.00,
      deliveredDaysAgo: 14,
      items: [
        { product: coffee, quantity: 2, unitPrice: 5.00 },
        { product: ramen, quantity: 4, unitPrice: 1.50 },
        { product: soap, quantity: 3, unitPrice: 2.00 },
      ],
    },
    {
      orderNumber: '#24110',
      total: 17.25,
      subtotal: 17.25,
      deliveredDaysAgo: 21,
      items: [
        { product: pb, quantity: 3, unitPrice: 2.50 },
        { product: biscuits, quantity: 4, unitPrice: 1.20 },
        { product: ramen, quantity: 3, unitPrice: 1.65 },
      ],
    },
    {
      orderNumber: '#23780',
      total: 20.50,
      subtotal: 20.50,
      deliveredDaysAgo: 28,
      items: [
        { product: coffee, quantity: 2, unitPrice: 5.00 },
        { product: toothpaste, quantity: 3, unitPrice: 1.80 },
        { product: soap, quantity: 2, unitPrice: 2.00 },
        { product: biscuits, quantity: 1, unitPrice: 1.10 },
      ],
    },
  ];

  for (const ord of pastOrders) {
    const createdDate = new Date(Date.now() - ord.deliveredDaysAgo * 24 * 60 * 60 * 1000);
    const deliveredDate = new Date(createdDate.getTime() + 2 * 24 * 60 * 60 * 1000);

    const orderRecord = await prisma.order.create({
      data: {
        orderNumber: ord.orderNumber,
        offenderId: offender.id,
        status: 'DELIVERED',
        subtotal: ord.subtotal,
        total: ord.total,
        expectedDeliveryDate: deliveredDate,
        deliveredAt: deliveredDate,
        barcode: `BC-${ord.orderNumber.replace('#', '')}`,
        createdAt: createdDate,
      },
    });

    for (const item of ord.items) {
      if (item.product) {
        await prisma.orderItem.create({
          data: {
            orderId: orderRecord.id,
            productId: item.product.id,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.unitPrice * item.quantity,
          },
        });
      }
    }

    await prisma.orderStatusHistory.create({
      data: {
        orderId: orderRecord.id,
        newStatus: 'DELIVERED',
        changedBy: 'SYSTEM_DELIVERY_DISPATCH',
        notes: 'Order delivered to inmate housing block B.',
        createdAt: deliveredDate,
      },
    });
  }

  // 6. Demo Family Account
  const familyUser = await prisma.user.upsert({
    where: { email: 'family@canteen.local' },
    update: { passwordHash: passwordHash },
    create: {
      email: 'family@canteen.local',
      name: 'Sarah Smith',
      passwordHash: passwordHash,
      role: 'FAMILY',
      emailVerified: true,
    },
  });

  const familyAccount = await prisma.familyAccount.upsert({
    where: { userId: familyUser.id },
    update: {},
    create: {
      userId: familyUser.id,
      relationship: 'Sister',
      verifiedAt: new Date(),
    },
  });

  await prisma.familyOffenderLink.upsert({
    where: {
      familyAccountId_offenderId: {
        familyAccountId: familyAccount.id,
        offenderId: offender.id,
      },
    },
    update: { status: 'APPROVED' },
    create: {
      familyAccountId: familyAccount.id,
      offenderId: offender.id,
      relationship: 'Sister',
      status: 'APPROVED',
    },
  });

  await prisma.deposit.upsert({
    where: { providerRef: 'cs_init_982412' },
    update: {},
    create: {
      offenderId: offender.id,
      familyAccountId: familyAccount.id,
      amount: 50.00,
      fee: 3.50,
      totalPaid: 53.50,
      provider: 'STRIPE',
      providerRef: 'cs_init_982412',
      status: 'SUCCEEDED',
      idempotencyKey: 'idemp-init-982412',
      completedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
  });

  // 7. Demo Warehouse Staff Accounts
  await prisma.user.upsert({
    where: { email: 'picker@canteen.local' },
    update: { passwordHash: staffPasswordHash, facilityId: facility.id },
    create: {
      email: 'picker@canteen.local',
      staffId: 'STF-01',
      name: 'Marcus Miller (Picker)',
      passwordHash: staffPasswordHash,
      role: 'WAREHOUSE_PICKER',
      facilityId: facility.id,
      emailVerified: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'supervisor@canteen.local' },
    update: { passwordHash: staffPasswordHash, facilityId: facility.id },
    create: {
      email: 'supervisor@canteen.local',
      staffId: 'STF-02',
      name: 'Chief Linda Vance (Supervisor)',
      passwordHash: staffPasswordHash,
      role: 'WAREHOUSE_SUPERVISOR',
      facilityId: facility.id,
      emailVerified: true,
    },
  });

  // 8. Notifications
  await prisma.notification.deleteMany({ where: { offenderId: offender.id } });
  await prisma.notification.createMany({
    data: [
      {
        offenderId: offender.id,
        type: 'FACILITY_NOTICE',
        title: 'Commissary Schedule Reminder',
        message: 'Order submissions close each Monday at 18:00. Deliveries occur on Thursday.',
        read: false,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        offenderId: offender.id,
        type: 'DEPOSIT_RECEIVED',
        title: 'Funds Received via Stripe',
        message: 'A deposit of $50.00 from Sarah Smith has posted to your commissary account.',
        read: false,
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
      {
        offenderId: offender.id,
        type: 'ORDER_STATUS',
        title: 'Order Delivered (#24512)',
        message: 'Your commissary package was delivered to Unit 4 housing on schedule.',
        read: true,
        createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
      },
    ],
  });

  console.log('[SEED:DEMO] Demo dataset successfully seeded for local testing.');
}

if (require.main === module) {
  seedDemo()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { seedDemo };

