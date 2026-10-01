import { Module } from '@nestjs/common';
import { GamificationResolver } from './gamification.resolver';
import { WinleadPlusApiService } from './winleadplus-api.service';
import { MappingService } from './mapping.service';
import { OffreService } from './offre.service';
import { BadgeService } from './badge.service';
import { RankingService } from './ranking.service';
import { ContratService } from './contrat.service';
import { EvaluationService } from './evaluation.service';
import { GamificationCronService } from './gamification-cron.service';
import { PrismaService } from '../prisma.service';
import { WinleadPlusAuthService } from './winleadplus-auth.service';

@Module({
  providers: [
    GamificationResolver,
    WinleadPlusApiService,
    WinleadPlusAuthService,
    MappingService,
    OffreService,
    BadgeService,
    RankingService,
    ContratService,
    EvaluationService,
    GamificationCronService,
    PrismaService,
  ],
  exports: [WinleadPlusApiService, WinleadPlusAuthService],
})
export class GamificationModule {}
