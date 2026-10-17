import {
  Field,
  Float,
  GraphQLISODateTime,
  InputType,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

@InputType()
export class AcquiscanTerritoryGeoJsonInput {
  @Field()
  @IsString()
  @IsIn(['departments', 'communes'])
  level: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^(\d{2,3}|2A|2B)$/i)
  dept?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  deptName?: string;
}

@InputType()
export class AcquiscanAddressesInput {
  @Field()
  @IsString()
  @Matches(/^(\d{2,3}|2A|2B)$/i)
  dept: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^\d{5}$/)
  commune?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^(all|current|future|\d{4})$/)
  annee?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  search?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'yes', 'no'])
  fiber?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'eleve', 'moyen', 'faible'])
  coverage4g?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'eleve', 'moyen', 'faible'])
  coverage5g?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'urgent', 'chaud', 'tiede', 'froid'])
  segment?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;

  @Field({ nullable: true })
  @IsOptional()
  enrichCoordinates?: boolean;
}

@ObjectType()
export class AcquiscanCoordinate {
  @Field(() => Float, { nullable: true })
  latitude?: number | null;

  @Field(() => Float, { nullable: true })
  longitude?: number | null;

  @Field(() => Float, { nullable: true })
  imbX?: number | null;

  @Field(() => Float, { nullable: true })
  imbY?: number | null;

  @Field(() => String, { nullable: true })
  source?: string | null;

  @Field(() => String, { nullable: true })
  matchKey?: string | null;
}

@ObjectType()
export class AcquiscanAddress {
  @Field()
  immeubleId: string;

  @Field(() => String, { nullable: true })
  imbCode?: string | null;

  @Field(() => String, { nullable: true })
  addrNumero?: string | null;

  @Field(() => String, { nullable: true })
  addrNomVoie?: string | null;

  @Field(() => String, { nullable: true })
  addrNomCommune?: string | null;

  @Field(() => String, { nullable: true })
  codeInsee?: string | null;

  @Field(() => String, { nullable: true })
  nbrLogements?: string | null;

  @Field(() => String, { nullable: true })
  fermetureTechnique?: string | null;

  @Field(() => String, { nullable: true })
  fermetureComZone?: string | null;

  @Field(() => String, { nullable: true })
  fermetureComAddr?: string | null;

  @Field(() => String, { nullable: true })
  eligFo?: string | null;

  @Field(() => String, { nullable: true })
  anneeFt?: string | null;

  @Field(() => Int, { nullable: true })
  sites4g?: number | null;

  @Field(() => Int, { nullable: true })
  sites5g?: number | null;

  @Field(() => Int, { nullable: true })
  sitesTotal?: number | null;

  @Field(() => AcquiscanCoordinate, { nullable: true })
  coordinates?: AcquiscanCoordinate | null;

  @Field()
  hasCoordinates: boolean;
}

@ObjectType()
export class AcquiscanImportStatus {
  @Field()
  dept: string;

  @Field()
  isImported: boolean;

  @Field()
  importedCount: number;

  @Field(() => GraphQLISODateTime, { nullable: true })
  importedAt?: Date | null;
}

@ObjectType()
export class AcquiscanAddressesPage {
  @Field(() => [AcquiscanAddress])
  rows: AcquiscanAddress[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  enrichedCount: number;

  @Field(() => AcquiscanImportStatus)
  importStatus: AcquiscanImportStatus;
}

@InputType()
export class AcquiscanAddressSearchInput {
  @Field()
  @IsString()
  query: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

@ObjectType()
export class AcquiscanAddressSuggestion {
  @Field()
  id: string;

  @Field()
  label: string;

  @Field(() => String, { nullable: true })
  city?: string | null;

  @Field(() => String, { nullable: true })
  postcode?: string | null;

  @Field(() => String, { nullable: true })
  codeInsee?: string | null;

  @Field(() => Float)
  latitude: number;

  @Field(() => Float)
  longitude: number;

  @Field(() => Float, { nullable: true })
  score?: number | null;
}

@ObjectType()
export class AcquiscanOpportunitySummary {
  @Field(() => Int)
  totalBuildings: number;

  @Field(() => Int)
  fiberBuildings: number;

  @Field(() => Int)
  copperBuildings: number;

