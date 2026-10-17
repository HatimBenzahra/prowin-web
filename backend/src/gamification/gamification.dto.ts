import {
  ObjectType,
  Field,
  Int,
  Float,
  InputType,
  registerEnumType,
} from '@nestjs/graphql';
import {
  IsInt,
  IsString,
  IsEnum,
  IsOptional,
  Min,
  MaxLength,
} from 'class-validator';
import {
  BadgeCategory as PrismaBadgeCategory,
  RankPeriod as PrismaRankPeriod,
} from '@prisma/client';

// ============================================================================
// Enums — Enregistrement GraphQL
// ============================================================================

registerEnumType(PrismaBadgeCategory, {
  name: 'BadgeCategory',
  description: 'Catégorie de badge gamification',
});

registerEnumType(PrismaRankPeriod, {
  name: 'RankPeriod',
  description: 'Période de classement (jour, semaine, mois, trimestre, année)',
});

export enum ContractRankingStatus {
  VALIDE = 'VALIDE',
  SIGNE = 'SIGNE',
  RETRACTE = 'RETRACTE',
}

registerEnumType(ContractRankingStatus, {
  name: 'ContractRankingStatus',
  description: 'Statuts de contrat inclus dans le classement ou le détail',
});

// ============================================================================
// ObjectTypes — Réponses GraphQL
// ============================================================================

/** Utilisateur côté WinLead+ */
@ObjectType()
export class WinleadPlusUser {
  @Field()
  id: string;

  @Field()
  nom: string;

  @Field()
  prenom: string;

  @Field({ nullable: true })
  username?: string;

  @Field({ nullable: true })
  email?: string;

  @Field()
  role: string;

  @Field()
  isActive: boolean;

  @Field({ nullable: true })
  managerId?: string;
}

/** Une suggestion de mapping entre un commercial/manager Pro-Win et un user WinLead+ */
@ObjectType()
export class MappingSuggestion {
  /** ID Pro-Win du commercial ou manager */
  @Field(() => Int)
  prowinId: number;

  @Field()
  prowinNom: string;

  @Field()
  prowinPrenom: string;

  @Field({ nullable: true })
  prowinEmail?: string;

  /** "COMMERCIAL" ou "MANAGER" */
  @Field()
  prowinType: string;

  /** UUID WinLead+ proposé (null si pas de match trouvé) */
  @Field({ nullable: true })
  winleadPlusId?: string;

  @Field({ nullable: true })
  winleadPlusNom?: string;

  @Field({ nullable: true })
  winleadPlusPrenom?: string;

  @Field({ nullable: true })
  winleadPlusEmail?: string;

  /** Score de confiance du match (0-100) */
  @Field(() => Int, { nullable: true })
  confidence?: number;

  /** Déjà mappé ou non */
  @Field()
  alreadyMapped: boolean;
}

/** Résultat du mapping */
@ObjectType()
export class MappingResult {
  @Field()
  success: boolean;

  @Field()
  message: string;

  @Field(() => Int)
  mapped: number;

  @Field(() => Int)
  skipped: number;
}

// ============================================================================
// InputTypes — Entrées GraphQL
// ============================================================================

/** Un seul mapping à confirmer */
@InputType()
export class MappingEntry {
  @Field(() => Int)
  @IsInt()
  prowinId: number;

  @Field()
  @IsString()
  winleadPlusId: string;

  @Field()
  @IsString()
  @IsEnum(['COMMERCIAL', 'MANAGER'])
  type: string;
}

/** Input pour confirmer plusieurs mappings d'un coup */
@InputType()
export class ConfirmMappingInput {
  @Field(() => [MappingEntry])
  mappings: MappingEntry[];
}

/** Input pour supprimer un mapping existant */
@InputType()
export class RemoveMappingInput {
  @Field(() => Int)
  @IsInt()
  prowinId: number;

  @Field()
  @IsString()
  @IsEnum(['COMMERCIAL', 'MANAGER'])
  type: string;
}

// ============================================================================
// Offres — Cache local des offres WinLead+
// ============================================================================

/** Offre stockée localement (sync depuis WinLead+) */
@ObjectType()
export class Offre {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  externalId: number;

  @Field()
  nom: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  categorie: string;

  @Field()
  fournisseur: string;

  @Field({ nullable: true })
  logoUrl?: string;

  @Field(() => Float, { nullable: true })
  prixBase?: number;

  @Field({ nullable: true })
  features?: string;

