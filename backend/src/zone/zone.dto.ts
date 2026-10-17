import {
  ObjectType,
  Field,
  Int,
  InputType,
  Float,
  registerEnumType,
} from '@nestjs/graphql';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  Min,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';
import { UserType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { Immeuble } from '../immeuble/immeuble.dto';

// On réutilise l'enum UserType généré par Prisma (source unique) plutôt que d'en
// dupliquer une copie : les résultats Prisma restent directement assignables aux DTO.
export { UserType };

registerEnumType(UserType, {
  name: 'UserType',
  description: "Type d'utilisateur pouvant être assigné à une zone",
});

@ObjectType()
export class Zone {
  @Field(() => Int)
  id: number;

  @Field()
  nom: string;

  @Field(() => Float)
  xOrigin: number;

  @Field(() => Float)
  yOrigin: number;

  @Field(() => Float)
  rayon: number;

  // GeoJSON anneau fermé [[lng,lat],...], null = zone cercle héritée.
  @Field(() => GraphQLJSON, { nullable: true })
  polygon?: Prisma.JsonValue;

  @Field(() => Int, { nullable: true })
  directeurId?: number | null;

  @Field(() => Int, { nullable: true })
  managerId?: number | null;

  // Créateur de la zone (snapshot pour l'historique).
  @Field(() => Int, { nullable: true })
  createdById?: number | null;

  @Field(() => UserType, { nullable: true })
  createdByType?: UserType | null;

  @Field(() => String, { nullable: true })
  createdByName?: string | null;

  @Field(() => [Immeuble], { nullable: true })
  immeubles?: Immeuble[];

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  // Rempli uniquement dans le contexte zonesForUser (date d'assignation de
  // l'utilisateur courant), null sinon.
  @Field(() => Date, { nullable: true })
  assignedAt?: Date | null;
}

@InputType()
export class CreateZoneInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  nom: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  xOrigin?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  yOrigin?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  rayon?: number;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  polygon?: number[][];

  @Field(() => Int, { nullable: true })
  @IsOptional()
  directeurId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  managerId?: number;
}

@InputType()
export class UpdateZoneInput {
  @Field(() => Int)
  id: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  nom?: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  xOrigin?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  yOrigin?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  rayon?: number;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  polygon?: number[][] | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  directeurId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  managerId?: number;
}

@ObjectType()
export class ZoneEnCours {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  zoneId: number;

  @Field(() => Int)
  userId: number;

  @Field(() => UserType)
  userType: UserType;

  @Field()
  assignedAt: Date;

  @Field(() => Zone, { nullable: true })
  zone?: Zone;
}

@ObjectType()
export class HistoriqueZone {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  zoneId: number;

  @Field(() => Int)
  userId: number;

  @Field(() => UserType)
  userType: UserType;

  @Field()
  assignedAt: Date;

  @Field()
  unassignedAt: Date;

  @Field(() => Int)
  totalContratsSignes: number;

  @Field(() => Int)
  totalImmeublesVisites: number;

  @Field(() => Int)
  totalRendezVousPris: number;

  @Field(() => Int)
  totalRefus: number;

  @Field(() => Int)
  totalImmeublesProspectes: number;

  @Field(() => Int)
  totalPortesProspectes: number;

  @Field(() => Zone, { nullable: true })
  zone?: Zone;
}

@ObjectType()
export class ZoneProspection {
  @Field(() => Int)
  immeubleId: number;

  @Field()
  immeubleAdresse: string;

  @Field(() => Int)
  porteId: number;

  @Field()
  porteNumero: string;

  @Field(() => Int, { nullable: true })
  commercialId?: number | null;

  @Field(() => String, { nullable: true })
  commercialNom?: string | null;

  @Field(() => Int, { nullable: true })
  managerId?: number | null;

  @Field(() => String, { nullable: true })
  managerNom?: string | null;

  @Field(() => String)
  statut: string;

  @Field()
  date: Date;

  @Field(() => Int, { nullable: true })
  dureeSec?: number | null;
}

@InputType()
export class AssignZoneInput {
  @Field(() => Int)
  @IsNumber()
  zoneId: number;

  @Field(() => Int)
  @IsNumber()
  userId: number;

  @Field(() => UserType)
  @IsEnum(UserType)
  userType: UserType;

  // @deprecated Ignoré. L'assignation est toujours individuelle (aucune
  // cascade). Le champ reste accepté pour ne pas casser les clients mobiles
  // existants qui l'envoient encore ; il sera retiré après leur mise à jour.
  @Field(() => Boolean, {
    nullable: true,
    deprecationReason: 'Ignoré : aucune cascade. Sera retiré.',
  })
  @IsOptional()
  @IsBoolean()
  cascade?: boolean;
}
