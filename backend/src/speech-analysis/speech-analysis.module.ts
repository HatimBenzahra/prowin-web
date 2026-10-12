import { Module } from '@nestjs/common';
import { SpeechAnalysisService } from './speech-analysis.service';
import { PrismaService } from '../prisma.service';
import { S3DiagnosticsModule } from '../s3-diagnostics/s3-diagnostics.module';

@Module({
  imports: [S3DiagnosticsModule],
  providers: [SpeechAnalysisService, PrismaService],
  exports: [SpeechAnalysisService],
})
export class SpeechAnalysisModule {}
