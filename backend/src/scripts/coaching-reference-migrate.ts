/**
 * Migration unique vers le référentiel coaching : le plan actif et les fiches actives
 * deviennent le référentiel v1, publié et actif. Idempotent : sans effet si un
 * référentiel existe déjà. Lancer après `prisma migrate deploy` :
 *   node dist/src/scripts/coaching-reference-migrate.js
 */
import { PrismaService } from '../prisma.service';
import { CoachingApiClient } from '../coaching/coaching-api.client';
import { ReferenceService } from '../coaching/referentiels/reference.service';

async function main() {
  const prisma = new PrismaService();
  try {
    const result = await new ReferenceService(prisma, new CoachingApiClient()).migrateLegacy();
    console.log(JSON.stringify(result));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: Error) => {
  console.error(`Migration du référentiel échouée : ${error.message}`);
  process.exit(1);
});
