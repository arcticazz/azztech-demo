import { chromium } from 'playwright-core'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const shots = path.join(root, 'shots')
const photoFile = path.join(root, 'scripts', 'demo-photo.png')
const base = process.env.DEMO_URL || 'http://127.0.0.1:4173/azztech-demo/'
const width = Number(process.env.VW || 390)

if (!process.env.NO_SHOTS) { await rm(shots, { recursive: true, force: true }); await mkdir(shots, { recursive: true }) }

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({
  viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
})
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
const errors = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`) })
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

const log = (...a) => console.log(...a)
const tid = (id) => page.getByTestId(id)
async function tap(id) { const l = tid(id); await l.scrollIntoViewIfNeeded(); await l.tap(); await page.waitForTimeout(120) }
async function shot(name, locator) {
  if (process.env.NO_SHOTS) return
  const dest = path.join(shots, name)
  if (locator) {
    const h = await page.evaluate(() => document.querySelector('.report').scrollHeight)
    await page.setViewportSize({ width, height: Math.ceil(h + 260) })
    await page.waitForTimeout(200)
    await locator.screenshot({ path: dest })
    await page.setViewportSize({ width, height: 844 })
    await page.waitForTimeout(100)
  } else await page.screenshot({ path: dest })
  log('shot', name)
}
async function overflow(label) {
  const r = await page.evaluate(() => {
    const doc = document.documentElement
    const bad = [...document.querySelectorAll('.scroll, .footer, .app-header, .sheet-card')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.className)
    return { sw: doc.scrollWidth, iw: window.innerWidth, bad }
  })
  if (r.sw > r.iw || r.bad.length) throw new Error(`Horizontal overflow at ${label}: ${JSON.stringify(r)}`)
}
async function taps() { return Number((await tid('tap-counter').innerText()).replace(/\D/g, '')) }
async function reading(id, value) {
  await tap(`reading-${id}`)
  for (const ch of value) await tid(`key-${ch}`).tap()
  await tid('pad-save').tap()
  await page.waitForTimeout(100)
}
async function touchSign() {
  const canvas = tid('sign-canvas')
  await canvas.waitFor({ state: 'visible' })
  const b = await canvas.boundingBox()
  const pts = []
  for (let i = 0; i <= 30; i++) {
    const t = i / 30
    pts.push({ x: b.x + 30 + t * (b.width - 60), y: b.y + b.height / 2 + Math.sin(t * Math.PI * 4) * (b.height / 4) })
  }
  const scrollBefore = await page.evaluate(() => document.querySelector('.sheet-card')?.scrollTop || 0)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] })
  for (const p of pts.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(100)
  const scrollAfter = await page.evaluate(() => document.querySelector('.sheet-card')?.scrollTop || 0)
  // Verify ink actually landed on the canvas (dark pixels present).
  const inked = await page.evaluate(() => {
    const c = document.querySelector('canvas.sign-canvas')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] < 100) n++
    return n
  })
  if (inked < 200) throw new Error(`Signature did not draw (dark px ${inked})`)
  if (scrollAfter !== scrollBefore) throw new Error('Sheet scrolled while signing')
  if (await tid('sign-accept').isDisabled()) throw new Error('Accept still disabled after drawing')
}
async function expectBlock(fragment) {
  await tap('whats-next')
  const msg = await tid('block-msg').innerText()
  if (!msg.includes(fragment)) throw new Error(`Expected block containing "${fragment}", got "${msg}"`)
  log('  blocked OK:', msg.slice(0, 90))
}
async function hashIs(h) { const cur = await page.evaluate(() => location.hash); if (cur !== h) throw new Error(`hash ${cur} != ${h}`) }

// ---------------- Start ----------------
const resp = await page.goto(base, { waitUntil: 'networkidle' })
log('status', resp.status())
await tid('start-ppm').waitFor()
await overflow('start')
await shot('00-start.png')

// ---------------- Scenario A: PPM ----------------
log('Scenario A')
await tap('start-ppm')
await tap('open-job')
await hashIs('#/ppm/open')
await tid('autofill-banner').waitFor()
await overflow('A open')
await shot('A1-job-autofill.png')
await tap('whats-next')
await hashIs('#/ppm/safety')
const hzA = await tid('hazard-count').innerText()
log('  PPM hazards:', hzA)
if (!(await tid('hazard-a2l').count())) throw new Error('A2L hazard missing for R32')
if (await tid('hazard-atex').count()) throw new Error('ATEX should not show for R32')
await expectBlock('Confirm that site conditions')
await overflow('A safety')
await shot('A2-risk-assessment.png')
// browser back / forward
await page.goBack(); await page.waitForTimeout(150); await hashIs('#/ppm/open')
await page.goForward(); await page.waitForTimeout(150); await hashIs('#/ppm/safety')
await tap('confirm-conditions')
await tap('sign-ra')
await touchSign()
await shot('A3-signature-pad.png')
await tid('sign-accept').tap()
await tid('ra-sig-img').waitFor()
await tap('whats-next')
await hashIs('#/ppm/work')
await expectBlock('Still to do')
await tap('pass-visual')
// real file upload path (camera input) for the required photo
await tid('photo-take-visual').locator('input').setInputFiles(photoFile)
await page.locator('[data-testid="check-visual"] img.photo-thumb').waitFor()
await reading('suction', '4.8')
await reading('discharge', '18.9')
await reading('superheat', '7.5')
await tap('fail-electrical')
await tid('create-followup-electrical').waitFor()
await tid('check-electrical').scrollIntoViewIfNeeded()
await shot('A4-checklist-failed-check.png')
await tap('create-followup-electrical')
const fuTxt = await tid('followup-box-electrical').innerText()
if (!fuTxt.includes('JOB-1043')) throw new Error('Follow-up JOB-1043 not shown')
await tap('photo-sample-electrical')
await tid('check-electrical').scrollIntoViewIfNeeded()
await shot('A5-followup-and-photo.png')
await tap('pass-condenser')
await tap('pass-leak')
await overflow('A work')
await tap('whats-next')
await hashIs('#/ppm/results')
await tid('followups-card').waitFor()
await shot('A6-results.png')
await tap('open-report')
await hashIs('#/ppm/report')
await page.goBack(); await page.waitForTimeout(150); await hashIs('#/ppm/results')
await tap('whats-next')
await hashIs('#/ppm/close')
await expectBlock('Engineer signature')
await tap('engineer-reuse')
await tap('customer-absent')
await tap('confirm-absent')
await overflow('A close')
await shot('A7-close-signatures.png')
await tap('whats-next')
await tid('done').waitFor()
const tapsA = Number((await tid('final-taps').innerText()).replace(/\D/g, ''))
log('  PPM taps:', tapsA)
await tid('jobs-list').waitFor()
await shot('A8-closed.png')
await tap('view-report')
await hashIs('#/ppm/report')
const repA = page.getByTestId('report')
const repTextA = await repA.innerText()
for (const s of ['JOB-1042', 'Demo Foods Ltd', 'CU-04', 'R32', 'Risk assessment', 'Electrical connections', 'FAIL', 'JOB-1043', 'Customer not present', 'Completed', 'Photos (2)']) {
  if (!repTextA.toLowerCase().includes(s.toLowerCase())) throw new Error(`Report A missing: ${s}`)
}
const imgsA = await repA.locator('img').count()
log('  report A images:', imgsA)
await overflow('A report')
await shot('A9-report-top.png')
await shot('A9-report-full.png', repA)
await tap('report-back')
await tid('done').waitFor()
await tap('home')
await tid('start-ppm').waitFor()

// ---------------- Scenario B: R290 ----------------
log('Scenario B')
await tap('start-r290')
await tap('open-job')
await tid('competence').waitFor()
await expectBlock('Claim this job')
await shot('B1-job-autofill-competence.png')
await tap('claim-job')
await tap('whats-next')
await hashIs('#/r290/safety')
for (const id of ['a3', 'atex', 'recovery', 'food', 'manualCabinet']) if (!(await tid(`hazard-${id}`).count())) throw new Error(`R290 hazard missing: ${id}`)
const hzB = await tid('hazard-count').innerText()
log('  R290 hazards:', hzB)
await shot('B2-risk-assessment-r290.png')
await tap('preview-R32')
const hzPrev = await tid('hazard-count').innerText()
if (await tid('hazard-atex').count()) throw new Error('ATEX should disappear when previewing R32')
log('  preview R32:', hzPrev)
await tap('preview-R290')
await tap('tag-hotworks')
await tid('hazard-hotworksA3').waitFor()
await tid('hazard-hotworksA3').scrollIntoViewIfNeeded()
await shot('B3-ra-hotworks-added.png')
await tap('confirm-conditions')
await tap('sign-ra')
await touchSign()
await tid('sign-accept').tap()
await tap('whats-next')
await hashIs('#/r290/work')
await tap('pass-confirm')
await tap('photo-sample-confirm')
await reading('box-temp', '-2')
await reading('lfl', '0')
await tap('pass-leak-found')
await reading('pressure', '15')
await tap('pass-running')
await tap('fail-caps')
await tap('create-followup-caps')
if (!(await tid('followup-box-caps').innerText()).includes('JOB-2118')) throw new Error('Follow-up JOB-2118 missing')
await tid('check-caps').scrollIntoViewIfNeeded()
await shot('B4-checklist-failed-check.png')
await tap('refrig-sample')
await tap('voice-mic')
await tid('voice-confirm-missing').waitFor({ timeout: 4000 })
await tap('voice-confirm-missing')
await tap('voice-approve')
await tid('check-confirm').scrollIntoViewIfNeeded()
await shot('B5-photo.png')
await overflow('B work')
await tap('whats-next')
await hashIs('#/r290/results')
await shot('B6-results.png')
await tap('whats-next')
await hashIs('#/r290/close')
await tap('customer-sign')
await touchSign()
await shot('B7-customer-signature.png')
await tid('sign-accept').tap()
await tap('engineer-sign')
await touchSign()
await tid('sign-accept').tap()
await page.waitForTimeout(100)
await shot('B8-close-signatures.png')
await tap('whats-next')
await tid('done').waitFor()
const tapsB = Number((await tid('final-taps').innerText()).replace(/\D/g, ''))
log('  R290 taps:', tapsB)
await shot('B9-closed.png')
await tap('view-report')
const repB = page.getByTestId('report')
const repTextB = await repB.innerText()
for (const s of ['JOB-2117', 'R290', 'Temporary flammable zone', 'Brazing on a hydrocarbon circuit', 'recovered', '0.145', 'JOB-2118', 'Sam Patel', 'Leak at the suction schrader', 'outside typical']) {
  if (!repTextB.toLowerCase().includes(s.toLowerCase())) throw new Error(`Report B missing: ${s}`)
}
log('  report B images:', await repB.locator('img').count())
await shot('B10-report-top.png')
await shot('B10-report-full.png', repB)

// Back from done goes home; Stop work path
await tap('report-back')
await tap('again')
await tap('start-ppm'); await tap('open-job'); await tap('whats-next'); await tap('stop-work')
await page.getByText('Work stopped').waitFor()
await page.getByRole('button', { name: 'Back to scenarios' }).tap()
await tid('start-ppm').waitFor()

// Deep link to a step without state falls back to start
await page.goto(`${base}#/r290/work`, { waitUntil: 'networkidle' })
await tid('start-ppm').waitFor()
await hashIs('#/')
await page.reload({ waitUntil: 'networkidle' })
await page.goto(`${base}#/ppm/close`, { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' })
await tid('start-ppm').waitFor()
await hashIs('#/')
// 404 fallback page also boots the app
const r404 = await page.goto(`${base}some/deep/link`, { waitUntil: 'networkidle' })
log('404 status', r404.status())

const real = errors.filter((e) => !/Download the React DevTools/.test(e))
log('console errors/warnings:', real.length ? real : 'none')
log(JSON.stringify({ tapsA, tapsB, hzA, hzB, hzPrev }))
await browser.close()
if (real.length) process.exit(2)
