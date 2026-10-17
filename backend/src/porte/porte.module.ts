import { Module } from '@nestjs/common';
import { PorteService } from './porte.service';
import { PorteResolver } from './porte.resolver';
import { PrismaService } from '../prisma.service';
import { StatisticModule } from '../statistic/statistic.module';

@Module({
  imports: [StatisticModule], // Import pour accéder à StatisticSyncService
  providers: [PorteResolver, PorteService, PrismaService],
  exports: [PorteService],
})
export class PorteModule {}
