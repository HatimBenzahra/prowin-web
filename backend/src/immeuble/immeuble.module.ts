import { Module } from '@nestjs/common';
import { ImmeubleService } from './immeuble.service';
import { ImmeubleMembreService } from './immeuble-membre.service';
import { ImmeubleResolver } from './immeuble.resolver';
import { PrismaService } from '../prisma.service';
import { ImmeubleAccessModule } from './immeuble-access.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StatisticModule } from '../statistic/statistic.module';

@Module({
  imports: [ImmeubleAccessModule, NotificationsModule, StatisticModule],
  providers: [
    ImmeubleResolver,
    ImmeubleService,
    ImmeubleMembreService,
    PrismaService,
  ],
  exports: [ImmeubleService],
})
export class ImmeubleModule {}
