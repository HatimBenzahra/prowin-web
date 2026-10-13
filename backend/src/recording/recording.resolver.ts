import { Resolver, Mutation, Args, Query, Context } from '@nestjs/graphql';
import { requestBearer } from '../auth/request-bearer';
import type { BearerRequestContext } from '../auth/request-bearer';
import { UseGuards } from '@nestjs/common';
import { Int } from '@nestjs/graphql';
import {
  RecordingItem,
  RequestRecordingUploadInput,
  RecordingUploadDetails,
  ConfirmRecordingUploadInput,
  ListRecentRecordingsInput,
  BackfillRecordingsInput,
  BackfillRecordingsResult,
  SpeechScoreDto,
  PaginatedRecordingsResult,
  RecordingSegmentDto,
} from './recording.dto';
import { RecordingService } from './recording.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver()
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecordingResolver {
  constructor(private readonly svc: RecordingService) {}

  @Query(() => [RecordingItem])
  @Roles('admin', 'directeur')
  async listRecordings(
    @Args('roomName') roomName: string,
    @CurrentUser() user: any,
  ): Promise<RecordingItem[]> {
    return this.svc.listRecordings(roomName, user);
  }

  @Query(() => String)
  @Roles('admin', 'directeur')
  async getStreamingUrl(
    @Args('key') key: string,
    @CurrentUser() user: any,
  ): Promise<string> {
    return this.svc.getStreamingUrl(key, user);
  }

  @Mutation(() => RecordingUploadDetails)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  async requestRecordingUpload(
    @Args('input') input: RequestRecordingUploadInput,
    @CurrentUser() user: any,
  ): Promise<RecordingUploadDetails> {
    return this.svc.requestRecordingUpload(input, user);
  }

  @Mutation(() => RecordingItem)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  async confirmRecordingUpload(
    @Args('input') input: ConfirmRecordingUploadInput,
    @CurrentUser() user: any,
    @Context() context: BearerRequestContext,
  ): Promise<RecordingItem> {
    return this.svc.confirmRecordingUpload(input, user, requestBearer(context));
  }

  @Query(() => PaginatedRecordingsResult)
  @Roles('admin', 'directeur')
  async listRecentRecordings(
    @Args('input') input: ListRecentRecordingsInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedRecordingsResult> {
    return this.svc.listRecentRecordings(input, user);
  }

  @Mutation(() => BackfillRecordingsResult)
  @Roles('admin')
  async backfillRecordingsIndex(
    @Args('input') input: BackfillRecordingsInput,
  ): Promise<BackfillRecordingsResult> {
    return this.svc.backfillRecordingsIndex(input);
  }

  @Query(() => [SpeechScoreDto])
  @Roles('admin', 'directeur')
  async getRecordingSpeechScores(
    @Args({ name: 'keys', type: () => [String] }) keys: string[],
  ): Promise<SpeechScoreDto[]> {
    return this.svc.getSpeechScores(keys);
  }

  @Query(() => PaginatedRecordingsResult)
  @Roles('admin', 'directeur')
  async listAllRecordings(
    @Args({ name: 'roomNames', type: () => [String] }) roomNames: string[],
    @CurrentUser() user: any,
  ): Promise<PaginatedRecordingsResult> {
    return this.svc.listAllRecordings(roomNames, user);
  }

  @Query(() => [RecordingSegmentDto])
  @Roles('admin', 'directeur')
  async recordingSegmentsByPorte(
    @Args('porteId', { type: () => Int }) porteId: number,
    @CurrentUser() user: any,
  ): Promise<RecordingSegmentDto[]> {
    return this.svc.getSegmentsByPorte(porteId, user);
  }

  @Query(() => [RecordingSegmentDto])
  @Roles('admin', 'directeur')
  async recordingSegmentsByImmeuble(
    @Args('immeubleId', { type: () => Int }) immeubleId: number,
    @CurrentUser() user: any,
  ): Promise<RecordingSegmentDto[]> {
    return this.svc.getSegmentsByImmeuble(immeubleId, user);
  }

  @Query(() => [RecordingSegmentDto])
  @Roles('admin', 'directeur')
  async recordingSegmentsByCommercial(
    @Args('commercialId', { type: () => Int }) commercialId: number,
    @CurrentUser() user: any,
  ): Promise<RecordingSegmentDto[]> {
    return this.svc.getSegmentsByCommercial(commercialId, user);
  }

  @Query(() => [RecordingSegmentDto])
  @Roles('admin', 'directeur')
  async recordingSegmentsByManager(
    @Args('managerId', { type: () => Int }) managerId: number,
    @CurrentUser() user: any,
  ): Promise<RecordingSegmentDto[]> {
    return this.svc.getSegmentsByManager(managerId, user);
  }

  @Query(() => [RecordingSegmentDto])
  @Roles('admin', 'directeur')
  async recordingSegmentsToday(
    @Args('statut', { nullable: true }) statut: string,
    @Args('limit', { type: () => Int, defaultValue: 20 }) limit: number,
    @CurrentUser() user: any,
  ): Promise<RecordingSegmentDto[]> {
    return this.svc.getSegmentsToday(statut, limit, user);
  }

  @Mutation(() => Int)
  @Roles('admin', 'directeur')
  async removeRecordingSegmentsToday(
    @Args('statut', { nullable: true }) statut: string,
    @Args('segmentIds', { type: () => [Int], nullable: true })
    segmentIds: number[],
    @Args('commercialId', { type: () => Int, nullable: true })
    commercialId: number,
    @Args('limit', { type: () => Int, defaultValue: 20 }) limit: number,
    @CurrentUser() user: any,
  ): Promise<number> {
    return this.svc.removeSegmentsToday(
      statut,
      segmentIds,
      commercialId,
      limit,
      user,
    );
  }
}
