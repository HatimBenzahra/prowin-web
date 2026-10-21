import { Module } from '@nestjs/common';
import { ImmeubleAccessService } from './immeuble-access.service';
import { PrismaService } from '../prisma.service';

/**
 * Module dédié au contrôle d'accès des immeubles : importé par les modules
 * porte, statistic et recording sans dépendre de tout ImmeubleModule (qui
 * importe lui-même StatisticModule).
 */
@Module({
  providers: [ImmeubleAccessService, PrismaService],
  exports: [ImmeubleAccessService],
})
export class ImmeubleAccessModule {}
