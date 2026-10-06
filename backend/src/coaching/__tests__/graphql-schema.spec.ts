import { NestFactory } from '@nestjs/core';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import { printSchema } from 'graphql';
import { CoachingResolver } from '../coaching.resolver';
import { SynthesisResolver } from '../synthese-globale/synthesis.resolver';
import { ReferenceResolver } from '../referentiels/reference.resolver';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';

/** Un `@Field` nullable sans thunk passe le build et crashe au runtime : on construit le schéma pour de vrai. */
describe('schéma GraphQL coaching', () => {
  let sdl: string;

  beforeAll(async () => {
    const app = await NestFactory.create(GraphQLSchemaBuilderModule, {
      logger: false,
    });
    await app.init();
    const factory = app.get(GraphQLSchemaFactory);
    sdl = printSchema(
      await factory.create([CoachingResolver, SynthesisResolver, ReferenceResolver]),
    );
    await app.close();
  }, 30_000);

  it('se construit sans UndefinedTypeError', () => {
    expect(sdl.length).toBeGreaterThan(0);
  });

  it.each([
    'CoachingAnalysisDto',
    'CoachingViolationDto',
    'CoachingMappedProductDto',
    'ReferenceDto',
    'ReferenceProductDto',
    'ReferenceDraftDto',
    'ReferenceIssueDto',
    'CoachingOffreDto',
    'SalesPlanDto',
  ])('expose le type %s', (type) => {
    expect(sdl).toContain(`type ${type} {`);
  });

  it.each([
    'scoreBeforeMalus',
    'malus',
    'violations',
    'detectedProducts',
    'productMapping',
  ])(
    'expose CoachingAnalysisDto.%s',
    (field) => {
      const block = /type CoachingAnalysisDto \{([^}]*)\}/.exec(sdl);
      expect(block).not.toBeNull();
      expect(block![1]).toContain(field);
    },
  );

  // Sans la ligne du plan à l'écran, un manager ne peut pas discuter l'écart.
  it.each(['quote', 'sheetSays', 'planSays'])(
    'expose CoachingViolationDto.%s',
    (field) => {
      const block = /type CoachingViolationDto \{([^}]*)\}/.exec(sdl);
      expect(block).not.toBeNull();
      expect(block![1]).toContain(field);
    },
  );

  // Une violation d'avant la règle des trois citations n'a pas `planSays` ; le
  // champ étant non-nullable, une seule ligne fautive annulait toute la réponse.
  it('les citations d’une violation sont non-nullables', () => {
    const block = /type CoachingViolationDto \{([^}]*)\}/.exec(sdl);
    expect(block).not.toBeNull();
    for (const f of ['quote: String!', 'sheetSays: String!', 'planSays: String!']) {
      expect(block![1]).toContain(f);
    }
  });

  it.each([
    'activeReference: ReferenceDto',
    'referenceVersions: [ReferenceVersionDto!]!',
    'referenceVersion(id: Int!): ReferenceDto!',
    'referenceDraft: ReferenceDraftDto',
    'coachingOffres: [CoachingOffreDto!]!',
    'openReferenceDraft: ReferenceDraftDto!',
    'setReferenceDraftPlan(markdown: String!): ReferenceDraftDto!',
    'saveReferenceDraftProduct(product: ReferenceProductInput!): ReferenceDraftDto!',
    'setReferenceDraftProductSheet(key: String!, markdown: String!): ReferenceDraftDto!',
    'removeReferenceDraftProduct(key: String!): ReferenceDraftDto!',
    'publishReferenceDraft: ReferenceDto!',
    'discardReferenceDraft: Boolean!',
    'activateReferenceVersion(id: Int!): ReferenceDto!',
  ])('expose %s', (operation) => {
    expect(sdl).toContain(operation);
  });

  it.each([
    'coachingProductSheets',
    'activeSalesPlan',
    'salesPlanVersions',
    'productSheetVersions',
    'importSalesPlan',
    'importProductSheet',
    'activateSalesPlanVersion',
    'activateProductSheetVersion',
  ])('n’expose plus l’opération retirée %s', (operation) => {
    expect(sdl).not.toContain(`${operation}(`);
    expect(sdl).not.toContain(`  ${operation}:`);
  });

  // Lecture : admin et directeur ; toute écriture du référentiel : admin seulement.
  it('les mutations du référentiel sont réservées aux admins, ses requêtes aux admins et directeurs', () => {
    const queries = ['activeReference', 'referenceVersions', 'referenceVersion', 'referenceDraft', 'coachingOffres'];
    const mutations = ['openReferenceDraft', 'setReferenceDraftPlan', 'saveReferenceDraftProduct', 'setReferenceDraftProductSheet', 'removeReferenceDraftProduct', 'publishReferenceDraft', 'discardReferenceDraft', 'activateReferenceVersion'];
    const roles = (method: string) => Reflect.getMetadata(ROLES_KEY, (ReferenceResolver.prototype as any)[method]);
    for (const method of mutations) expect(roles(method)).toEqual(['admin']);
    for (const method of queries) expect(roles(method)).toEqual(['admin', 'directeur']);
  });
});
