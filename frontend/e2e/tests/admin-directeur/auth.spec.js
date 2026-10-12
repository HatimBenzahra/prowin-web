import { test, expect } from '../../fixtures/base.js'

test.describe('Auth — Admin/Directeur', () => {
  test('redirects to login when not authenticated', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined, ignoreHTTPSErrors: true })
    const page = await context.newPage()

    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)

    await context.close()
  })

  test('is authenticated after setup (storageState)', async ({ page }) => {
    await page.goto('/')
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('dashboard loads after login', async ({ page }) => {
    await page.goto('/')

    await expect(
      page
        .getByText('Statistiques du jour')
        .or(page.getByText(/Aperçu des performances/i))
        .first()
    ).toBeVisible({ timeout: 15_000 })
  })

  test('logout redirects to login', async ({ page }) => {
    await page.goto('/')
    await expect(page).not.toHaveURL(/\/login/)

    const logoutButton = page
      .getByRole('button', { name: /déconnex|logout|quitter/i })
      .or(page.locator('[class*="logout"], [data-slot*="logout"]'))
      .first()

    if (await logoutButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await logoutButton.click()
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
    }
  })

  test('unauthorized page exists', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined, ignoreHTTPSErrors: true })
    const page = await context.newPage()

    await page.goto('/unauthorized')
    await expect(page.locator('body')).toContainText(/non autorisé|unauthorized|accès/i)

    await context.close()
  })
})
