import { hasPermission, PERMISSIONS, ROLES } from './roleFilters'

describe('hasPermission', () => {
  it('allows admin to view/add/edit/delete directeurs', () => {
    expect(hasPermission(ROLES.ADMIN, 'directeurs', 'view')).toBe(true)
    expect(hasPermission(ROLES.ADMIN, 'directeurs', 'add')).toBe(true)
    expect(hasPermission(ROLES.ADMIN, 'directeurs', 'edit')).toBe(true)
    expect(hasPermission(ROLES.ADMIN, 'directeurs', 'delete')).toBe(true)
  })

  it('denies directeur view permission on directeurs', () => {
    expect(hasPermission(ROLES.DIRECTEUR, 'directeurs', 'view')).toBe(false)
  })

  it('allows directeur to view/add/edit commerciaux', () => {
    expect(hasPermission(ROLES.DIRECTEUR, 'commerciaux', 'view')).toBe(true)
    expect(hasPermission(ROLES.DIRECTEUR, 'commerciaux', 'add')).toBe(true)
    expect(hasPermission(ROLES.DIRECTEUR, 'commerciaux', 'edit')).toBe(true)
  })

  it('denies directeur delete permission on zones', () => {
    expect(hasPermission(ROLES.DIRECTEUR, 'zones', 'delete')).toBe(false)
  })

  it('returns false when manager has no permission for action', () => {
    expect(hasPermission(ROLES.MANAGER, 'commerciaux', 'view')).toBe(false)
  })

  it('returns false for invalid entity', () => {
    expect(hasPermission(ROLES.ADMIN, 'invalid-entity', 'view')).toBe(false)
  })
})

describe('ROLES and PERMISSIONS constants', () => {
  it('defines admin, directeur, manager and commercial roles', () => {
    expect(ROLES).toMatchObject({
      ADMIN: 'admin',
      DIRECTEUR: 'directeur',
      MANAGER: 'manager',
      COMMERCIAL: 'commercial',
    })
  })

  it('defines all expected entities for admin permissions', () => {
    expect(Object.keys(PERMISSIONS.admin).sort()).toEqual(
      [
        'dashboard',
        'commerciaux',
        'managers',
        'directeurs',
        'zones',
        'immeubles',
        'statistics',
        'gps-tracking',
        'ecoutes',
        'coaching',
        'gestion',
        'gamification',
        'kiosk',
      ].sort()
    )
  })

  it('sets directeur directeurs view permission to false', () => {
    expect(PERMISSIONS.directeur.directeurs.view).toBe(false)
  })
})
