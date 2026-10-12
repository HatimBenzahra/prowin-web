import { test, expect, waitForPageLoad } from '../../fixtures/base.js'

test.describe('Gestion Organization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/gestion')
    await waitForPageLoad(page)
  })

  test('page loads with organization heading and info card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: "Gestion de l'Organisation" })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Drag & Drop/i })).toBeVisible()
    await expect(page.locator('body')).toContainText(/Structure hiérarchique/i)
  })

  test('shows status filter select', async ({ page }) => {
    await expect(page.getByText(/Filtrer par statut/i).first()).toBeVisible()
    await expect(page.getByRole('combobox').first()).toBeVisible()
  })

  test('shows organization tree and optional unassigned panel', async ({ page }) => {
    await expect(page.getByText(/Directeur/i).first()).toBeVisible()

    const nonAssignesVisible = await page
      .getByText(/Non assignés/i)
      .first()
      .isVisible()
      .catch(() => false)
    if (nonAssignesVisible) {
      await expect(page.getByText(/Non assignés/i).first()).toBeVisible()
    }
  })

  test('status filter dropdown options are usable', async ({ page }) => {
    const statusSelect = page.getByRole('combobox').first()
    await statusSelect.click()
    await page.getByRole('option').first().click()
    await expect(page.getByText(/Gestion de l'Organisation/i).first()).toBeVisible()
  })
})
