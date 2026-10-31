import { PrismaClient } from '@prisma/client';
import { syncCatalog } from './catalog-sync';

const prisma = new PrismaClient();
syncCatalog(prisma, { availableImagesOnly: process.argv.includes('--available-images') })
  .then((result) => console.log(`Catalog updated: ${JSON.stringify(result)}`))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Catalog update failed');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
