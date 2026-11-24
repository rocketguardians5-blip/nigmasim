import { test, expect } from '@playwright/test'

test('render mock definition dengan theme visual, element style, dan safe iconSvg', async ({
  page,
}) => {
  const consoleErrors: string[] = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  // Buka langsung aplikasi mock yang di-embed
  await page.goto('/?app=mock-theme')

  // 1. Verifikasi halaman auth ter-render
  await expect(page.getByTestId('page-login')).toBeVisible()

  // 2. Verifikasi heading judul menerapkan theme.text.heading
  const heading = page.getByRole('heading', { name: 'Portal Masuk Themed' })
  await expect(heading).toBeVisible()
  await expect(heading).toHaveCSS('color', 'rgb(248, 250, 252)')
  await expect(heading).toHaveCSS('font-size', '20px')
  await expect(heading).toHaveCSS('font-weight', '700')

  // 3. Verifikasi subtitle menerapkan theme.text.body
  const subtitle = page.getByText('Silakan masuk ke akun Anda')
  await expect(subtitle).toBeVisible()
  await expect(subtitle).toHaveCSS('color', 'rgb(148, 163, 184)')
  await expect(subtitle).toHaveCSS('font-size', '14px')

  // 4. Verifikasi tombol submit menerapkan theme.primary
  const submitBtn = page.getByTestId('sim-form-submit')
  await expect(submitBtn).toBeVisible()
  await expect(submitBtn).toHaveCSS('background-color', 'rgb(17, 24, 39)')
  await expect(submitBtn).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(submitBtn).toHaveCSS('border-radius', '9999px')

  // 5. Verifikasi iconSvg ter-render secara aman (img src="data:image/svg+xml...")
  const safeIcon = page.locator('img[src^="data:image/svg+xml"]')
  await expect(safeIcon).toBeVisible()

  // 6. Verifikasi field style diterapkan
  const emailInput = page.getByTestId('field-email')
  await expect(emailInput).toBeVisible()
  await expect(emailInput).toHaveCSS('border-color', 'rgb(71, 85, 105)')

  // 7. Verifikasi konsol bersih dari error
  expect(consoleErrors).toEqual([])
})
