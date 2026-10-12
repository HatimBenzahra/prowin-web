import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { SynthesisService } from './synthesis.service';
import { CoachingConfigService } from '../coaching-config.service';
import { CoachingSynthesisDto, CoachingConfigDto } from '../coaching.dto';

type SubjectType = 'commercial' | 'manager';

function normalizeSubject(t: string): SubjectType {
  return t === 'manager' ? 'manager' : 'commercial';
}

@Resolver()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SynthesisResolver {
  constructor(
    private readonly synthesis: SynthesisService,
    private readonly config: CoachingConfigService,
  ) {}

  @Query(() => CoachingSynthesisDto, { nullable: true })
  @Roles('admin', 'directeur')
  coachingSynthesis(
    @Args('subjectType') subjectType: string,
    @Args('subjectId', { type: () => Int }) subjectId: number,
  ): Promise<CoachingSynthesisDto | null> {
    return this.synthesis.getSynthesis(normalizeSubject(subjectType), subjectId);
  }

  @Mutation(() => CoachingSynthesisDto)
  @Roles('admin', 'directeur')
  generateCoachingSynthesis(
    @Args('subjectType') subjectType: string,
    @Args('subjectId', { type: () => Int }) subjectId: number,
  ): Promise<CoachingSynthesisDto> {
    return this.synthesis.requestGenerate(normalizeSubject(subjectType), subjectId);
  }

  /** Configure la planif du cron de synthèse (rythme + heure). */
  @Mutation(() => CoachingConfigDto)
  @Roles('admin', 'directeur')
  async setSynthesisCron(
    @Args('frequency') frequency: string,
    @Args('hour', { type: () => Int }) hour: number,
    @Args('minute', { type: () => Int }) minute: number,
    @Args('weekday', { type: () => Int, nullable: true }) weekday?: number,
  ): Promise<CoachingConfigDto> {
    await this.synthesis.setCron({
      frequency,
      hour,
      minute,
      weekday: weekday ?? 1,
    });
    return this.config.getConfig();
  }
}
