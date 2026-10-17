import {
  test,
  expect,
  waitForPageLoad,
  navigateToRowDetails,
  hasTableData,
} from '../../fixtures/base.js'

test.describe('Zones Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/zones')
    await waitForPageLoad(page)
  })

  test('page loads and shows zones list', async ({ page }) => {
    await expect(page.getByRole('table').first()).toBeVisible()
  })

  test('zone shows assignment info in table rows', async ({ page }) => {
    test.skip(!(await hasTableData(page)), 'No data in table for this role')
    await expect(page.getByRole('columnheader', { name: /Assigné à/i })).toBeVisible()
    await expect(page.locator('tbody tr').first()).toBeVisible()
  })

  test('navigates to zone details', async ({ page }) => {
    test.skip(!(await hasTableData(page)), 'No data in table for this role')
    await navigateToRowDetails(page)
    await page.waitForURL(/\/zones\/[^/]+$/)
    expect(page.url()).toMatch(/\/zones\/[^/]+$/)
  })

  test('details page shows zone info and assignments', async ({ page }) => {
    test.skip(!(await hasTableData(page)), 'No data in table for this role')
    await navigateToRowDetails(page)
    await page.waitForURL(/\/zones\/[^/]+$/)
    await waitForPageLoad(page)

    await expect(page.getByRole('heading').first()).toBeVisible()
    await expect(page.locator('body')).toContainText(/zone|assignation|coordonnées|rayon/i)
  })

  test('historique page loads', async ({ page }) => {
    await page.goto('/zones/historique')
    await waitForPageLoad(page)

    await expect(page.getByRole('heading', { name: /Historique des Zones/i })).toBeVisible()
    await expect(page.getByRole('table').first()).toBeVisible()
  })

  test('assignations page loads', async ({ page }) => {
    await page.goto('/zones/assignations')
    await waitForPageLoad(page)

    await expect(page.getByRole('table').first()).toBeVisible()
    await expect(page.locator('body')).toContainText(/assignation|zone/i)
  })

  test('create zone button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Nouvelle Zone' })).toBeVisible()
  })
})
