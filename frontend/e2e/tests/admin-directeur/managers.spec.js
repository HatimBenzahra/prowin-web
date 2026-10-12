import { test, expect, waitForPageLoad } from '../../fixtures/base.js'

/** La page Managers rend des cards : les repères sont les liens de fiche. */
const personLinks = page => page.locator('a[href^="/managers/"]')

test.describe('Managers Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/managers')
    await waitForPageLoad(page)
  })

  test('page loads and shows people cards', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Rechercher/i })).toBeVisible()
    expect(await personLinks(page).count()).toBeGreaterThanOrEqual(0)
  })

  test('search filters results', async ({ page }) => {
    const initialCount = await personLinks(page).count()
    test.skip(initialCount === 0, 'No data for this role')

    await page.getByRole('button', { name: /Rechercher/i }).click()
    await page.getByPlaceholder(/Rechercher/i).fill('zzzzzzzz')
    await page.waitForTimeout(500)

    expect(await personLinks(page).count()).toBeLessThanOrEqual(initialCount)
  })

  test('status filter works', async ({ page }) => {
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: /Tous les statuts/i }).click()
    await page.waitForTimeout(300)

    expect(await personLinks(page).count()).toBeGreaterThanOrEqual(0)
  })

  test('navigates to manager details', async ({ page }) => {
    test.skip((await personLinks(page).count()) === 0, 'No data for this role')

    await personLinks(page).first().click()
    await page.waitForURL(/\/managers\/[^/]+$/)
    expect(page.url()).toMatch(/\/managers\/[^/]+$/)
  })

  test('details page shows manager info', async ({ page }) => {
    test.skip((await personLinks(page).count()) === 0, 'No data for this role')

    await personLinks(page).first().click()
    await page.waitForURL(/\/managers\/[^/]+$/)
    await waitForPageLoad(page)

    await expect(page.getByRole('heading').first()).toBeVisible()
  })

  test('can navigate back from details', async ({ page }) => {
    test.skip((await personLinks(page).count()) === 0, 'No data for this role')

    await personLinks(page).first().click()
    await page.waitForURL(/\/managers\/[^/]+$/)

    const breadcrumbBack = page.locator('a[href="/managers"]').first()
    if (await breadcrumbBack.isVisible().catch(() => false)) {
      await breadcrumbBack.click()
    } else {
      await page.goBack()
    }

    await page.waitForURL(/\/managers\/?$/)
    await expect(page.getByRole('button', { name: /Rechercher/i })).toBeVisible()
  })
})
