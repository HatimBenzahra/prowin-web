import { Module } from '@nestjs/common';
import { RecordingService } from './recording.service';
import { RecordingResolver } from './recording.resolver';
import { PrismaService } from '../prisma.service';
import { TranscriptionModule } from '../transcription/transcription.module';
import { S3DiagnosticsModule } from '../s3-diagnostics/s3-diagnostics.module';
import { CoachingModule } from '../coaching/coaching.module';

@Module({
  imports: [TranscriptionModule, S3DiagnosticsModule, CoachingModule],
  providers: [RecordingService, RecordingResolver, PrismaService],
  exports: [RecordingService],
})
export class RecordingModule {}
