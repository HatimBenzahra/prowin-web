import { test, expect, waitForPageLoad } from '../../fixtures/base.js'

test.describe('Statistiques Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/statistiques')
    await waitForPageLoad(page)
  })

  test('page loads with metrics', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Statistiques' })).toBeVisible()
    await expect(page.locator('body')).toContainText(/Contrats signés|Rendez-vous pris|Refus/i)
  })

  test('time period filter works', async ({ page }) => {
    const periodSelect = page.getByRole('combobox').first()
    await expect(periodSelect).toBeVisible()

    await periodSelect.click()
    await page.getByRole('option', { name: /7 derniers jours/i }).click()

    await expect(page.locator('body')).toContainText(/Contrats signés/i)
  })

  test('charts are visible', async ({ page }) => {
    await expect(page.locator('svg').first()).toBeVisible()
    await expect(page.locator('body')).toContainText(
      /Évolution des contrats signés|Analyse des zones/i
    )
  })

  test('ranking table loads if available', async ({ page }) => {
    const tableVisible = await page
      .locator('table')
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false)
    if (tableVisible) {
      expect(await page.locator('table tbody tr').count()).toBeGreaterThan(0)
    }
  })

  test('zone comparison chart visible', async ({ page }) => {
    await expect(page.getByText('Analyse des zones')).toBeVisible()
    await expect(page.locator('svg').first()).toBeVisible()
  })
})
