import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { DirecteurService } from './directeur.service';
import {
  Directeur,
  CreateDirecteurInput,
  UpdateDirecteurInput,
} from './directeur.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver(() => Directeur)
@UseGuards(JwtAuthGuard, RolesGuard)
export class DirecteurResolver {
  constructor(private readonly directeurService: DirecteurService) {}

  @Mutation(() => Directeur)
  @Roles('admin')
  createDirecteur(
    @Args('createDirecteurInput') createDirecteurInput: CreateDirecteurInput,
  ) {
    return this.directeurService.create(createDirecteurInput);
  }

  @Query(() => [Directeur], { name: 'directeurs' })
  @Roles('admin', 'directeur')
  findAll(@CurrentUser() user: any) {
    return this.directeurService.findAll(user.id, user.role);
  }

  @Query(() => Directeur, { name: 'directeur' })
  @Roles('admin', 'directeur')
  findOne(
    @Args('id', { type: () => Int }) id: number,
    @CurrentUser() user: any,
  ) {
    return this.directeurService.findOne(id, user.id, user.role);
  }

  @Mutation(() => Directeur)
  @Roles('admin')
  updateDirecteur(
    @Args('updateDirecteurInput') updateDirecteurInput: UpdateDirecteurInput,
    @CurrentUser() user: any,
  ) {
    return this.directeurService.update(
      updateDirecteurInput,
      user.id,
      user.role,
    );
  }

  @Mutation(() => Directeur)
  @Roles('admin')
  removeDirecteur(
    @Args('id', { type: () => Int }) id: number,
    @CurrentUser() user: any,
  ) {
    return this.directeurService.remove(id, user.id, user.role);
  }
}
