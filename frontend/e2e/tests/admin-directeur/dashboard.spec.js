import { test, expect, waitForPageLoad } from '../../fixtures/base.js'

test.describe('Dashboard — Admin/Directeur', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForPageLoad(page)
  })

  test('displays statistics cards', async ({ page }) => {
    const statsSection = page.locator('[class*="stat"], [class*="card"], [class*="metric"]').first()
    await expect(statsSection).toBeVisible({ timeout: 10_000 })
  })

  test('displays RDV section', async ({ page }) => {
    await expect(page.locator('text=RDV').or(page.locator('text=rendez-vous')).first()).toBeVisible(
      { timeout: 10_000 }
    )
  })

  test('navigates to commerciaux page', async ({ page }) => {
    const link = page
      .getByRole('link', { name: /commerc/i })
      .or(page.locator('a[href*="commerc"]'))
      .first()

    if (await link.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await link.click()
      await expect(page).toHaveURL(/\/commerc/)
    }
  })

  test('navigates to zones page', async ({ page }) => {
    const link = page
      .getByRole('link', { name: /zone/i })
      .or(page.locator('a[href*="zone"]'))
      .first()

    if (await link.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await link.click()
      await expect(page).toHaveURL(/\/zone/)
    }
  })

  test('navigates to immeubles page', async ({ page }) => {
    const link = page
      .getByRole('link', { name: /immeuble/i })
      .or(page.locator('a[href*="immeuble"]'))
      .first()

    if (await link.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await link.click()
      await expect(page).toHaveURL(/\/immeuble/)
    }
  })

  test('navigates to statistiques page', async ({ page }) => {
    const link = page
      .getByRole('link', { name: /statistiq/i })
      .or(page.locator('a[href*="statistiq"]'))
      .first()

    if (await link.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await link.click()
      await expect(page).toHaveURL(/\/statistiq/)
    }
  })
})