  @Field()
  popular: boolean;

  @Field(() => Float, { nullable: true })
  rating?: number;

  @Field()
  isActive: boolean;

  @Field(() => Int)
  points: number;

  @Field({ nullable: true })
  badgeProductKey?: string; // MOBILE, FIBRE, DEPANSSUR, ELEC_GAZ, CONCIERGERIE, MONDIAL_TV, ASSURANCE

  @Field()
  syncedAt: Date;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

/** Résultat d'une synchro offres */
@ObjectType()
export class SyncOffresResult {
  @Field()
  success: boolean;

  @Field()
  message: string;

  @Field(() => Int)
  created: number;

  @Field(() => Int)
  updated: number;

  @Field(() => Int)
  total: number;
}

/** Input pour modifier les points d'une offre */
@InputType()
export class UpdateOffrePointsInput {
  @Field(() => Int)
  @IsInt()
  offreId: number;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  points: number;
}

/** Input pour modifier les points de plusieurs offres */
@InputType()
export class BatchUpdateOffrePointsInput {
  @Field(() => [UpdateOffrePointsInput])
  offres: UpdateOffrePointsInput[];
}

/** Input pour modifier le badgeProductKey d'une offre */
@InputType()
export class UpdateOffreBadgeProductKeyInput {
  @Field(() => Int)
  @IsInt()
  offreId: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  badgeProductKey?: string; // MOBILE, FIBRE, DEPANSSUR, etc. (null pour retirer)
}

/** Input pour modifier le badgeProductKey de plusieurs offres */
@InputType()
export class BatchUpdateOffreBadgeProductKeyInput {
  @Field(() => [UpdateOffreBadgeProductKeyInput])
  offres: UpdateOffreBadgeProductKeyInput[];
}

// ============================================================================
// Badge Catalogue — Définitions de badges
// ============================================================================

/** Définition d'un badge dans le catalogue */
@ObjectType()
export class BadgeDefinitionType {
  @Field(() => Int)
  id: number;

  @Field()
  code: string;

  @Field()
  nom: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => PrismaBadgeCategory)
  category: PrismaBadgeCategory;

  @Field({ nullable: true })
  iconUrl?: string;

  @Field({ nullable: true })
  condition?: string; // JSON sérialisé pour GraphQL

  @Field(() => Int)
  tier: number;

  @Field()
  isActive: boolean;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

/** Input pour créer un badge */
@InputType()
export class CreateBadgeDefinitionInput {
  @Field()
  @IsString()
  @MaxLength(100)
  code: string;

  @Field()
  @IsString()
  @MaxLength(200)
  nom: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field(() => PrismaBadgeCategory)
  category: PrismaBadgeCategory;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  iconUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  condition?: string; // JSON string: {"metric":"contratsSignes","threshold":10}

  @Field(() => Int, { defaultValue: 0 })
  @IsInt()
  @Min(0)
  tier: number;
}

/** Input pour modifier un badge */
@InputType()
export class UpdateBadgeDefinitionInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nom?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field(() => PrismaBadgeCategory, { nullable: true })
  @IsOptional()
  category?: PrismaBadgeCategory;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  iconUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  condition?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  tier?: number;

  @Field({ nullable: true })
  @IsOptional()
  isActive?: boolean;
}

/** Résultat du seed badges */
@ObjectType()
export class SeedBadgesResult {
  @Field()
  success: boolean;

  @Field()
  message: string;

  @Field(() => Int)
  created: number;

  @Field(() => Int)
  skipped: number;

  @Field(() => Int)
  total: number;
}

// ============================================================================
// CommercialBadge — Attribution de badges
// ============================================================================

/** Badge attribué à un commercial */
@ObjectType()
export class CommercialBadgeType {
  @Field(() => Int)
  id: number;

  @Field(() => Int, { nullable: true })
  commercialId?: number;

  @Field(() => Int, { nullable: true })
  managerId?: number;

  @Field(() => Int)
  badgeDefinitionId: number;

  @Field()
  periodKey: string;

  @Field()
  awardedAt: Date;

  @Field({ nullable: true })
  metadata?: string; // JSON sérialisé

  @Field(() => BadgeDefinitionType, { nullable: true })
  badgeDefinition?: BadgeDefinitionType;
}

/** Input pour attribuer un badge */
@InputType()
export class AwardBadgeInput {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  commercialId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  managerId?: number;

  @Field(() => Int)
  @IsInt()
  badgeDefinitionId: number;

