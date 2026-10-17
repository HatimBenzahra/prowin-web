import { IsEmail, IsString, IsEnum, IsOptional } from 'class-validator';
import {
  InputType,
  Field,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';

export enum RoleUtilisateur {
  DIRECTEUR = 'directeur',
  MANAGER = 'manager',
  COMMERCIAL = 'commercial',
}

registerEnumType(RoleUtilisateur, {
  name: 'RoleUtilisateur',
  description: "Rôle de l'utilisateur dans Pro Win",
});

@InputType()
export class CreerUtilisateurInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string;

  @Field()
  @IsString()
  nom: string;

  @Field()
  @IsString()
  prenom: string;

  @Field(() => RoleUtilisateur)
  @IsEnum(RoleUtilisateur)
  role: RoleUtilisateur;
}

@ObjectType()
export class ReponseCreationUtilisateur {
  @Field()
  success: boolean;

  @Field({ nullable: true })
  password?: string;

  @Field({ nullable: true })
  userId?: string;

  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  message?: string;
}

@InputType()
export class SupprimerUtilisateurInput {
  @Field()
  @IsEmail()
  email: string;
}

@ObjectType()
export class ReponseSupprimerUtilisateur {
  @Field()
  success: boolean;

  @Field({ nullable: true })
  message?: string;
}

@InputType()
export class ModifierUtilisateurInput {
  @Field()
  @IsEmail()
  email: string;

  @Field()
  @IsString()
  nouveauMotDePasse: string;
}

@ObjectType()
export class ReponseModifierUtilisateur {
  @Field()
  success: boolean;

  @Field({ nullable: true })
  message?: string;
}

// Keep old names for backward compatibility during transition
export type CreerUtilisateurDto = CreerUtilisateurInput;
export type ReponseCreationUtilisateurDto = ReponseCreationUtilisateur;
