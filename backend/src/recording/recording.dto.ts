import { Field, ObjectType, InputType, Int, Float } from '@nestjs/graphql';

@ObjectType()
export class RecordingItem {
  @Field() key: string;
  @Field({ nullable: true }) url?: string;
  @Field({ nullable: true }) size?: number;
  @Field({ nullable: true }) lastModified?: Date;
}

@InputType()
export class RequestRecordingUploadInput {
  @Field() roomName: string;

  @Field({ nullable: true })
  immeubleId?: number;

  @Field({ nullable: true })
  participantIdentity?: string;

  @Field({ nullable: true, defaultValue: 'audio/mp4' })
  mimeType?: string;

  @Field({ nullable: true })
  duration?: number;

  @Field({ nullable: true })
  fileSize?: number;
}

@ObjectType()
export class RecordingUploadDetails {
  @Field() uploadUrl: string;
  @Field() s3Key: string;
  @Field() expiresIn: number;
}

@InputType()
export class ConfirmRecordingUploadInput {
  @Field() s3Key: string;

  @Field({ nullable: true })
  duration?: number;

  @Field(() => [DoorSegmentInput], { nullable: true })
  doorSegments?: DoorSegmentInput[];
}

@InputType()
export class ListRecentRecordingsInput {
  @Field(() => Int, { nullable: true, defaultValue: 60 })
  limit?: number;
}

@InputType()
export class BackfillRecordingsInput {
  @Field(() => Int, { nullable: true, defaultValue: 5000 })
  maxObjects?: number;
}

@ObjectType()
export class BackfillRecordingsResult {
  @Field(() => Int) scannedRooms: number;
  @Field(() => Int) scannedObjects: number;
  @Field(() => Int) indexed: number;
  @Field(() => Int) skipped: number;
}

@InputType()
export class DoorSegmentInput {
  @Field(() => Int) porteId: number;
  @Field() numero: string;
  @Field(() => Int) etage: number;
  @Field(() => Float) startTime: number;
  @Field(() => Float) endTime: number;
  @Field({ nullable: true }) statut?: string;
}

@ObjectType()
export class RecordingSegmentDto {
  @Field(() => Int) id: number;
  @Field(() => Int) porteId: number;
  @Field({ nullable: true }) porteNumero?: string;
  @Field(() => Int, { nullable: true }) porteEtage?: number;
  @Field({ nullable: true }) immeubleAdresse?: string;
  @Field({ nullable: true }) commercialNom?: string;
  @Field({ nullable: true }) s3KeyOriginal?: string;
  @Field({ nullable: true }) s3KeySegment?: string;
  @Field({ nullable: true }) statut?: string;
  @Field(() => Float) startTime: number;
  @Field(() => Float) endTime: number;
  @Field(() => Float) durationSec: number;
  @Field() status: string;
  @Field({ nullable: true }) streamingUrl?: string;
  @Field(() => Int, { nullable: true }) immeubleId?: number;
  @Field(() => Int, { nullable: true }) commercialId?: number;
  @Field(() => Int, { nullable: true }) managerId?: number;
  @Field() createdAt: Date;
}

@ObjectType()
export class PaginatedRecordingsResult {
  @Field(() => [RecordingItem]) items: RecordingItem[];
  @Field(() => Int) totalCount: number;
}

@ObjectType()
export class SpeechScoreDto {
  @Field() key: string;
  @Field(() => Int, { nullable: true }) score?: number;
  @Field(() => Float, { nullable: true }) totalDurationSec?: number;
  @Field(() => Float, { nullable: true }) speechDurationSec?: number;
  @Field() status: string;
}
