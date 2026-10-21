import { Module } from '@nestjs/common';
import { PorteService } from './porte.service';
import { PorteResolver } from './porte.resolver';
import { PrismaService } from '../prisma.service';
import { StatisticModule } from '../statistic/statistic.module';
import { ImmeubleAccessModule } from '../immeuble/immeuble-access.module';

@Module({
  imports: [StatisticModule, ImmeubleAccessModule], // StatisticSyncService + ImmeubleAccessService
  providers: [PorteResolver, PorteService, PrismaService],
  exports: [PorteService],
})
export class PorteModule {}
