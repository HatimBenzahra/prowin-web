import { Module } from '@nestjs/common';
import { StatisticService } from './statistic.service';
import { StatisticSyncService } from './statistic-sync.service';
import { StatisticResolver } from './statistic.resolver';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [
    StatisticResolver,
    StatisticService,
    StatisticSyncService,
    PrismaService,
  ],
  exports: [StatisticSyncService], // Export pour utilisation dans PorteModule
})
export class StatisticModule {}
