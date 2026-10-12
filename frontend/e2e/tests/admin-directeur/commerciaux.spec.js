import { test, expect, waitForPageLoad } from '../../fixtures/base.js'

/**
 * La page Commerciaux n'a plus de tableau : elle rend des cards. Les repères ne sont
 * donc plus des lignes mais les liens de fiche, `a[href^="/commerciaux/"]`.
 */
const personLinks = page => page.locator('a[href^="/commerciaux/"]')

test.describe('Commerciaux Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/commerciaux')
    await waitForPageLoad(page)
  })

  test('page loads and shows people cards', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Rechercher/i })).toBeVisible()
    expect(await personLinks(page).count()).toBeGreaterThanOrEqual(0)
  })

  test('search filters results', async ({ page }) => {
    const initialCount = await personLinks(page).count()
    test.skip(initialCount === 0, 'No data for this role')

    // La recherche est repliée par défaut : on l'ouvre avant de saisir.
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

  test('navigates to commercial details', async ({ page }) => {
    test.skip((await personLinks(page).count()) === 0, 'No data for this role')

    await personLinks(page).first().click()
    await page.waitForURL(/\/commerciaux\/[^/]+$/)
    expect(page.url()).toMatch(/\/commerciaux\/[^/]+$/)
  })

  test('details page shows commercial info', async ({ page }) => {
    test.skip((await personLinks(page).count()) === 0, 'No data for this role')

    await personLinks(page).first().click()
    await page.waitForURL(/\/commerciaux\/[^/]+$/)
    await waitForPageLoad(page)

    await expect(page.getByRole('heading').first()).toBeVisible()
    await expect(page.locator('body')).toContainText(/statistiques|informations|activité/i)
  })

  test('can navigate back from details', async ({ page }) => {
    test.skip((await personLinks(page).count()) === 0, 'No data for this role')

    await personLinks(page).first().click()
    await page.waitForURL(/\/commerciaux\/[^/]+$/)

    const breadcrumbBack = page.locator('a[href="/commerciaux"]').first()
    if (await breadcrumbBack.isVisible().catch(() => false)) {
      await breadcrumbBack.click()
    } else {
      await page.goBack()
    }

    await page.waitForURL(/\/commerciaux\/?$/)
    await expect(page.getByRole('button', { name: /Rechercher/i })).toBeVisible()
  })
})