  @Field()
  @IsString()
  periodKey: string; // "2026-02-25", "2026-W09", "2026-02"

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  metadata?: string; // JSON string optionnel
}

/** Input pour attribuer plusieurs badges d'un coup */
@InputType()
export class BatchAwardBadgesInput {
  @Field(() => [AwardBadgeInput])
  awards: AwardBadgeInput[];
}

/** Résultat d'une attribution batch */
@ObjectType()
export class AwardBadgesResult {
  @Field()
  success: boolean;

  @Field()
  message: string;

  @Field(() => Int)
  awarded: number;

  @Field(() => Int)
  skipped: number; // Déjà attribués (idempotence)

  @Field(() => Int)
  total: number;
}

// ============================================================================
// ContratValide — Contrats validés cache WinLead+
// ============================================================================

/** Contrat validé sync depuis WinLead+ */
@ObjectType()
export class ContratValideType {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  externalContratId: number;

  @Field(() => Int)
  externalProspectId: number;

  @Field()
  commercialWinleadPlusId: string;

  @Field(() => Int, { nullable: true })
  commercialId?: number;

  @Field(() => Int, { nullable: true })
  managerId?: number;
  @Field(() => Int, { nullable: true })
  offreExternalId?: number;

  @Field(() => Int, { nullable: true })
  offreId?: number;
  @Field({ nullable: true })
  dateValidation?: Date;

  @Field({ nullable: true })
  dateSignature?: Date;

  @Field({ nullable: true })
  statutContrat?: string;

  @Field()
  periodDay: string;

  @Field()
  periodWeek: string;

  @Field()
  periodMonth: string;

  @Field()
  periodQuarter: string;

  @Field()
  periodYear: string;

  @Field({ nullable: true })
  metadata?: string; // JSON sérialisé

  @Field()
  syncedAt: Date;

  @Field()
  createdAt: Date;

  // --- Offre resolved fields ---
  @Field({ nullable: true })
  offreNom?: string;

  @Field({ nullable: true })
  offreCategorie?: string;

  @Field({ nullable: true })
  offreFournisseur?: string;

  @Field({ nullable: true })
  offreLogoUrl?: string;

  @Field(() => Int, { nullable: true })
  offrePoints?: number;
}
/** Résultat d'une synchro contrats */
@ObjectType()
export class SyncContratsResult {
  @Field()
  success: boolean;

  @Field()
  message: string;

  @Field(() => Int)
  created: number;

  @Field(() => Int)
  updated: number;

  @Field(() => Int)
  skipped: number; // Contrats non "Validé" ou sans commercialId

  @Field(() => Int)
  total: number;
}

// ============================================================================
// RankSnapshot — Classement / Ranking
// ============================================================================

/** Snapshot de classement d'un commercial ou manager */
@ObjectType()
export class RankSnapshotType {
  @Field(() => Int)
  id: number;

  @Field(() => Int, { nullable: true })
  commercialId?: number;

  @Field(() => Int, { nullable: true })
  managerId?: number;

  @Field(() => PrismaRankPeriod)
  period: PrismaRankPeriod;

  @Field()
  periodKey: string;

  @Field(() => Int)
  rank: number;

  @Field(() => Int)
  points: number;

  @Field(() => Int)
  contratsSignes: number;

  @Field()
  rankTierKey: string;

  @Field()
  rankTierLabel: string;

  @Field({ nullable: true })
  metadata?: string; // JSON sérialisé

  @Field()
  computedAt: Date;

  /** Nom du commercial (résolu via relation) */
  @Field({ nullable: true })
  commercialNom?: string;

  @Field({ nullable: true })
  commercialPrenom?: string;

  /** Nom du manager (résolu via relation) */
  @Field({ nullable: true })
  managerNom?: string;

  @Field({ nullable: true })
  managerPrenom?: string;
}

/** Input pour calculer/rafraîchir un classement */
@InputType()
export class ComputeRankingInput {
  @Field(() => PrismaRankPeriod)
  period: PrismaRankPeriod;

  @Field()
  @IsString()
  periodKey: string; // "2026-02-25", "2026-W09", "2026-02"
}

@ObjectType()
export class OffreDistributionEntry {
  @Field(() => Int)
  offreId: number;

  @Field()
  nom: string;

  @Field()
  categorie: string;

  @Field()
  fournisseur: string;

  @Field({ nullable: true })
  logoUrl?: string;

  @Field(() => Int)
  count: number;
}
