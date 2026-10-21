import { Module } from '@nestjs/common';
import { RecordingService } from './recording.service';
import { RecordingResolver } from './recording.resolver';
import { PrismaService } from '../prisma.service';
import { SpeechAnalysisModule } from '../speech-analysis/speech-analysis.module';
import { S3DiagnosticsModule } from '../s3-diagnostics/s3-diagnostics.module';
import { CoachingModule } from '../coaching/coaching.module';
import { ImmeubleAccessModule } from '../immeuble/immeuble-access.module';

@Module({
  imports: [
    SpeechAnalysisModule,
    S3DiagnosticsModule,
    CoachingModule,
    ImmeubleAccessModule,
  ],
  providers: [RecordingService, RecordingResolver, PrismaService],
  exports: [RecordingService],
})
export class RecordingModule {}
