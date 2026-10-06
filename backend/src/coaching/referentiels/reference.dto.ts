import { Field, Float, InputType, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class SalesPlanCriterionDto {
  @Field() key: string;
  @Field() label: string;
  @Field(() => Int) points: number;
  @Field() evidenceRequired: boolean;
  @Field() appliesWhen: string;
}

@ObjectType()
export class SalesPlanStepDto {
  @Field() key: string;
  @Field() label: string;
  @Field(() => Int) weight: number;
  @Field() appliesWhen: string;
  @Field(() => [SalesPlanCriterionDto]) criteria: SalesPlanCriterionDto[];
}

/** Le plan de vente d'un référentiel : sa grille et son markdown source. */
@ObjectType()
export class SalesPlanDto {
  @Field() slug: string;
  @Field() title: string;
  @Field(() => Int) scoringScale: number;
  @Field(() => [SalesPlanStepDto]) steps: SalesPlanStepDto[];
  @Field() rawMarkdown: string;
}

@ObjectType()
export class ProductSheetForbiddenDto {
  @Field() say: string;
  @Field() severity: string; // 'grave' | 'modere'
}

/** Le contenu jugeable d'une fiche et son markdown source. */
@ObjectType()
export class ReferenceProductSheetDto {
  @Field(() => [String]) facts: string[];
  @Field(() => [ProductSheetForbiddenDto]) forbidden: ProductSheetForbiddenDto[];
  @Field() rawMarkdown: string;
}

/** Une offre WinLead+ du catalogue local (table Offre). */
@ObjectType()
export class CoachingOffreDto {
  @Field(() => Int) externalId: number;
  @Field() nom: string;
  @Field(() => String, { nullable: true }) fournisseur: string | null;
  @Field() isActive: boolean;
  @Field(() => Float, { nullable: true }) prixBase: number | null;
}

/** Un produit du catalogue : identité, offres liées, fiche facultative. */
@ObjectType()
export class ReferenceProductDto {
  @Field() key: string;
  @Field() label: string;
  @Field(() => [String]) identifiers: string[];
  @Field(() => [String]) sttTerms: string[];
  @Field(() => [Int]) offreExternalIds: number[];
  @Field(() => String, { nullable: true }) offreFournisseur: string | null;
  /** Les offres liées par identifiant, retrouvées dans le catalogue local. */
  @Field(() => [CoachingOffreDto]) offres: CoachingOffreDto[];
  @Field(() => ReferenceProductSheetDto, { nullable: true }) sheet: ReferenceProductSheetDto | null;
}

@ObjectType()
export class ReferenceDto {
  @Field(() => Int) id: number;
  @Field() status: string; // DRAFT | PUBLISHED
  @Field(() => Int, { nullable: true }) version: number | null;
  @Field() isActive: boolean;
  /** Préfixe de l'empreinte : distingue deux contenus sans exposer le détail. */
  @Field(() => String, { nullable: true }) contentHash: string | null;
  @Field(() => String, { nullable: true }) createdBy: string | null;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
  @Field(() => String, { nullable: true }) publishedBy: string | null;
  @Field(() => Date, { nullable: true }) publishedAt: Date | null;
  @Field(() => SalesPlanDto, { nullable: true }) plan: SalesPlanDto | null;
  @Field(() => [ReferenceProductDto]) products: ReferenceProductDto[];
}

@ObjectType()
export class ReferenceIssueDto {
  @Field() level: string; // error | warning
  @Field() code: string;
  @Field() message: string;
  @Field(() => String, { nullable: true }) productKey: string | null;
  @Field(() => String, { nullable: true }) stepKey: string | null;
}

/** Le brouillon et ce que la validation en dit : une erreur bloque la publication. */
@ObjectType()
export class ReferenceDraftDto {
  @Field(() => ReferenceDto) reference: ReferenceDto;
  @Field(() => [ReferenceIssueDto]) issues: ReferenceIssueDto[];
}

/** Une ligne d'historique : de quoi choisir une version, sans son contenu. */
@ObjectType()
export class ReferenceVersionDto {
  @Field(() => Int) id: number;
  @Field(() => Int) version: number;
  @Field() isActive: boolean;
  @Field() contentHash: string;
  @Field(() => Date, { nullable: true }) publishedAt: Date | null;
  @Field(() => String, { nullable: true }) publishedBy: string | null;
}

@InputType()
export class ReferenceProductInput {
  @Field() key: string;
  @Field() label: string;
  @Field(() => [String]) identifiers: string[];
  @Field(() => [String]) sttTerms: string[];
  @Field(() => [Int]) offreExternalIds: number[];
  @Field(() => String, { nullable: true }) offreFournisseur?: string | null;
}
