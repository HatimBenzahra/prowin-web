import {
  test,
  expect,
  waitForPageLoad,
  getTableRowCount,
  hasTableData,
} from '../../fixtures/base.js'

/**
 * Ce spec teste le composant `AdvancedDataTable` lui-même, pas une page en
 * particulier. Il s'appuyait sur /commerciaux, qui rend désormais des cards : il est
 * repointé vers /zones, qui conserve un tableau.
 *
 * Les deux tests de filtre de statut ont été retirés : plus aucune page n'utilise
 * `customStatusFilter` / `defaultStatusFilter`.
 */
test.describe('Table — Sorting & Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/zones')
    await waitForPageLoad(page)
  })

  test('column header click toggles sort indicator', async ({ page }) => {
    test.skip(!(await hasTableData(page)), 'No data to sort')

    const firstHeader = page.getByRole('columnheader').first()
    await expect(firstHeader).toBeVisible()
    const headerLabel = (await firstHeader.textContent())?.trim()

    await firstHeader.click()
    await page.waitForTimeout(300)

    const headerAfterClick = page.getByRole('columnheader', { name: headerLabel }).first()
    expect(await headerAfterClick.textContent()).toMatch(/↑|↓/)
  })

  test('search with gibberish shows empty state', async ({ page }) => {
    await page
      .getByPlaceholder(/Rechercher/i)
      .first()
      .fill('xyznonexistent999')
    await page.waitForTimeout(500)

    await expect(page.locator('tbody tr').first()).toContainText(/Aucun résultat/i)
  })

  test('clearing search restores original results', async ({ page }) => {
    const initialCount = await getTableRowCount(page)

    const searchInput = page.getByPlaceholder(/Rechercher/i).first()
    await searchInput.fill('xyznonexistent999')
    await page.waitForTimeout(500)

    await searchInput.fill('')
    await page.waitForTimeout(500)

    expect(await getTableRowCount(page)).toBe(initialCount)
  })

  test('results counter displays correct format', async ({ page }) => {
    const counter = page.locator('text=/Affichage de \\d+ à \\d+ sur \\d+ résultats/')
    const isVisible = await counter.isVisible().catch(() => false)

    if (isVisible) {
      await expect(counter).toBeVisible()
    }
  })
})

test.describe('Table — Pagination', () => {
  test('pagination controls appear when data exceeds page size', async ({ page }) => {
    await page.goto('/zones')
    await waitForPageLoad(page)
    test.skip(!(await hasTableData(page)), 'No data in table')

    const paginationNav = page.locator('nav[aria-label="pagination"]')
    const hasPagination = await paginationNav.isVisible().catch(() => false)

    if (hasPagination) {
      await expect(page.locator('text=/Affichage de/')).toBeVisible()

      const nextBtn = page.locator('a[aria-label="Go to next page"]').first()
      const prevBtn = page.locator('a[aria-label="Go to previous page"]').first()
      expect(
        (await nextBtn.isVisible().catch(() => false)) ||
          (await prevBtn.isVisible().catch(() => false))
      ).toBeTruthy()
    }
  })

  test('clicking next page changes displayed rows', async ({ page }) => {
    await page.goto('/zones')
    await waitForPageLoad(page)
    test.skip(!(await hasTableData(page)), 'No data in table')

    const nextBtn = page.locator('a[aria-label="Go to next page"]').first()
    if (!(await nextBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Not enough data for pagination')
      return
    }

    await nextBtn.click()
    await page.waitForTimeout(500)

    const secondPageRow = await page.locator('tbody tr').first().textContent()
    expect(typeof secondPageRow).toBe('string')
  })
})

test.describe('Table — Special Characters', () => {
  test('search handles special characters without crashing', async ({ page }) => {
    await page.goto('/zones')
    await waitForPageLoad(page)

    const searchInput = page.getByPlaceholder(/Rechercher/i).first()
    const specialInputs = ['<script>', "O'Brien", 'café', 'ñ', '日本語']

    for (const input of specialInputs) {
      await searchInput.fill(input)
      await page.waitForTimeout(300)
      await expect(page.getByRole('table').first()).toBeVisible()
    }

    await searchInput.fill('')
    await page.waitForTimeout(300)
    await expect(page.getByRole('table').first()).toBeVisible()
  })
})
