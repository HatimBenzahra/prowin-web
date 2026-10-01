import { describe, expect, it } from 'vitest'
import { productComplianceMessage } from './product-compliance'

describe('honest product comparison messaging', () => {
  it('does not infer verified conformity from a detected product in old rows', () => {
    expect(productComplianceMessage({ detectedProducts: ['orchard'], violations: [] })).toEqual({
      warning: false,
      text: 'Aucun écart détecté — vérification non renseignée.',
    })
  })
  it('shows incomplete grids and validated uncertainty as orange, without a penalty', () => {
    expect(productComplianceMessage({ productVerification: { status: 'partial' } })).toMatchObject({
      warning: true,
      text: expect.stringContaining('vérification partielle'),
    })
    expect(
      productComplianceMessage({
        productVerification: { status: 'verified' },
        productAlerts: [{ quote: 'Paiement' }],
      })
    ).toMatchObject({ warning: true, text: expect.stringContaining('sans malus') })
  })
  it('keeps fully supplied comparison context neutral and bounded', () => {
    expect(productComplianceMessage({ productVerification: { status: 'verified' } })).toEqual({
      warning: false,
      text: 'Aucun écart détecté dans le contexte vérifié — fiche et grille certifiée disponibles pour les produits identifiés.',
    })
  })
})