  @Field(() => Int)
  copperShutdown: number;

  @Field(() => Float)
  fiberRate: number;

  @Field(() => Float)
  copperShutdownRate: number;

  @Field(() => Int, { nullable: true })
  closestShutdownYear?: number | null;

  @Field(() => Int)
  sites4g: number;

  @Field(() => Int)
  sites5g: number;

  @Field(() => Int)
  sitesTotal: number;

  @Field(() => Int)
  opportunityScore: number;
}

@ObjectType()
export class AcquiscanDepartmentOpportunity {
  @Field()
  codeDept: string;

  @Field(() => AcquiscanOpportunitySummary)
  summary: AcquiscanOpportunitySummary;
}

@ObjectType()
export class AcquiscanDepartmentOpportunitiesPage {
  @Field(() => [AcquiscanDepartmentOpportunity])
  rows: AcquiscanDepartmentOpportunity[];

  @Field(() => AcquiscanOpportunitySummary)
  summary: AcquiscanOpportunitySummary;
}

@InputType()
export class AcquiscanCommuneOpportunitiesInput {
  @Field()
  @IsString()
  @Matches(/^(\d{2,3}|2A|2B)$/i)
  dept: string;
}

@ObjectType()
export class AcquiscanCommuneOpportunity {
  @Field()
  codeInsee: string;

  @Field(() => String, { nullable: true })
  nomCommune?: string | null;

  @Field()
  codeDept: string;

  @Field(() => AcquiscanOpportunitySummary)
  summary: AcquiscanOpportunitySummary;
}

@ObjectType()
export class AcquiscanCommuneOpportunitiesPage {
  @Field(() => [AcquiscanCommuneOpportunity])
  rows: AcquiscanCommuneOpportunity[];

  @Field(() => AcquiscanOpportunitySummary)
  summary: AcquiscanOpportunitySummary;
}

@InputType()
export class AcquiscanCopperBuildingsInput {
  @Field()
  @IsString()
  @Matches(/^(\d{2,3}|2A|2B)$/i)
  dept: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^\d{5}$/)
  commune?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^(all|current|future|\d{4})$/)
  annee?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  search?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'yes', 'no'])
  fiber?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'eleve', 'moyen', 'faible'])
  coverage4g?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'eleve', 'moyen', 'faible'])
  coverage5g?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'urgent', 'chaud', 'tiede', 'froid'])
  segment?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

@ObjectType()
export class AcquiscanCopperBuildingOpportunity extends AcquiscanAddress {
  @Field(() => Int)
  opportunityScore: number;

  @Field()
  opportunityLabel: string;
}

@ObjectType()
export class AcquiscanCopperBuildingsPage {
  @Field(() => [AcquiscanCopperBuildingOpportunity])
  rows: AcquiscanCopperBuildingOpportunity[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  limit: number;

  @Field(() => Int)
  offset: number;
}

@InputType()
export class AcquiscanBoundsInput {
  @Field(() => Float)
  @IsNumber()
  west: number;

  @Field(() => Float)
  @IsNumber()
  south: number;

  @Field(() => Float)
  @IsNumber()
  east: number;

  @Field(() => Float)
  @IsNumber()
  north: number;
}

@InputType()
export class AcquiscanMapInput {
  @Field(() => AcquiscanBoundsInput)
  bounds: AcquiscanBoundsInput;

  @Field(() => Float)
  @IsNumber()
  zoom: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^(\d{2,3}|2A|2B)$/i)
  dept?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^\d{5}$/)
  commune?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  search?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^(all|current|future|\d{4})$/)
  annee?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'yes', 'no'])
  fiber?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'eleve', 'moyen', 'faible'])
  coverage4g?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'eleve', 'moyen', 'faible'])
  coverage5g?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'urgent', 'chaud', 'tiede', 'froid'])
  segment?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  cluster?: boolean;
}

@ObjectType()
export class AcquiscanMapPoint {
  @Field()
  id: string;

  @Field()
  immeubleId: string;

  @Field(() => String, { nullable: true })
  imbCode?: string | null;

  @Field(() => String, { nullable: true })
  addrNumero?: string | null;

  @Field(() => String, { nullable: true })
  addrNomVoie?: string | null;

