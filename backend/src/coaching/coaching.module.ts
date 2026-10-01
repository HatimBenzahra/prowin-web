import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { CoachingService } from './coaching.service';
import { CoachingApiClient } from './coaching-api.client';
import { CoachingSyncService } from './coaching-sync.service';
import { CoachingInputService } from './coaching-input.service';
import { CoachingResolver } from './coaching.resolver';
import { CoachingConfigService } from './coaching-config.service';
import { CoachingQueryService } from './lecture/coaching-query.service';
import { SalesPlanService } from './referentiels/sales-plan.service';
import { ProductSheetService } from './referentiels/product-sheet.service';
import { SynthesisService } from './synthese-globale/synthesis.service';
import { SynthesisResolver } from './synthese-globale/synthesis.resolver';
import { SnapshotBuilderService } from './synthese-globale/snapshot-builder.service';
import { LlmService } from './shared/llm.service';
import { GamificationModule } from '../gamification/gamification.module';
import { CoachingPricesService } from './coaching-prices.service';

/**
 * Surface coaching du CRM : commandes, lectures et synthèse.
 * Le PIPELINE vit dans le service `prowin/coaching` — ici on décide qu'un
 * échange mérite une analyse, et on lit les résultats.
 */
@Module({
  imports: [ScheduleModule, GamificationModule],
  providers: [
    PrismaService,
    CoachingService,
    CoachingApiClient,
    CoachingSyncService,
    CoachingInputService,
    CoachingPricesService,
    CoachingResolver,
    CoachingConfigService,
    CoachingQueryService,
    SalesPlanService,
    ProductSheetService,
    SynthesisService,
    SynthesisResolver,
    SnapshotBuilderService,
    LlmService,
  ],
  exports: [CoachingService],
})
export class CoachingModule {}
