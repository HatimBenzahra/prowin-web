import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PrismaService } from '../../prisma.service';
import { ProductContent } from '../coaching-api.client';
import { ReferenceDraftState, ReferenceService, ReferenceWithProducts } from './reference.service';
import {
  CoachingOffreDto,
  ReferenceDraftDto,
  ReferenceDto,
  ReferenceProductInput,
  ReferenceVersionDto,
  SalesPlanDto,
} from './reference.dto';

type AuthenticatedUser = { id: number; role: string; email?: string | null };

/** Auteur d'une écriture : l'e-mail Keycloak, sinon le rôle et l'id du compte. */
const author = (user: AuthenticatedUser): string => user.email?.trim() || `${user.role}#${user.id}`;

const SHORT_HASH = 12;

/**
 * Référentiel coaching (plan de vente + catalogue de produits). Lecture : admin et
 * directeur. Écriture (brouillon, publication, réactivation) : admin seulement.
 */
@Resolver()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReferenceResolver {
  constructor(private readonly references: ReferenceService, private readonly prisma: PrismaService) {}

  @Query(() => ReferenceDto, { nullable: true })
  @Roles('admin', 'directeur')
  async activeReference(): Promise<ReferenceDto | null> {
    const reference = await this.references.getActive();
    return reference ? this.toDto(reference) : null;
  }

  @Query(() => [ReferenceVersionDto])
  @Roles('admin', 'directeur')
  async referenceVersions(): Promise<ReferenceVersionDto[]> {
    return (await this.references.listPublished()).map(v => ({ ...v, version: v.version!, contentHash: v.contentHash!.slice(0, SHORT_HASH) }));
  }

  @Query(() => ReferenceDto)
  @Roles('admin', 'directeur')
  async referenceVersion(@Args('id', { type: () => Int }) id: number): Promise<ReferenceDto> {
    return this.toDto(await this.references.getPublished(id));
  }

  @Query(() => ReferenceDraftDto, { nullable: true })
  @Roles('admin', 'directeur')
  async referenceDraft(): Promise<ReferenceDraftDto | null> {
    const draft = await this.references.getDraft();
    return draft ? this.toDraftDto(draft) : null;
  }

  /** Le catalogue d'offres WinLead+ synchronisé, pour lier un produit à ses prix. */
  @Query(() => [CoachingOffreDto])
  @Roles('admin', 'directeur')
  coachingOffres(): Promise<CoachingOffreDto[]> {
    return this.prisma.offre.findMany({
      select: { externalId: true, nom: true, fournisseur: true, isActive: true, prixBase: true },
      orderBy: [{ fournisseur: 'asc' }, { nom: 'asc' }],
    });
  }

  @Mutation(() => ReferenceDraftDto)
  @Roles('admin')
  async openReferenceDraft(@CurrentUser() user: AuthenticatedUser): Promise<ReferenceDraftDto> {
    return this.toDraftDto(await this.references.openDraft(author(user)));
  }

  @Mutation(() => ReferenceDraftDto)
  @Roles('admin')
  async setReferenceDraftPlan(@Args('markdown') markdown: string): Promise<ReferenceDraftDto> {
    return this.toDraftDto(await this.references.setDraftPlan(markdown));
  }

  @Mutation(() => ReferenceDraftDto)
  @Roles('admin')
  async saveReferenceDraftProduct(@Args('product') product: ReferenceProductInput): Promise<ReferenceDraftDto> {
    return this.toDraftDto(await this.references.saveDraftProduct({ ...product, offreFournisseur: product.offreFournisseur ?? null }));
  }

  @Mutation(() => ReferenceDraftDto)
  @Roles('admin')
  async setReferenceDraftProductSheet(@Args('key') key: string, @Args('markdown') markdown: string): Promise<ReferenceDraftDto> {
    return this.toDraftDto(await this.references.setDraftProductSheet(key, markdown));
  }

  @Mutation(() => ReferenceDraftDto)
  @Roles('admin')
  async removeReferenceDraftProduct(@Args('key') key: string): Promise<ReferenceDraftDto> {
    return this.toDraftDto(await this.references.removeDraftProduct(key));
  }

  /** Publie le brouillon : il devient la version active des prochaines analyses. */
  @Mutation(() => ReferenceDto)
  @Roles('admin')
  async publishReferenceDraft(@CurrentUser() user: AuthenticatedUser): Promise<ReferenceDto> {
    return this.toDto(await this.references.publishDraft(author(user)));
  }

  @Mutation(() => Boolean)
  @Roles('admin')
  discardReferenceDraft(): Promise<boolean> {
    return this.references.discardDraft();
  }

  @Mutation(() => ReferenceDto)
  @Roles('admin')
  async activateReferenceVersion(@Args('id', { type: () => Int }) id: number): Promise<ReferenceDto> {
    return this.toDto(await this.references.activate(id));
  }

  private async toDraftDto(state: ReferenceDraftState): Promise<ReferenceDraftDto> {
    return {
      reference: await this.toDto(state.reference),
      issues: state.issues.map(i => ({ level: i.level, code: i.code, message: i.message, productKey: i.productKey ?? null, stepKey: i.stepKey ?? null })),
    };
  }

  private async toDto(reference: ReferenceWithProducts): Promise<ReferenceDto> {
    const ids = [...new Set(reference.products.flatMap(p => p.offreExternalIds))];
    const offres = ids.length
      ? await this.prisma.offre.findMany({ where: { externalId: { in: ids } }, select: { externalId: true, nom: true, fournisseur: true, isActive: true, prixBase: true } })
      : [];
    return {
      id: reference.id,
      status: reference.status,
      version: reference.version,
      isActive: reference.isActive,
      contentHash: reference.contentHash?.slice(0, SHORT_HASH) ?? null,
      createdBy: reference.createdBy,
      createdAt: reference.createdAt,
      updatedAt: reference.updatedAt,
      publishedBy: reference.publishedBy,
      publishedAt: reference.publishedAt,
      plan: this.toPlanDto(reference),
      products: reference.products.map(product => {
        const content = product.sheetContent as unknown as ProductContent | null;
        return {
          key: product.key,
          label: product.label,
          identifiers: product.identifiers,
          sttTerms: product.sttTerms,
          offreExternalIds: product.offreExternalIds,
          offreFournisseur: product.offreFournisseur,
          offres: offres.filter(o => product.offreExternalIds.includes(o.externalId)),
          sheet: product.sheetMarkdown && content
            ? { facts: content.facts, forbidden: content.forbidden.map(f => ({ say: f.say, severity: f.severity })), rawMarkdown: product.sheetMarkdown }
            : null,
        };
      }),
    };
  }

  private toPlanDto(reference: ReferenceWithProducts): SalesPlanDto | null {
    const plan = this.references.planOf(reference);
    if (!plan || !reference.planMarkdown) return null;
    return {
      slug: plan.slug,
      title: plan.title,
      scoringScale: plan.scoringScale,
      rawMarkdown: reference.planMarkdown,
      steps: (plan.steps ?? []).map(s => ({
        key: s.key,
        label: s.label,
        weight: s.weight,
        appliesWhen: s.appliesWhen,
        criteria: (s.criteria ?? []).map(c => ({
          key: c.key,
          label: c.label,
          points: c.points,
          evidenceRequired: c.evidenceRequired === true,
          appliesWhen: c.appliesWhen ?? s.appliesWhen,
        })),
      })),
    };
  }
}
