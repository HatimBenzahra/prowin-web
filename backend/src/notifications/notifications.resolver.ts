import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Notification, RegisterDeviceTokenInput } from './notifications.dto';
import { UserType } from '../zone/zone.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// Le rôle du token définit le type d'acteur (mobile = commercial | manager).
// On ne fait jamais confiance à un userId/userType fourni par le client.
function roleToUserType(role: string): UserType {
  return role === 'manager' ? UserType.MANAGER : UserType.COMMERCIAL;
}

@Resolver(() => Notification)
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsResolver {
  constructor(private readonly notifications: NotificationsService) {}

  @Mutation(() => Boolean, { name: 'registerDeviceToken' })
  @Roles('commercial', 'manager')
  async registerDeviceToken(
    @Args('input') input: RegisterDeviceTokenInput,
    @CurrentUser() user: { id: number; role: string },
  ): Promise<boolean> {
    await this.notifications.registerDeviceToken(
      user.id,
      roleToUserType(user.role),
      input.token,
      input.platform,
    );
    return true;
  }

  @Mutation(() => Boolean, { name: 'unregisterDeviceToken' })
  @Roles('commercial', 'manager')
  unregisterDeviceToken(@Args('token') token: string): Promise<boolean> {
    return this.notifications.unregisterDeviceToken(token);
  }

  @Query(() => [Notification], { name: 'myNotifications' })
  @Roles('commercial', 'manager')
  myNotifications(@CurrentUser() user: { id: number; role: string }) {
    return this.notifications.getMyNotifications(
      user.id,
      roleToUserType(user.role),
    );
  }

  @Query(() => Int, { name: 'unreadNotificationCount' })
  @Roles('commercial', 'manager')
  unreadNotificationCount(@CurrentUser() user: { id: number; role: string }) {
    return this.notifications.getUnreadCount(
      user.id,
      roleToUserType(user.role),
    );
  }

  @Mutation(() => Boolean, { name: 'markNotificationRead' })
  @Roles('commercial', 'manager')
  async markNotificationRead(
    @Args('id', { type: () => Int }) id: number,
    @CurrentUser() user: { id: number; role: string },
  ): Promise<boolean> {
    await this.notifications.markAsRead(id, user.id, roleToUserType(user.role));
    return true;
  }

  @Mutation(() => Boolean, { name: 'markAllNotificationsRead' })
  @Roles('commercial', 'manager')
  markAllNotificationsRead(
    @CurrentUser() user: { id: number; role: string },
  ): Promise<boolean> {
    return this.notifications.markAllAsRead(user.id, roleToUserType(user.role));
  }
}
