import { registerEnumType } from '@nestjs/graphql'

export enum CommercialNiveau {
  EN_FORMATION = 'EN_FORMATION',
  OPERATIONNEL = 'OPERATIONNEL',
  CONFIRME = 'CONFIRME',
  EXPERT = 'EXPERT',
}

registerEnumType(CommercialNiveau, {
  name: 'CommercialNiveau',
  description: 'Niveau d’un commercial : fixe son objectif de score coaching',
})
