import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ZoneService } from './zone.service';
import {
  Zone,
  CreateZoneInput,
  UpdateZoneInput,
  ZoneEnCours,
  HistoriqueZone,
  AssignZoneInput,
  UserType,
  ZoneProspection,
} from './zone.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver(() => Zone)
@UseGuards(JwtAuthGuard, RolesGuard)
export class ZoneResolver {
  constructor(private readonly zoneService: ZoneService) {}

  @Mutation(() => Zone)
  @Roles('admin', 'directeur', 'manager')
  createZone(
    @Args('createZoneInput') createZoneInput: CreateZoneInput,
    @CurrentUser() user: any,
  ) {
    return this.zoneService.create(createZoneInput, user.id, user.role);
  }

  @Query(() => [Zone], { name: 'zones' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  findAll(@CurrentUser() user: any) {
    return this.zoneService.findAll(user.id, user.role);
  }

  @Query(() => Zone, { name: 'zone' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  findOne(
    @Args('id', { type: () => Int }) id: number,
    @Args('excludeTestUsers', { type: () => Boolean, defaultValue: false })
    excludeTestUsers: boolean,
    @CurrentUser() user: any,
  ) {
    return this.zoneService.findOne(id, user.id, user.role, excludeTestUsers);
  }

  @Query(() => [Zone], { name: 'zonesForUser' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  getZonesForUser(
    @Args('userId', { type: () => Int }) userId: number,
    @Args('userType', { type: () => UserType }) userType: UserType,
    @CurrentUser() user: any,
  ) {
    return this.zoneService.getZonesForUser(
      userId,
      userType,
      user.id,
      user.role,
    );
  }

  @Mutation(() => Zone)
  @Roles('admin', 'directeur', 'manager')
  updateZone(@Args('updateZoneInput') updateZoneInput: UpdateZoneInput) {
    return this.zoneService.update(updateZoneInput);
  }

  @Mutation(() => Zone)
  @Roles('admin', 'directeur')
  removeZone(@Args('id', { type: () => Int }) id: number) {
    return this.zoneService.remove(id);
  }

  @Mutation(() => Boolean)
  @Roles('admin', 'directeur', 'manager')
  assignZoneToCommercial(
    @Args('zoneId', { type: () => Int }) zoneId: number,
    @Args('commercialId', { type: () => Int }) commercialId: number,
    @CurrentUser() user: any,
  ) {
    return this.zoneService
      .assignToCommercial(zoneId, commercialId, user.id, user.role)
      .then(() => true);
  }

  @Mutation(() => Boolean)
  @Roles('admin', 'directeur')
  assignZoneToManager(
    @Args('zoneId', { type: () => Int }) zoneId: number,
    @Args('managerId', { type: () => Int }) managerId: number,
    @CurrentUser() user: any,
  ) {
    return this.zoneService
      .assignToManager(zoneId, managerId, user.id, user.role)
      .then(() => true);
  }

  @Mutation(() => Boolean)
  @Roles('admin', 'directeur', 'manager')
  unassignZoneFromCommercial(
    @Args('zoneId', { type: () => Int }) zoneId: number,
    @Args('commercialId', { type: () => Int }) commercialId: number,
    @CurrentUser() user: any,
  ) {
    return this.zoneService
      .unassignFromCommercial(zoneId, commercialId, user.id, user.role)
      .then(() => true);
  }

  // =====================================================
  //assignZoneToUser and unassignUser
  // =====================================================

  @Mutation(() => ZoneEnCours, { name: 'assignZoneToUser' })
  @Roles('admin', 'directeur', 'manager')
  assignZoneToUser(
    @Args('input') input: AssignZoneInput,
    @CurrentUser() user: any,
  ) {
    // `input.cascade` est accepté mais ignoré (déprécié) : l'assignation est
    // toujours individuelle, sans cascade. Le champ reste dans le schéma pour
    // ne pas casser les clients mobiles qui l'envoient encore.
    return this.zoneService.assignZoneToUser(
      input.zoneId,
      input.userId,
      input.userType,
      user.id,
      user.role,
    );
  }

  @Mutation(() => Boolean, { name: 'unassignUser' })
  @Roles('admin', 'directeur', 'manager')
  unassignUser(
    @Args('userId', { type: () => Int }) userId: number,
    @Args('userType', { type: () => UserType }) userType: UserType,
    @CurrentUser() user: any,
  ) {
    return this.zoneService
      .unassignUser(userId, userType, user.id, user.role)
      .then(() => true);
  }

  @Query(() => ZoneEnCours, { name: 'currentUserAssignment', nullable: true })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  getCurrentAssignment(
    @Args('userId', { type: () => Int }) userId: number,
    @Args('userType', { type: () => UserType }) userType: UserType,
    @CurrentUser() user: any,
  ) {
    return this.zoneService.getCurrentAssignment(
      userId,
      userType,
      user.id,
      user.role,
    );
  }

  @Query(() => [HistoriqueZone], { name: 'userZoneHistory' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  getUserZoneHistory(
    @Args('userId', { type: () => Int }) userId: number,
    @Args('userType', { type: () => UserType }) userType: UserType,
    @CurrentUser() user: any,
  ) {
    return this.zoneService.getUserZoneHistory(
      userId,
      userType,
      user.id,
      user.role,
    );
  }

  @Query(() => [HistoriqueZone], { name: 'zoneHistory' })
  @Roles('admin', 'directeur', 'manager')
  getZoneHistory(@Args('zoneId', { type: () => Int }) zoneId: number) {
    return this.zoneService.getZoneHistory(zoneId);
  }

  @Query(() => [ZoneEnCours], { name: 'zoneCurrentAssignments' })
  @Roles('admin', 'directeur', 'manager')
  getZoneCurrentAssignments(
    @Args('zoneId', { type: () => Int }) zoneId: number,
    @CurrentUser() user: any,
  ) {
    return this.zoneService.getZoneCurrentAssignments(
      zoneId,
      user.id,
      user.role,
    );
  }

  @Query(() => [HistoriqueZone], { name: 'allZoneHistory' })
  @Roles('admin', 'directeur', 'manager')
  getAllZoneHistory(@CurrentUser() user: any) {
    return this.zoneService.getAllZoneHistory(user.id, user.role);
  }

  @Query(() => [ZoneEnCours], { name: 'allCurrentAssignments' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  getAllCurrentAssignments(@CurrentUser() user: any) {
    return this.zoneService.getAllCurrentAssignments(user.id, user.role);
  }

  @Query(() => [ZoneProspection], { name: 'zoneProspections' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  getZoneProspections(
    @Args('zoneId', { type: () => Int }) zoneId: number,
    @CurrentUser() user: any,
  ) {
    return this.zoneService.getZoneProspections(zoneId, user.id, user.role);
  }
}
