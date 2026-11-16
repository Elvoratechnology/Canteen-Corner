import { beforeAll } from 'vitest';

beforeAll(async () => {
  // Automatically provision required test fixtures during vitest execution
  // so tests pass without requiring permanently preloaded demo records in the database.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { seedDemo } = require('../prisma/seed-demo.js');
  await seedDemo();
});