  @Field(() => String, { nullable: true })
  addrNomCommune?: string | null;

  @Field(() => String, { nullable: true })
  codeInsee?: string | null;

  @Field(() => String, { nullable: true })
  nbrLogements?: string | null;

  @Field(() => String, { nullable: true })
  fermetureTechnique?: string | null;

  @Field(() => String, { nullable: true })
  fermetureComZone?: string | null;

  @Field(() => String, { nullable: true })
  fermetureComAddr?: string | null;

  @Field(() => String, { nullable: true })
  eligFo?: string | null;

  @Field(() => String, { nullable: true })
  anneeFt?: string | null;

  @Field(() => Int, { nullable: true })
  sites4g?: number | null;

  @Field(() => Int, { nullable: true })
  sites5g?: number | null;

  @Field(() => Int, { nullable: true })
  sitesTotal?: number | null;

  @Field()
  dept: string;

  @Field(() => Float)
  latitude: number;

  @Field(() => Float)
  longitude: number;
}

@ObjectType()
export class AcquiscanMapCluster {
  @Field()
  id: string;

  @Field(() => Float)
  latitude: number;

  @Field(() => Float)
  longitude: number;

  @Field(() => Int)
  count: number;
}

@ObjectType()
export class AcquiscanDepartmentCoverage {
  @Field()
  dept: string;

  @Field(() => Int)
  importedCount: number;

  @Field(() => GraphQLISODateTime, { nullable: true })
  importedAt?: Date | null;
}

@ObjectType()
export class AcquiscanMapResult {
  @Field(() => [AcquiscanMapPoint])
  points: AcquiscanMapPoint[];

  @Field(() => [AcquiscanMapCluster])
  clusters: AcquiscanMapCluster[];

  @Field(() => Int)
  totalInBounds: number;

  @Field(() => Int)
  returnedCount: number;

  @Field()
  tooManyResults: boolean;

  @Field()
  clustered: boolean;

  @Field(() => [AcquiscanDepartmentCoverage])
  coverage: AcquiscanDepartmentCoverage[];
}

@InputType()
export class AcquiscanZonePreviewInput {
  @Field(() => Float)
  @IsNumber()
  longitude: number;

  @Field(() => Float)
  @IsNumber()
  latitude: number;

  @Field(() => Float)
  @IsNumber()
  @Min(50)
  @Max(10000)
  radiusMeters: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^(\d{2,3}|2A|2B)$/i)
  dept?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^\d{5}$/)
  commune?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^(all|current|future|\d{4})$/)
  annee?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'yes', 'no'])
  fiber?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'eleve', 'moyen', 'faible'])
  coverage4g?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'eleve', 'moyen', 'faible'])
  coverage5g?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsIn(['all', 'urgent', 'chaud', 'tiede', 'froid'])
  segment?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

@ObjectType()
export class AcquiscanZoneTargetPreview extends AcquiscanMapPoint {
  @Field(() => Float)
  distanceMeters: number;

  @Field(() => Int)
  opportunityScore: number;
}

@ObjectType()
export class AcquiscanZonePreviewSummary {
  @Field(() => Int)
  totalTargets: number;

  @Field(() => Int)
  totalLogements: number;

  @Field(() => Int)
  noFiberTargets: number;

  @Field(() => Int)
  fiberTargets: number;

  @Field(() => Int)
  copperClosureTargets: number;

  @Field(() => Int)
  strong4gTargets: number;

  @Field(() => Int)
  strong5gTargets: number;

  @Field(() => Int)
  averageOpportunityScore: number;
}

@ObjectType()
export class AcquiscanZonePreviewResult {
  @Field(() => [AcquiscanZoneTargetPreview])
  targets: AcquiscanZoneTargetPreview[];

  @Field(() => AcquiscanZonePreviewSummary)
  summary: AcquiscanZonePreviewSummary;

  @Field(() => Int)
  totalInCircle: number;

  @Field()
  tooManyResults: boolean;
}

@InputType()
export class CreateAcquiscanZoneInput extends AcquiscanZonePreviewInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  nom: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  selectedImmeubleIds?: string[];

  @Field(() => Int, { nullable: true })
  @IsOptional()
  directeurId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  managerId?: number;
}
