import {
  ObjectType,
  Field,
  Int,
  InputType,
  registerEnumType,
} from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsEnum, IsOptional } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';
import { NotificationType, UserType } from '@prisma/client';
import type { Prisma } from '@prisma/client';

// On réutilise l'enum Prisma (source unique), même approche que UserType dans zone.dto.
export { NotificationType };

registerEnumType(NotificationType, {
  name: 'NotificationType',
  description: "Type d'une notification in-app",
});

@ObjectType()
export class Notification {
  @Field(() => Int)
  id: number;

  @Field(() => NotificationType)
  type: NotificationType;

  @Field()
  title: string;

  @Field()
  body: string;

  // Contexte : { type, zoneId, zoneName, targetCount }.
  @Field(() => GraphQLJSON, { nullable: true })
  data?: Prisma.JsonValue;

  @Field(() => Date, { nullable: true })
  readAt?: Date | null;

  @Field()
  createdAt: Date;
}

@InputType()
export class RegisterDeviceTokenInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  token: string; // ExponentPushToken[...]

  @Field(() => UserType)
  @IsEnum(UserType)
  userType: UserType;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  platform?: string; // 'ios' | 'android'
}
