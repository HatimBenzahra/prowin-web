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
  IsInt,
  Min,
  IsBoolean,
  IsNumber,
  IsEnum,
  IsDate,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
// Enum enregistré en GraphQL par zone.dto (qui importe ce fichier : pas d'import
// croisé ici, on prend l'objet Prisma, source unique).
import { UserType } from '@prisma/client';
import { Porte } from '../porte/porte.dto';

export enum TypeHabitat {
  IMMEUBLE = 'IMMEUBLE',
  MAISON = 'MAISON',
  PAVILLON = 'PAVILLON',
}

registerEnumType(TypeHabitat, {
  name: 'TypeHabitat',
  description: 'Type de lieu terrain prospecte',
});

export enum ImmeubleProgressFilter {
  ALL = 'ALL',
  INCOMPLETE = 'INCOMPLETE',
  LOW = 'LOW',
  MID = 'MID',
  HIGH = 'HIGH',
  COMPLETE = 'COMPLETE',
}

registerEnumType(ImmeubleProgressFilter, {
  name: 'ImmeubleProgressFilter',
  description: 'Filtre de progression de prospection (calcule cote serveur)',
});

/** Membre d'un immeuble partagé (id = id du commercial ou du manager). */
@ObjectType()
export class ImmeubleMembre {
  @Field(() => Int)
  id: number;

  @Field()
  prenom: string;

  @Field()
  nom: string;

  @Field(() => UserType)
  type: UserType;
}

/** Commercial de la même équipe, à qui l'on peut partager un immeuble. */
@ObjectType()
export class Coequipier {
  @Field(() => Int)
  id: number;

  @Field()
  prenom: string;

  @Field()
  nom: string;
}

@ObjectType()
export class Immeuble {
  @Field(() => Int)
  id: number;

  @Field()
  adresse: string;

  @Field(() => Float, { nullable: true })
  latitude?: number;

  @Field(() => Float, { nullable: true })
  longitude?: number;

  @Field(() => TypeHabitat)
  typeHabitat: TypeHabitat;

  @Field(() => Int)
  nbEtages: number;

  @Field(() => Int)
  nbPortesParEtage: number;

  @Field()
  ascenseurPresent: boolean;

  @Field({ nullable: true })
  digitalCode?: string;

  @Field(() => Int, { nullable: true })
  commercialId?: number;

  @Field(() => Int, { nullable: true })
  managerId?: number;

  @Field(() => Int, { nullable: true })
  zoneId?: number;

  @Field(() => Int, { nullable: true })
  quartierId?: number;

  @Field(() => Int, { nullable: true })
  nbMaisonsPrevu?: number;

  @Field(() => [Porte], { nullable: true })
  portes?: Porte[];

  @Field(() => [ImmeubleMembre])
  membres: ImmeubleMembre[];

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

@ObjectType()
export class MobileMapPlace {
  @Field(() => Int)
  id: number;

  @Field()
  adresse: string;

  @Field(() => Float)
  latitude: number;

  @Field(() => Float)
  longitude: number;

  @Field(() => TypeHabitat)
  typeHabitat: TypeHabitat;

  @Field(() => Int)
  nbEtages: number;

  @Field(() => Int)
  nbPortesParEtage: number;

  @Field(() => Int, { nullable: true })
  nbMaisonsPrevu?: number;

  @Field(() => Int, { nullable: true })
  commercialId?: number;

  @Field(() => Int, { nullable: true })
  managerId?: number;

  @Field(() => Int, { nullable: true })
  zoneId?: number;

  @Field(() => Int, { nullable: true })
  quartierId?: number;

  @Field()
  ownership: string;

  @Field({ nullable: true })
  creatorName?: string;

  @Field()
  updatedAt: Date;
}

@InputType()
export class ImmeublesPageInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  cursor?: string;

  @Field(() => Int, { nullable: true, defaultValue: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  search?: string;

  @Field(() => TypeHabitat, { nullable: true })
  @IsOptional()
  @IsEnum(TypeHabitat)
  typeHabitat?: TypeHabitat;

  @Field(() => ImmeubleProgressFilter, {
    nullable: true,
    defaultValue: ImmeubleProgressFilter.ALL,
  })
  @IsOptional()
  @IsEnum(ImmeubleProgressFilter)
  progress?: ImmeubleProgressFilter;

  // Filtre plage de dates sur la date de création du lieu (onglet Lieux mobile).
  // Bornes optionnelles ; `createdTo` est attendu en fin de journée (inclusif).
  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  createdFrom?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  createdTo?: Date;
}

@ObjectType()
export class BackfillImmeubleZonesResult {
  @Field(() => Int)
  scanned: number;

  @Field(() => Int)
  updated: number;

  @Field(() => Int)
  attached: number;

  @Field(() => Int)
  detached: number;
}

@ObjectType()
export class ImmeublesPageSummary {
  @Field(() => Int)
  coveragePercent: number;

  @Field(() => Int)
  standaloneCount: number;
}

@ObjectType()
export class ImmeublesPage {
  @Field(() => [Immeuble])
  items: Immeuble[];

  @Field({ nullable: true })
  nextCursor?: string;

  @Field()
  hasMore: boolean;

  @Field(() => Int)
  totalCount: number;

  @Field(() => ImmeublesPageSummary)
  summary: ImmeublesPageSummary;
}

@InputType()
export class CreateImmeubleInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  adresse: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @Field(() => TypeHabitat, {
    nullable: true,
    defaultValue: TypeHabitat.IMMEUBLE,
  })
  @IsOptional()
  @IsEnum(TypeHabitat)
  typeHabitat?: TypeHabitat;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  nbEtages: number;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  nbPortesParEtage: number;

  @Field()
  @IsBoolean()
  ascenseurPresent: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  digitalCode?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  commercialId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  managerId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  zoneId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  quartierId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  nbMaisonsPrevu?: number;
}

@InputType()
export class UpdateImmeubleInput {
  @Field(() => Int)
  id: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  adresse?: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @Field(() => TypeHabitat, { nullable: true })
  @IsOptional()
  @IsEnum(TypeHabitat)
  typeHabitat?: TypeHabitat;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  nbEtages?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  nbPortesParEtage?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  ascenseurPresent?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  digitalCode?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  commercialId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  managerId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  zoneId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  quartierId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  nbMaisonsPrevu?: number;
}

@ObjectType()
export class Quartier {
  @Field(() => Int)
  id: number;

  @Field()
  nom: string;

  @Field(() => Float, { nullable: true })
  latitude?: number;

  @Field(() => Float, { nullable: true })
  longitude?: number;

  @Field(() => Int, { nullable: true })
  commercialId?: number;

  @Field(() => Int, { nullable: true })
  managerId?: number;

  @Field(() => Int, { nullable: true })
  zoneId?: number;

  @Field(() => [Immeuble], { nullable: true })
  immeubles?: Immeuble[];

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

@InputType()
export class CreateQuartierPointInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  adresse: string;

  @Field(() => Float)
  @IsNumber()
  latitude: number;

  @Field(() => Float)
  @IsNumber()
  longitude: number;

  @Field(() => TypeHabitat)
  @IsEnum(TypeHabitat)
  typeHabitat: TypeHabitat;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  nbEtages?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  nbPortesParEtage?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  nbMaisonsPrevu?: number;
}

@InputType()
export class CreateQuartierInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  nom?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  commercialId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  managerId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  zoneId?: number;

  @Field(() => [CreateQuartierPointInput])
  @ValidateNested({ each: true })
  @Type(() => CreateQuartierPointInput)
  points: CreateQuartierPointInput[];
}
