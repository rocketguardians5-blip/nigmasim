import { test, expect } from '@playwright/test'

const ORIGIN = 'http://127.0.0.1:5180'

test('pilot app demo-client-api-nigma: verifikasi seluruh 4 layar yang digenerate', async ({
  page,
}) => {
  const externalRequests: string[] = []
  const consoleErrors: string[] = []
  const cspMessages: string[] = []

  page.on('request', (request) => {
    const url = request.url()
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return
    if (new URL(url).origin !== ORIGIN) externalRequests.push(url)
  })

  // Playwright's page.on('console') captures all frames
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

  await page.addInitScript(() => {
    const target = window as unknown as { __cspViolations: string[] }
    target.__cspViolations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      target.__cspViolations.push(
        `${event.violatedDirective} blocked=${event.blockedURI || '(inline)'}`,
      )
    })
  })

  // 1. Masuk lewat Lobby
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /simulation runtime/i })).toBeVisible()

  const card = page.getByTestId('sim-card-demo-client-api-nigma')
  await expect(card).toBeVisible()
  await card.click()

  const frame = page.frameLocator('[data-testid="sim-frame"]')

  // 2. Layar 1: Login (/login)
  await expect(frame.getByTestId('page-login')).toBeVisible()
  await expect(frame.getByTestId('sim-form')).toBeVisible()
  await expect(frame.getByRole('button', { name: /masuk/i })).toBeVisible()

  // Isi form login (email & password required) - isi manual agar validasi pasti lolos
  await frame.getByTestId('field-email_username').fill('admin@nigma.id')
  await frame.getByTestId('field-password').fill('password')
  await frame.getByTestId('field-ingat_saya').check()

  // Submit login -> navigasi ke dashboard
  await frame.getByTestId('sim-form-submit').click()

  // Tunggu navigasi selesai di iframe (hash berubah ke #/dashboard)
  await expect(frame.getByTestId('page-dashboard')).toBeVisible({ timeout: 15000 })

  // 3. Layar 2: Dashboard (/dashboard)
  await expect(frame.getByTestId('page-dashboard')).toBeVisible()
  await expect(frame.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible()

  // 4. Layar 3: API Playground (/playground) via navigasi sidebar
  await frame.getByRole('link', { name: 'API Playground' }).click()
  await expect(frame.getByTestId('page-playground')).toBeVisible()

  // 5. Layar 4: Error Codes (/error-codes) via navigasi sidebar
  await frame.getByRole('link', { name: 'Error Codes' }).click()
  await expect(frame.getByTestId('page-error-codes')).toBeVisible()
  await expect(frame.getByTestId('table-daftar_error')).toBeVisible()

  // Verifikasi pencarian tabel lokal
  const searchInput = frame.getByTestId('search-daftar_error')
  await expect(searchInput).toBeVisible()
  await searchInput.fill('401')
  // Verifikasi filter berfungsi tanpa network request
  await expect(frame.getByRole('cell', { name: 'ERR-401', exact: true })).toBeVisible()

  // Reset data dari top bar
  await page.getByTestId('reset-data').click()
  await expect(page.getByTestId('reset-confirm')).toBeVisible()
  await page.getByTestId('reset-confirm-accept').click()

  // 6. Verifikasi isolasi keamanan & CSP
  expect(externalRequests, `Request keluar origin: ${externalRequests.join(', ')}`).toEqual([])
  expect(consoleErrors, `Console error: ${consoleErrors.join(' | ')}`).toEqual([])
  expect(cspMessages, `Pesan CSP: ${cspMessages.join(' | ')}`).toEqual([])
})