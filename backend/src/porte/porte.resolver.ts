import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { PorteService } from './porte.service';
import {
  Porte,
  CreatePorteInput,
  UpdatePorteInput,
  PorteStatistics,
  StatusHistorique,
} from './porte.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver(() => Porte)
@UseGuards(JwtAuthGuard, RolesGuard)
export class PorteResolver {
  constructor(private readonly porteService: PorteService) {}

  @Mutation(() => Porte)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  createPorte(
    @Args('createPorteInput') createPorteInput: CreatePorteInput,
    @CurrentUser() user: any,
  ) {
    return this.porteService.create(createPorteInput, user.id, user.role);
  }

  @Query(() => [Porte], { name: 'portes' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  findAll(@CurrentUser() user: any) {
    return this.porteService.findAll(user.id, user.role);
  }

  @Query(() => Porte, { name: 'porte' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  findOne(
    @Args('id', { type: () => Int }) id: number,
    @CurrentUser() user: any,
  ) {
    return this.porteService.findOne(id, user.id, user.role);
  }

  @Query(() => [Porte], { name: 'portesByImmeuble' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  findByImmeuble(
    @Args('immeubleId', { type: () => Int }) immeubleId: number,
    @Args('skip', { type: () => Int, nullable: true }) skip: number,
    @Args('take', { type: () => Int, nullable: true }) take: number,
    @Args('etage', { type: () => Int, nullable: true }) etage: number,
    @CurrentUser() user: any,
  ) {
    return this.porteService.findByImmeuble(
      immeubleId,
      user.id,
      user.role,
      skip,
      take,
      etage,
    );
  }

  @Query(() => PorteStatistics, { name: 'porteStatistics' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  getStatistics(
    @Args('immeubleId', { type: () => Int }) immeubleId: number,
    @CurrentUser() user: any,
  ) {
    return this.porteService.getStatistiquesPortes(
      immeubleId,
      user.id,
      user.role,
    );
  }

  @Mutation(() => Porte)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  updatePorte(
    @Args('updatePorteInput') updatePorteInput: UpdatePorteInput,
    @CurrentUser() user: any,
  ) {
    return this.porteService.update(updatePorteInput, user.id, user.role);
  }

  @Mutation(() => Porte)
  @Roles('admin', 'directeur')
  removePorte(
    @Args('id', { type: () => Int }) id: number,
    @CurrentUser() user: any,
  ) {
    return this.porteService.remove(id, user.id, user.role);
  }

  @Mutation(() => Porte)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  createPorteCapped(
    @Args('createPorteInput') createPorteInput: CreatePorteInput,
    @CurrentUser() user: any,
  ) {
    return this.porteService.createCapped(createPorteInput, user.id, user.role);
  }

  @Mutation(() => Boolean)
  @Roles('admin', 'directeur', 'manager', 'commercial')
  async createPortesForImmeuble(
    @Args('immeubleId', { type: () => Int }) immeubleId: number,
    @Args('nbEtages', { type: () => Int }) nbEtages: number,
    @Args('nbPortesParEtage', { type: () => Int }) nbPortesParEtage: number,
    @CurrentUser() user: any,
  ) {
    await this.porteService.createPortesForImmeuble(
      immeubleId,
      nbEtages,
      nbPortesParEtage,
      user.id,
      user.role,
    );
    return true;
  }
  /* affichage du tableau de bord */
  @Query(() => [Porte], { name: 'portesModifiedToday' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  findModifiedToday(
    @Args('immeubleId', { type: () => Int, nullable: true })
    immeubleId?: number,
    @CurrentUser() user?: any,
  ) {
    return this.porteService.findModifiedToday(
      immeubleId,
      user?.id,
      user?.role,
    );
  }

  @Query(() => [Porte], { name: 'portesRdvToday' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  findRdvToday(@CurrentUser() user: any) {
    return this.porteService.findRdvToday(user.id, user.role);
  }

  // ============= STATUS HISTORIQUE QUERIES =============

  @Query(() => [StatusHistorique], { name: 'statusHistoriqueByPorte' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  getStatusHistoriqueByPorte(
    @Args('porteId', { type: () => Int }) porteId: number,
    @CurrentUser() user: any,
  ) {
    return this.porteService.getStatusHistoriqueByPorte(
      porteId,
      user.id,
      user.role,
    );
  }

  @Query(() => [StatusHistorique], { name: 'statusHistoriqueByImmeuble' })
  @Roles('admin', 'directeur', 'manager', 'commercial')
  getStatusHistoriqueByImmeuble(
    @Args('immeubleId', { type: () => Int }) immeubleId: number,
    @CurrentUser() user: any,
  ) {
    return this.porteService.getStatusHistoriqueByImmeuble(
      immeubleId,
      user.id,
      user.role,
    );
  }
}
