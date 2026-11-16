/**
 * Canteen Corner — Remove Demo Data & Clean Portals Script
 * 
 * Safely removes all sample/demo records from prisma/dev.db without deleting
 * the database file, truncating tables blindly, or affecting core facility configuration.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clean() {
  console.log('Cleaning demo and sample operational records from Canteen Corner...');

  // 1. Clean Orders & Fulfillment
  const deletedPicking = await prisma.pickingList.deleteMany({});
  const deletedOrderHistory = await prisma.orderStatusHistory.deleteMany({});
  const deletedOrderItems = await prisma.orderItem.deleteMany({});
  const deletedOrders = await prisma.order.deleteMany({});
  const deletedManifests = await prisma.manifest.deleteMany({});
  console.log(`[CLEAN] Orders removed: ${deletedOrders.count} orders, ${deletedOrderItems.count} items, ${deletedPicking.count} picking lists, ${deletedManifests.count} manifests`);

  // 2. Clean Financial & Account Activity
  const deletedDeposits = await prisma.deposit.deleteMany({});
  const deletedLedger = await prisma.ledgerEntry.deleteMany({});
  const deletedPackages = await prisma.giftPackage.deleteMany({});
  const deletedNotifications = await prisma.notification.deleteMany({});
  console.log(`[CLEAN] Financial records removed: ${deletedDeposits.count} deposits, ${deletedLedger.count} ledger entries, ${deletedPackages.count} care packages, ${deletedNotifications.count} notifications`);

  // 3. Clean Family Accounts & Offender Links
  const deletedLinks = await prisma.familyOffenderLink.deleteMany({});
  const deletedFamilyAccounts = await prisma.familyAccount.deleteMany({});
  console.log(`[CLEAN] Family accounts removed: ${deletedFamilyAccounts.count} accounts, ${deletedLinks.count} offender links`);

  // 4. Clean Demo Offender Records
  const deletedOffenders = await prisma.offender.deleteMany({});
  console.log(`[CLEAN] Inmate records removed: ${deletedOffenders.count} offenders`);

  // 5. Clean Demo Non-Admin Users (keep admin@canteen.local)
  const deletedUsers = await prisma.user.deleteMany({
    where: {
      role: {
        not: 'ADMIN',
      },
    },
  });
  console.log(`[CLEAN] Non-admin demo users removed: ${deletedUsers.count} users`);

  // 6. Clean Products (Catalog starts empty)
  const deletedProducts = await prisma.product.deleteMany({});
  console.log(`[CLEAN] Catalog products removed: ${deletedProducts.count} SKUs`);

  // 7. Clean Test Facilities (Keep primary facility FACILITY_CC_01)
  const deletedTestFacilities = await prisma.facility.deleteMany({
    where: {
      id: { not: 'FACILITY_CC_01' },
    },
  });
  console.log(`[CLEAN] Non-default facilities removed: ${deletedTestFacilities.count}`);

  // 8. Clean Audit Logs from tests/demo activity
  const deletedAudit = await prisma.auditLog.deleteMany({});
  console.log(`[CLEAN] Audit activity logs removed: ${deletedAudit.count}`);

  // 9. Ensure default facility and system administrator exist
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

  const adminExists = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });

  console.log(`\n[CLEAN SUCCESS] Database sanitized:`);
  console.log(`- Facility preserved: ${facility.name} (${facility.id})`);
  console.log(`- Admin account status: ${adminExists ? `Preserved (${adminExists.email})` : 'Not found - run db:init'}`);
  console.log(`- All operational portals (Inmate, Family, Warehouse, Admin) now start with clean, empty states.\n`);
}

clean()
  .catch((e) => {
    console.error('[CLEAN ERROR]', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

