import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { AuthModule } from './auth/auth.module';
import { DirecteurModule } from './directeur/directeur.module';
import { ManagerModule } from './manager/manager.module';
import { CommercialModule } from './commercial/commercial.module';
import { ZoneModule } from './zone/zone.module';
import { ImmeubleModule } from './immeuble/immeuble.module';
import { StatisticModule } from './statistic/statistic.module';
import { PorteModule } from './porte/porte.module';
import { RecordingModule } from './recording/recording.module';
import { CoachingModule } from './coaching/coaching.module';
import { CreationCompteModule } from './creation_compte/creation_compte.module';
import { GamificationModule } from './gamification/gamification.module';
import { SearchModule } from './search/search.module';
import { GpsTrackingModule } from './gps-tracking/gps-tracking.module';
import { AcquiscanModule } from './acquiscan/acquiscan.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: true,
      introspection: true,
      context: ({ req }) => ({ req }),
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    DirecteurModule,
    ManagerModule,
    CommercialModule,
    ZoneModule,
    ImmeubleModule,
    StatisticModule,
    PorteModule,
    RecordingModule,
    CoachingModule,
    CreationCompteModule,
    GamificationModule,
    SearchModule,
    GpsTrackingModule,
    AcquiscanModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
