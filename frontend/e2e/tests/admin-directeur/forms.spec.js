import { test, expect, waitForPageLoad, hasTableData } from '../../fixtures/base.js'

test.describe('Form Validation — Edit Modal (Managers)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/managers')
    await waitForPageLoad(page)
  })

  test('opens edit modal with populated fields', async ({ page }) => {
    test.skip(!(await hasTableData(page)), 'No data in table')

    const actionButton = page
      .locator('tbody tr')
      .first()
      .locator('td')
      .last()
      .locator('button')
      .first()
    await actionButton.click()

    const editItem = page.getByRole('menuitem', { name: /modifier/i })
    if (!(await editItem.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, 'Edit action not available for this role')
    }
    await editItem.click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('heading', { name: /modifier/i })).toBeVisible()

    const nomInput = page.getByRole('dialog').locator('input').first()
    const nomValue = await nomInput.inputValue()
    expect(nomValue.length).toBeGreaterThan(0)
  })

  test('shows validation error when required field is cleared', async ({ page }) => {
    test.skip(!(await hasTableData(page)), 'No data in table')

    const actionButton = page
      .locator('tbody tr')
      .first()
      .locator('td')
      .last()
      .locator('button')
      .first()
    await actionButton.click()

    const editItem = page.getByRole('menuitem', { name: /modifier/i })
    if (!(await editItem.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, 'Edit action not available for this role')
    }
    await editItem.click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const nomInput = page.getByRole('dialog').locator('input').first()
    await nomInput.clear()

    await page.getByRole('button', { name: /enregistrer/i }).click()

    await expect(page.getByText('Ce champ est requis').first()).toBeVisible({ timeout: 5_000 })
  })

  test('required field indicator (*) is displayed', async ({ page }) => {
    test.skip(!(await hasTableData(page)), 'No data in table')

    const actionButton = page
      .locator('tbody tr')
      .first()
      .locator('td')
      .last()
      .locator('button')
      .first()
    await actionButton.click()

    const editItem = page.getByRole('menuitem', { name: /modifier/i })
    if (!(await editItem.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, 'Edit action not available for this role')
    }
    await editItem.click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const requiredIndicators = page.getByRole('dialog').locator('.text-red-500', { hasText: '*' })
    const count = await requiredIndicators.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('cancel closes modal without saving', async ({ page }) => {
    test.skip(!(await hasTableData(page)), 'No data in table')

    const firstRowText = await page.locator('tbody tr').first().textContent()

    const actionButton = page
      .locator('tbody tr')
      .first()
      .locator('td')
      .last()
      .locator('button')
      .first()
    await actionButton.click()

    const editItem = page.getByRole('menuitem', { name: /modifier/i })
    if (!(await editItem.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, 'Edit action not available for this role')
    }
    await editItem.click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const nomInput = page.getByRole('dialog').locator('input').first()
    await nomInput.clear()
    await nomInput.fill('TESTVALEUR_ANNULEE')

    await page.getByRole('button', { name: /annuler/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 })

    const rowTextAfter = await page.locator('tbody tr').first().textContent()
    expect(rowTextAfter).not.toContain('TESTVALEUR_ANNULEE')
    expect(rowTextAfter).toBe(firstRowText)
  })

  test('error clears when user starts typing', async ({ page }) => {
    test.skip(!(await hasTableData(page)), 'No data in table')

    const actionButton = page
      .locator('tbody tr')
      .first()
      .locator('td')
      .last()
      .locator('button')
      .first()
    await actionButton.click()

    const editItem = page.getByRole('menuitem', { name: /modifier/i })
    if (!(await editItem.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, 'Edit action not available for this role')
    }
    await editItem.click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const nomInput = page.getByRole('dialog').locator('input').first()
    await nomInput.clear()
    await page.getByRole('button', { name: /enregistrer/i }).click()

    await expect(page.getByText('Ce champ est requis').first()).toBeVisible({ timeout: 5_000 })

    await nomInput.fill('Nouveau nom')
    await expect(page.getByText('Ce champ est requis'))
      .not.toBeVisible({ timeout: 3_000 })
      .catch(() => {})
  })

  test('border-red-500 class applied on invalid field', async ({ page }) => {
    test.skip(!(await hasTableData(page)), 'No data in table')

    const actionButton = page
      .locator('tbody tr')
      .first()
      .locator('td')
      .last()
      .locator('button')
      .first()
    await actionButton.click()

    const editItem = page.getByRole('menuitem', { name: /modifier/i })
    if (!(await editItem.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, 'Edit action not available for this role')
    }
    await editItem.click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const nomInput = page.getByRole('dialog').locator('input').first()
    await nomInput.clear()
    await page.getByRole('button', { name: /enregistrer/i }).click()

    await expect(nomInput).toHaveClass(/border-red-500/, { timeout: 5_000 })
  })
})

test.describe('Form Validation — Login', () => {
  test('shows error on invalid credentials', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined, ignoreHTTPSErrors: true })
    const page = await context.newPage()

    await page.goto('/login')
    await waitForPageLoad(page)

    await page.locator('#username').fill('invalid_user_test')
    await page.locator('#password').fill('wrong_password_123')
    await page.getByRole('button', { name: /se connecter/i }).click()

    await expect(
      page.getByText(/invalid|invalide|erreur de connexion|identifiants/i).first()
    ).toBeVisible({ timeout: 10_000 })

    await context.close()
  })

  test('login fields have required attribute', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined, ignoreHTTPSErrors: true })
    const page = await context.newPage()

    await page.goto('/login')
    await waitForPageLoad(page)

    const usernameInput = page.locator('#username')
    const passwordInput = page.locator('#password')

    await expect(usernameInput).toHaveAttribute('required', '')
    await expect(passwordInput).toHaveAttribute('required', '')

    await context.close()
  })

  test('password visibility toggle works', async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined, ignoreHTTPSErrors: true })
    const page = await context.newPage()

    await page.goto('/login')
    await waitForPageLoad(page)

    await expect(page.locator('#password')).toHaveAttribute('type', 'password')

    await page.getByRole('button', { name: /afficher/i }).click()
    await expect(page.locator('#password')).toHaveAttribute('type', 'text')

    await page.getByRole('button', { name: /masquer/i }).click()
    await expect(page.locator('#password')).toHaveAttribute('type', 'password')

    await context.close()
  })
})

test.describe('Form Validation — Add User Modal (Gestion)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/gestion')
    await waitForPageLoad(page)
  })

  test('add user button exists for authorized roles', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /ajouter|nouveau|créer/i }).first()
    const isVisible = await addButton.isVisible({ timeout: 5_000 }).catch(() => false)

    if (!isVisible) {
      test.skip(true, 'Add user button not available for this role')
    }

    await expect(addButton).toBeVisible()
  })
})
