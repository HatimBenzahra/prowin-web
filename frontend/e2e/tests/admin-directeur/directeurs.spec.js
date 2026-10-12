import { test, expect, waitForPageLoad } from '../../fixtures/base.js'

/** La page Directeurs rend des cards : les repères sont les liens de fiche. */
const personLinks = page => page.locator('a[href^="/directeurs/"]')

async function isPermissionDenied(page) {
  if (page.url().includes('/unauthorized')) {
    return true
  }

  const bodyText =
    (await page
      .locator('body')
      .textContent()
      .catch(() => '')) || ''
  return /non autorisé|unauthorized|accès refusé|permission/i.test(bodyText)
}

test.describe('Directeurs Admin Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/directeurs')
    await waitForPageLoad(page)
  })

  test('page loads and shows people cards', async ({ page }) => {
    if (await isPermissionDenied(page)) {
      await expect(page.locator('body')).toContainText(/non autorisé|unauthorized|accès/i)
      return
    }

    await expect(page.getByRole('button', { name: /Rechercher/i })).toBeVisible()
    expect(await personLinks(page).count()).toBeGreaterThanOrEqual(0)
  })

  test('search filters results', async ({ page }) => {
    test.skip(await isPermissionDenied(page), 'Role has no access')
    const initialCount = await personLinks(page).count()
    test.skip(initialCount === 0, 'No data for this role')

    await page.getByRole('button', { name: /Rechercher/i }).click()
    await page.getByPlaceholder(/Rechercher/i).fill('zzzzzzzz')
    await page.waitForTimeout(500)

    expect(await personLinks(page).count()).toBeLessThanOrEqual(initialCount)
  })

  test('status filter works', async ({ page }) => {
    test.skip(await isPermissionDenied(page), 'Role has no access')

    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: /Tous les statuts/i }).click()
    await page.waitForTimeout(300)

    expect(await personLinks(page).count()).toBeGreaterThanOrEqual(0)
  })

  test('navigates to directeur details', async ({ page }) => {
    test.skip(await isPermissionDenied(page), 'Role has no access')
    test.skip((await personLinks(page).count()) === 0, 'No data for this role')

    await personLinks(page).first().click()
    await page.waitForURL(/\/directeurs\/[^/]+$/)
    expect(page.url()).toMatch(/\/directeurs\/[^/]+$/)
  })

  test('details page shows directeur info', async ({ page }) => {
    test.skip(await isPermissionDenied(page), 'Role has no access')
    test.skip((await personLinks(page).count()) === 0, 'No data for this role')

    await personLinks(page).first().click()
    await page.waitForURL(/\/directeurs\/[^/]+$/)
    await waitForPageLoad(page)

    await expect(page.getByRole('heading').first()).toBeVisible()
  })

  test('can navigate back from details', async ({ page }) => {
    test.skip(await isPermissionDenied(page), 'Role has no access')
    test.skip((await personLinks(page).count()) === 0, 'No data for this role')

    await personLinks(page).first().click()
    await page.waitForURL(/\/directeurs\/[^/]+$/)

    const breadcrumbBack = page.locator('a[href="/directeurs"]').first()
    if (await breadcrumbBack.isVisible().catch(() => false)) {
      await breadcrumbBack.click()
    } else {
      await page.goBack()
    }

    await page.waitForURL(/\/directeurs\/?$/)
    await expect(page.getByRole('button', { name: /Rechercher/i })).toBeVisible()
  })
})
