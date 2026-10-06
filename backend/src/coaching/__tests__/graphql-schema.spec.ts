import { NestFactory } from '@nestjs/core';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import { printSchema } from 'graphql';
import { CoachingResolver } from '../coaching.resolver';
import { SynthesisResolver } from '../synthese-globale/synthesis.resolver';

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
      await factory.create([CoachingResolver, SynthesisResolver]),
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
    'ProductSheetDto',
    'ProductSheetForbiddenDto',
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

  it('expose la requête des fiches produit', () => {
    expect(sdl).toContain('coachingProductSheets');
  });

  it.each([
    'salesPlanVersions(slug: String!): [ReferenceVersionDto!]!',
    'productSheetVersions(slug: String!): [ReferenceVersionDto!]!',
    'importSalesPlan(markdown: String!): ActiveSalesPlanDto!',
    'activateSalesPlanVersion(id: Int!): ActiveSalesPlanDto!',
    'importProductSheet(markdown: String!): ProductSheetDto!',
    'activateProductSheetVersion(id: Int!): ProductSheetDto!',
    'deactivateProductSheet(slug: String!): Boolean!',
  ])('expose %s', (operation) => {
    expect(sdl).toContain(operation);
  });
});
