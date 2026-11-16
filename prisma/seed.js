/**
 * Canteen Corner — Prisma Seed Router
 * 
 * Default invocation (e.g. `npx prisma db seed`, `npm run db:seed`) runs clean normal initialization.
 * Development demo data is ONLY seeded when explicitly requested via `--demo` flag
 * (e.g. `npm run db:seed:demo`).
 */
if (process.argv.includes('--demo')) {
  require('./seed-demo.js');
} else {
  require('./init.js');
}
