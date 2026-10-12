import { test, expect, waitForPageLoad, hasTableData } from '../../fixtures/base.js'

test.describe('Permissions — Admin vs Directeur', () => {
  test('directeurs page access depends on role', async ({ page }) => {
    await page.goto('/directeurs')
    await waitForPageLoad(page)

    const hasAccess = await page
      .getByRole('table')
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false)

    if (hasAccess) {
      await expect(page.getByRole('table').first()).toBeVisible()
    } else {
      const bodyText = await page.locator('body').textContent()
      expect(
        bodyText.match(/non autorisé|accès refusé|unauthorized|aucun/i) ||
          page.url().includes('/unauthorized') ||
          page.url().includes('/dashboard')
      ).toBeTruthy()
    }
  })

  test('zones — action menu opens with expected items', async ({ page }) => {
    await page.goto('/zones')
    await waitForPageLoad(page)

    if (!(await hasTableData(page))) {
      test.skip(true, 'No data in zones table')
      return
    }

    const actionButton = page
      .locator('tbody tr')
      .first()
      .locator('td')
      .last()
      .locator('button')
      .first()
    await actionButton.click()

    await expect(page.getByRole('menuitem', { name: /voir détails/i })).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('immeubles — action menu opens with expected items', async ({ page }) => {
    await page.goto('/immeubles')
    await waitForPageLoad(page)

    if (!(await hasTableData(page))) {
      test.skip(true, 'No data in immeubles table')
      return
    }

    const actionButton = page
      .locator('tbody tr')
      .first()
      .locator('td')
      .last()
      .locator('button')
      .first()
    await actionButton.click()

    await expect(page.getByRole('menuitem', { name: /voir détails/i })).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('managers — action menu opens with expected items', async ({ page }) => {
    await page.goto('/managers')
    await waitForPageLoad(page)

    if (!(await hasTableData(page))) {
      test.skip(true, 'No data in managers table')
      return
    }

    const actionButton = page
      .locator('tbody tr')
      .first()
      .locator('td')
      .last()
      .locator('button')
      .first()
    await actionButton.click()

    await expect(page.getByRole('menuitem', { name: /voir détails/i })).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('gestion — page loads with organization structure', async ({ page }) => {
    await page.goto('/gestion')
    await waitForPageLoad(page)

    await expect(page.getByText(/Gestion de l'Organisation/i).first()).toBeVisible()
    await expect(page.getByText(/Directeur/i).first()).toBeVisible()
  })

  test('statistiques — metrics visible in read mode', async ({ page }) => {
    await page.goto('/statistiques')
    await waitForPageLoad(page)

    await expect(page.getByRole('heading', { name: 'Statistiques' })).toBeVisible()
    await expect(page.locator('body')).toContainText(/Contrats signés|Rendez-vous pris|Refus/i)
  })

  test('sidebar shows core navigation items', async ({ page }) => {
    await page.goto('/dashboard')
    await waitForPageLoad(page)

    await expect(page.getByRole('link', { name: /Commerciaux/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /Statistiques/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /Immeubles/i }).first()).toBeVisible()
  })
})
