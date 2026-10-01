import { Prisma } from '@prisma/client';

/**
 * Les immeubles de comptes test restent visibles dans la supervision. Les
 * filtres de statut de l'interface permettent ensuite de les afficher ou non.
 */
export const prodImmeubleWhere: Prisma.ImmeubleWhereInput = {};
