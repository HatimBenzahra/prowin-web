import {
  Resolver,
  Query,
  Mutation,
  Args,
  Int,
  ResolveField,
  Parent,
} from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ImmeubleService } from './immeuble.service';
import { ImmeubleMembreService } from './immeuble-membre.service';
import {
  Immeuble,
  ImmeubleMembre,
  Coequipier,
  BackfillImmeubleZonesResult,
  CreateImmeubleInput,
  CreateQuartierInput,
  ImmeublesPage,
  ImmeublesPageInput,
  Quartier,
  UpdateImmeubleInput,
  MobileMapPlace,
} from './immeuble.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

type AuthenticatedUser = {
  id: number;
  role: string;
};

@Resolver(() => Immeuble)
@UseGuards(JwtAuthGuard, RolesGuard)
export class ImmeubleResolver {
  constructor(
    private readonly immeubleService: ImmeubleService,
    private readonly immeubleMembreService: ImmeubleMembreService,
  ) {}

  @Mutation(() => Immeuble)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  createImmeuble(
    @Args('createImmeubleInput') createImmeubleInput: CreateImmeubleInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleService.create(createImmeubleInput, user.id, user.role);
  }

  @Mutation(() => Immeuble)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  createMaisonFromImmeubleInput(
    @Args('createImmeubleInput') createImmeubleInput: CreateImmeubleInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleService.createMaison(
      createImmeubleInput,
      user.id,
      user.role,
    );
  }

  @Mutation(() => Quartier)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  createQuartier(
    @Args('createQuartierInput') createQuartierInput: CreateQuartierInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleService.createQuartier(
      createQuartierInput,
      user.id,
      user.role,
    );
  }

  @Query(() => [Immeuble], { name: 'immeubles' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.immeubleService.findAll(user.id, user.role);
  }

  @Query(() => [MobileMapPlace], { name: 'mobileManagerMapPlaces' })
  @Roles('manager')
  mobileManagerMapPlaces(
    @Args('includeTeam', { type: () => Boolean, defaultValue: false })
    includeTeam: boolean,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleService.findMobileManagerMapPlaces(
      user.id,
      includeTeam,
    );
  }

  @Query(() => Immeuble, { name: 'mobileImmeubleDetail' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  mobileImmeubleDetail(
    @Args('id', { type: () => Int }) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleService.findMobileDetail(id, user.id, user.role);
  }

  @Query(() => ImmeublesPage, { name: 'immeublesPage' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  immeublesPage(
    @Args('input') input: ImmeublesPageInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleService.findStandalonePaginated(
      input,
      user.id,
      user.role,
    );
  }

  @Query(() => [Quartier], { name: 'quartiers' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  findQuartiers(@CurrentUser() user: AuthenticatedUser) {
    return this.immeubleService.findQuartiers(user.id, user.role);
  }

  @Query(() => [Quartier], { name: 'mobileMapQuartiers' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  mobileMapQuartiers(@CurrentUser() user: AuthenticatedUser) {
    return this.immeubleService.findMobileMapQuartiers(user.id, user.role);
  }

  @Query(() => Immeuble, { name: 'immeuble' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  findOne(
    @Args('id', { type: () => Int }) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleService.findOne(id, user.id, user.role);
  }

  @Mutation(() => Immeuble)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  updateImmeuble(
    @Args('updateImmeubleInput') updateImmeubleInput: UpdateImmeubleInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleService.update(updateImmeubleInput, user.id, user.role);
  }

  @Mutation(() => Immeuble)
  @Roles('admin', 'directeur')
  removeImmeuble(
    @Args('id', { type: () => Int }) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleService.remove(id, user.id, user.role);
  }

  @Mutation(() => Immeuble)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  removeTerrainLieu(
    @Args('id', { type: () => Int }) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleService.removeTerrainLieu(id, user.id, user.role);
  }

  @Mutation(() => Immeuble)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  addPorteToEtage(
    @Args('immeubleId', { type: () => Int }) immeubleId: number,
    @Args('etage', { type: () => Int }) etage: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleService.addPorteToEtage(
      immeubleId,
      etage,
      user.id,
      user.role,
    );
  }

  @Mutation(() => Immeuble)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  removePorteFromEtage(
    @Args('immeubleId', { type: () => Int }) immeubleId: number,
    @Args('etage', { type: () => Int }) etage: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleService.removePorteFromEtage(
      immeubleId,
      etage,
      user.id,
      user.role,
    );
  }

  @Mutation(() => Immeuble)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  addEtageToImmeuble(
    @Args('id', { type: () => Int }) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleService.addEtage(id, user.id, user.role);
  }

  @Mutation(() => Immeuble)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  removeEtageFromImmeuble(
    @Args('id', { type: () => Int }) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleService.removeEtage(id, user.id, user.role);
  }

  @Mutation(() => Immeuble)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  createImmeubleEmpty(
    @Args('createImmeubleInput') createImmeubleInput: CreateImmeubleInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleService.createEmpty(
      createImmeubleInput,
      user.id,
      user.role,
    );
  }

  @Mutation(() => Immeuble)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  addEtageEmpty(
    @Args('immeubleId', { type: () => Int }) immeubleId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleService.addEtageEmpty(immeubleId, user.id, user.role);
  }

  @Mutation(() => Immeuble)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  addPorteToEtageCapped(
    @Args('immeubleId', { type: () => Int }) immeubleId: number,
    @Args('etage', { type: () => Int }) etage: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleService.addPorteToEtageCapped(
      immeubleId,
      etage,
      user.id,
      user.role,
    );
  }

  @ResolveField(() => [ImmeubleMembre])
  membres(@Parent() immeuble: Immeuble): Promise<ImmeubleMembre[]> {
    return this.immeubleMembreService.findMembres(immeuble.id);
  }

  @Query(() => [Coequipier], { name: 'mesCoequipiers' })
  @Roles('manager', 'commercial')
  mesCoequipiers(@CurrentUser() user: AuthenticatedUser) {
    return this.immeubleMembreService.findCoequipiers(user.id, user.role);
  }

  @Mutation(() => Immeuble)
  @Roles('manager', 'commercial')
  partagerImmeuble(
    @Args('immeubleId', { type: () => Int }) immeubleId: number,
    @Args('commercialId', { type: () => Int }) commercialId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleMembreService.partager(
      immeubleId,
      commercialId,
      user.id,
      user.role,
    );
  }

  @Mutation(() => Boolean)
  @Roles('manager', 'commercial')
  quitterImmeuble(
    @Args('immeubleId', { type: () => Int }) immeubleId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.immeubleMembreService.quitter(immeubleId, user.id, user.role);
  }

  /**
   * Backfill admin (idempotent, relançable) : ré-applique la résolution
   * géométrique zoneId à TOUS les immeubles géolocalisés. À déclencher après
   * déploiement du correctif de rattachement zone <-> immeuble, ou après
   * avoir tracé/édité des zones, pour réparer les données existantes.
   */
  @Mutation(() => BackfillImmeubleZonesResult)
  @Roles('admin')
  backfillImmeubleZones() {
    return this.immeubleService.backfillImmeubleZones();
  }
}
