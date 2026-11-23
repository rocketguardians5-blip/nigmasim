import { test, expect } from '@playwright/test'

const ORIGIN = 'http://127.0.0.1:5180'

test('runtime terisolasi dan alur data konsisten', async ({ page }) => {
  const externalRequests: string[] = []
  const consoleErrors: string[] = []
  const cspMessages: string[] = []

  page.on('request', (request) => {
    const url = request.url()
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return
    if (new URL(url).origin !== ORIGIN) externalRequests.push(url)
  })

  page.on('console', (message) => {
    const text = message.text()
    if (message.type() === 'error') consoleErrors.push(text)
    if (/Content Security Policy|Refused to (load|execute|connect|frame|apply)/i.test(text)) {
      cspMessages.push(text)
    }
  })

  page.on('pageerror', (error) => {
    consoleErrors.push(`pageerror: ${error.message}`)
  })

  // Kumpulkan pelanggaran CSP dari semua frame (lobby + iframe).
  await page.addInitScript(() => {
    const target = window as unknown as { __cspViolations: string[] }
    target.__cspViolations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      target.__cspViolations.push(
        `${event.violatedDirective} blocked=${event.blockedURI || '(inline)'}`,
      )
    })
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: /simulation runtime/i })).toBeVisible()

  // Buka simulasi di iframe.
  await page.getByTestId('sim-card-sales-force').click()
  const frame = page.frameLocator('[data-testid="sim-frame"]')

  await expect(frame.getByTestId('page-dashboard')).toBeVisible()
  await expect(frame.getByTestId('stat-total')).toHaveText('24')
  await expect(page.getByTestId('reset-data')).toBeEnabled()

  // Tambah pelanggan lewat form.
  await frame.getByRole('link', { name: 'Pelanggan', exact: true }).click()
  await frame.getByRole('link', { name: 'Tambah Pelanggan' }).click()
  await expect(frame.getByTestId('customer-form')).toBeVisible()

  await frame.getByLabel('Nama lengkap').fill('Zaki Uji Coba')
  await frame.getByLabel('Perusahaan').fill('PT Uji Otomatis')
  await frame.getByLabel('Email').fill('zaki.uji@example.test')
  await frame.getByLabel('Telepon').fill('+62 812-9999-0000')
  await frame.getByLabel('Tipe pelanggan').selectOption('Retail')
  await frame.getByLabel('Status').selectOption('Aktif')
  await frame.getByLabel('Provinsi').selectOption('Jawa Barat')

  // Dropdown kota bergantung pada provinsi.
  await expect(frame.getByLabel('Kota').locator('option')).toHaveCount(5) // placeholder + 4 kota
  await frame.getByLabel('Kota').selectOption('Bandung')

  await frame.getByTestId('submit-customer').click()

  // Data baru muncul di tabel.
  await expect(frame.getByTestId('page-customers')).toBeVisible()
  await expect(frame.getByText('Zaki Uji Coba').first()).toBeVisible()

  // Angka dashboard ikut berubah.
  await frame.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await expect(frame.getByTestId('stat-total')).toHaveText('25')

  // Reset dari bar atas mengembalikan seluruh data ke seed.
  await page.getByTestId('reset-data').click()
  await expect(page.getByTestId('reset-confirm')).toBeVisible()
  await page.getByTestId('reset-confirm-accept').click()
  await expect(frame.getByTestId('stat-total')).toHaveText('24')

  // Tidak boleh ada request ke luar origin runtime.
  expect(externalRequests, `Request keluar origin: ${externalRequests.join(', ')}`).toEqual([])

  // Tidak boleh ada error console / pelanggaran CSP.
  expect(consoleErrors, `Console error: ${consoleErrors.join(' | ')}`).toEqual([])

  const violations: string[] = []
  for (const current of page.frames()) {
    try {
      const found = await current.evaluate(
        () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
      )
      violations.push(...found)
    } catch {
      // frame sudah dilepas; abaikan
    }
  }
  expect(cspMessages, `Pesan CSP: ${cspMessages.join(' | ')}`).toEqual([])
  expect(violations, `Pelanggaran CSP: ${violations.join(' | ')}`).toEqual([])
})
