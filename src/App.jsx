import { useEffect, useMemo, useRef, useState } from 'react'
import { ENGINEER, CUSTOMER, SCENARIOS, STEPS, REFRIGERANTS, OPTIONAL_TAGS } from './data.js'
import { Report, rangeTone, checkDone, hazardsFor, co2e, formatNow } from './Report.jsx'
import { NumberPad, SignPad, PhotoField, IconBack } from './widgets.jsx'

const ORDER = ['open', 'safety', 'work', 'results', 'close', 'done']

function workMissing(scenario, job) {
  const missing = []
  for (const item of scenario.checks) {
    const v = job.checks[item.id] || {}
    if (item.required && !checkDone(item, v)) missing.push(item.type === 'reading' ? `${item.label} reading` : `${item.label} (pass or fail)`)
    if (item.photoRequired && !v.photo) missing.push(`Photo: ${item.label}`)
    if (v.result === 'fail' && !job.followUps[item.id]) missing.push(`Follow-up job for failed check “${item.label}”`)
  }
  if (!scenario.refrigerantDefaultNone && !job.refrigerant.none && !job.refrigerant.movements.length) {
    missing.push('Refrigerant log (log a movement, or confirm none)')
  }
  if (scenario.voice && job.voice.phase === 'draft' && !job.voice.approved) missing.push('Approve or discard the voice findings')
  return missing
}

function followUpFor(scenario, item) {
  return item.followUp || { title: `Rectify failed check: ${item.label} on ${scenario.asset.code}`, priority: 'Within 7 days' }
}

function emptyState(scenario) {
  return {
    step: 'open',
    maxStep: 0,
    claimed: !!scenario.assigned,
    competenceAck: !scenario.competence,
    conditions: false,
    tags: [],
    raSignature: null,
    raSignedAt: null,
    checks: {},
    refrigerant: { none: !!scenario.refrigerantDefaultNone, movements: [] },
    followUps: {},
    notes: '',
    voice: { phase: 'idle', confirmed: {}, answers: {}, approved: false },
    engineerSig: null,
    engineerSignedAt: null,
    signoff: null,
    stopped: false,
    closedAt: null,
  }
}

function parseHash(hash) {
  const m = /^#\/(ppm|r290)?(?:\/(open|safety|work|results|close|done|report))?\/?$/.exec(hash || '')
  if (!m) return { scenario: null, part: null }
  return { scenario: m[1] || null, part: m[2] || null }
}

export default function App() {
  const [screen, setScreen] = useState('start')
  const [scenarioId, setScenarioId] = useState(null)
  const [job, setJob] = useState(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [taps, setTaps] = useState(0)
  const [showTaps, setShowTaps] = useState(true)
  const [offline, setOffline] = useState(false)
  const [savedBanner, setSavedBanner] = useState(false)
  const [padItem, setPadItem] = useState(null)
  const [signMode, setSignMode] = useState(null)
  const [blockMsg, setBlockMsg] = useState('')
  const [logOpen, setLogOpen] = useState(false)
  const [logForm, setLogForm] = useState({ type: 'recovered', kg: '', cylinder: 'CYL-208' })
  const [notPresentOpen, setNotPresentOpen] = useState(false)
  const [notPresentReason, setNotPresentReason] = useState('Nobody on site')
  const [previewRef, setPreviewRef] = useState(null)
  const [toast, setToast] = useState('')

  const scenario = scenarioId ? SCENARIOS[scenarioId] : null
  const step = job?.step

  // Hash routing so iOS swipe-back and the browser Back button stay inside the demo.
  let routeHash = '#/'
  if (screen === 'list' && scenarioId) routeHash = `#/${scenarioId}`
  else if (screen === 'job' && scenarioId && job) routeHash = reportOpen ? `#/${scenarioId}/report` : `#/${scenarioId}/${step}`
  const firstRoute = useRef(true)
  const stateRef = useRef({})
  stateRef.current = { scenarioId, job }

  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false
      if (window.location.hash !== routeHash) window.history.replaceState(null, '', routeHash)
      return
    }
    if (window.location.hash !== routeHash) window.history.pushState(null, '', routeHash)
  }, [routeHash])

  useEffect(() => {
    const onPop = () => {
      const { scenario: sid, part } = parseHash(window.location.hash)
      const { scenarioId: cur, job: curJob } = stateRef.current
      setPadItem(null); setSignMode(null); setLogOpen(false); setNotPresentOpen(false); setBlockMsg(''); setPreviewRef(null)
      if (!sid || sid !== cur || !curJob) { goHome(); window.history.replaceState(null, '', '#/'); return }
      if (!part) { setReportOpen(false); setScreen('list'); return }
      if (part === 'report') { setScreen('job'); setReportOpen(true); return }
      setReportOpen(false)
      if (curJob.step === 'done' && part !== 'done') { goHome(); return }
      setScreen('job')
      if (ORDER.indexOf(part) <= curJob.maxStep) setJob((j) => ({ ...j, step: part }))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document.querySelectorAll('.scroll').forEach((el) => { el.scrollTop = 0 })
  }, [screen, step, reportOpen])

  useEffect(() => {
    if (!offline) { setSavedBanner(false); return undefined }
    setSavedBanner(true)
    const t = setTimeout(() => setSavedBanner(false), 2600)
    return () => clearTimeout(t)
  }, [offline, job, taps])

  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(t)
  }, [toast])

  function goHome() {
    setScreen('start')
    setScenarioId(null)
    setJob(null)
    setReportOpen(false)
    setTaps(0)
    setBlockMsg('')
    setPadItem(null)
    setSignMode(null)
    setLogOpen(false)
    setNotPresentOpen(false)
    setPreviewRef(null)
  }

  const startScenario = (id) => {
    goHome()
    setScenarioId(id)
    setJob(emptyState(SCENARIOS[id]))
    setScreen('list')
  }

  const patch = (fn) => setJob((cur) => ({ ...cur, ...fn(cur) }))
  const workTap = () => setTaps((n) => n + 1)
  const go = (target) => {
    setBlockMsg('')
    setPreviewRef(null)
    patch((cur) => ({ step: target, maxStep: Math.max(cur.maxStep, ORDER.indexOf(target)) }))
  }

  const missing = useMemo(() => (scenario && job ? workMissing(scenario, job) : []), [scenario, job])

  const block = (prefix, msgs) => setBlockMsg(`${prefix}: ${msgs[0]}${msgs.length > 1 ? ` (and ${msgs.length - 1} more)` : ''}.`)

  const nextAction = () => {
    if (!job) return
    if (job.step === 'open') {
      if (!job.claimed) { setBlockMsg('Claim this job before you start.'); return }
      if (!job.competenceAck) { setBlockMsg('Acknowledge the competence warning before you start.'); return }
      go('safety')
      return
    }
    if (job.step === 'safety') {
      if (previewRef) { setBlockMsg('You are previewing another refrigerant. Tap the asset’s own refrigerant to go back.'); return }
      const m = []
      if (!job.conditions) m.push('Confirm that site conditions match the assessment')
      if (!job.raSignature) m.push('Sign the risk assessment before work starts')
      if (m.length) { block('Before work starts', m); return }
      go('work')
      return
    }
    if (job.step === 'work') {
      if (missing.length) { block('Still to do', missing); return }
      go('results')
      return
    }
    if (job.step === 'results') { go('close'); return }
    if (job.step === 'close') {
      const m = []
      if (!job.engineerSig) m.push('Engineer signature')
      if (!job.signoff) m.push('Customer signature or “customer not present”')
      if (m.length) { block('Needed to close', m); return }
      workTap()
      patch(() => ({ step: 'done', maxStep: ORDER.indexOf('done'), closedAt: formatNow() }))
      setBlockMsg('')
    }
  }

  const nextLabel = {
    open: 'Next · Safety',
    safety: 'Next · Start work',
    work: 'Next · Results',
    results: 'Next · Sign and close',
    close: 'Close job',
  }[step || 'open']

  const stepIndex = Math.max(0, STEPS.findIndex((s) => s.id === step))
  const progress = step === 'done' ? 100 : ((stepIndex + 0.5) / STEPS.length) * 100

  const back = () => {
    setBlockMsg('')
    if (reportOpen) { setReportOpen(false); return }
    if (!job) { goHome(); return }
    const i = ORDER.indexOf(job.step)
    if (job.step === 'done') goHome()
    else if (i === 0) setScreen('list')
    else go(ORDER[i - 1])
  }

  const renderStart = () => (
    <>
      <header className="app-header">
        <div className="brand">
          <p className="kicker">AZZTECH</p>
          <h1 style={{ fontSize: 18 }}>Engineer demo</h1>
        </div>
        <span className="demo-badge">Demo · sample data only</span>
      </header>
      <div className="scroll">
        <div className="start-hero">
          <p className="kicker">Clickable prototype</p>
          <h1>Do the job, not the paperwork.</h1>
          <p>Two invented jobs at Demo Foods Ltd, Unit 4 Cold Store. Nothing here is connected to a live system, and nothing is saved or sent.</p>
        </div>
        <button type="button" className="scenario-card" onClick={() => startScenario('ppm')} data-testid="start-ppm">
          <span className="pill cyan">Scenario A · {SCENARIOS.ppm.jobNumber}</span>
          <h2 style={{ marginTop: 10 }}>{SCENARIOS.ppm.title}</h2>
          <p className="muted" style={{ marginTop: 2 }}>{SCENARIOS.ppm.subtitle}</p>
          <p>{SCENARIOS.ppm.blurb}</p>
        </button>
        <button type="button" className="scenario-card" onClick={() => startScenario('r290')} data-testid="start-r290" style={{ marginTop: 12 }}>
          <span className="pill red">Scenario B · {SCENARIOS.r290.jobNumber}</span>
          <h2 style={{ marginTop: 10 }}>{SCENARIOS.r290.title}</h2>
          <p className="muted" style={{ marginTop: 2 }}>{SCENARIOS.r290.subtitle}</p>
          <p>{SCENARIOS.r290.blurb}</p>
        </button>
        <div className="card" style={{ marginTop: 16 }}>
          <h3>How it flows</h3>
          <p className="hint">Job (auto-filled) → Safety (adaptive RA) → Work (checklist, readings, photos) → Results (follow-ups, report) → Close (signatures).</p>
          <p className="hint">The blue button at the bottom always moves you on, and tells you exactly what is still missing. Back (top left, or swipe back) never loses anything. Restart (top right) returns here.</p>
        </div>
        <div className="card" style={{ marginTop: 12 }}>
          <div className="toggle">
            <div>
              <h3>Show tap counter</h3>
              <p className="hint" style={{ marginTop: 2 }}>Counts real work actions only, not navigation.</p>
            </div>
            <button type="button" className={`switch ${showTaps ? 'on' : ''}`} aria-pressed={showTaps} aria-label="Show tap counter" onClick={() => setShowTaps((v) => !v)}>
              <span />
            </button>
          </div>
          <div className="toggle" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div>
              <h3>Offline mode</h3>
              <p className="hint" style={{ marginTop: 2 }}>Shows “Saved on phone, will sync” as you work.</p>
            </div>
            <button type="button" className={`switch ${offline ? 'on' : ''}`} aria-pressed={offline} aria-label="Offline mode" onClick={() => setOffline((v) => !v)} data-testid="offline-toggle">
              <span />
            </button>
          </div>
        </div>
        <p className="hint" style={{ textAlign: 'center', margin: '16px 0 8px' }}>Fictional data only. Not the live AZZTECH app.</p>
      </div>
    </>
  )

  const renderList = () => (
    <>
      <header className="app-header">
        <button type="button" className="icon-btn" onClick={goHome} aria-label="Back to scenarios" data-testid="list-back"><IconBack /></button>
        <div className="brand" style={{ flex: 1 }}>
          <p className="kicker">My jobs today</p>
          <h1 style={{ fontSize: 18 }}>{ENGINEER.name}</h1>
        </div>
        <span className="demo-badge">Demo</span>
      </header>
      <div className="scroll">
        <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>Tap the job to open it. Opening it is your first work tap.</p>
        <button type="button" className="scenario-card" data-testid="open-job" onClick={() => { workTap(); setScreen('job') }}>
          <div className="row" style={{ border: 0, margin: 0, padding: 0 }}>
            <span className={`pill ${scenario.priority === 'Urgent' ? 'red' : 'cyan'}`}>{scenario.priority}</span>
            <span className="pill">{job?.claimed && !scenario.assigned ? 'Claimed' : scenario.status}</span>
          </div>
          <h2 style={{ marginTop: 10 }}>{scenario.summary}</h2>
          <p className="muted" style={{ marginTop: 4 }}>{scenario.jobNumber} · {scenario.due}</p>
          <p style={{ marginTop: 8 }}>{CUSTOMER.name} · {CUSTOMER.site} · {scenario.asset.code} ({scenario.asset.refrigerant})</p>
        </button>
      </div>
    </>
  )

  const renderReport = () => (
    <>
      <header className="app-header no-print">
        <button type="button" className="icon-btn" onClick={back} aria-label="Back from report" data-testid="report-back"><IconBack /></button>
        <div className="brand" style={{ flex: 1 }}>
          <p className="kicker">{scenario.jobNumber}</p>
          <h1 style={{ fontSize: 16 }}>Service report</h1>
        </div>
        <span className="demo-badge">Demo</span>
      </header>
      <div className="scroll report-scroll">
        <Report scenario={scenario} job={job} closedAt={job.closedAt} />
      </div>
      <div className="footer no-print">
        <div className="seg" style={{ marginTop: 0 }}>
          <button type="button" onClick={back}>Back</button>
          <button type="button" data-testid="print" onClick={() => window.print()}>Print / Save PDF</button>
        </div>
      </div>
    </>
  )

  const renderOpen = () => {
    const ref = REFRIGERANTS[scenario.asset.refrigerant]
    return (
      <div className="stack">
        <div className="banner cyan" data-testid="autofill-banner">Filled in automatically from the job, site, engineer and asset records. Nothing to type.</div>
        <div className="card">
          <div className="row" style={{ border: 0, margin: 0, padding: 0, alignItems: 'center' }}>
            <p className="tiny">Job <span className="auto">auto</span></p>
            <span className={`pill ${scenario.priority === 'Urgent' ? 'red' : 'cyan'}`}>{scenario.priority}</span>
          </div>
          <h2 style={{ marginTop: 6 }}>{scenario.summary}</h2>
          <div className="row"><span className="label">Job no.</span><span className="value">{scenario.jobNumber} · {scenario.kind}</span></div>
          <div className="row"><span className="label">Due</span><span className="value">{scenario.due}</span></div>
          <div className="row"><span className="label">Status</span><span className="value">{job.claimed ? (scenario.assigned ? 'Assigned to you' : 'Claimed by you') : 'New · unassigned'}</span></div>
        </div>
        <div className="card">
          <p className="tiny">Site <span className="auto">auto</span></p>
          <div className="row"><span className="label">Customer</span><span className="value">{CUSTOMER.name}</span></div>
          <div className="row"><span className="label">Site</span><span className="value">{CUSTOMER.site}<br />{CUSTOMER.address}</span></div>
          <div className="row"><span className="label">Where</span><span className="value">{scenario.location}</span></div>
          <div className="row"><span className="label">Contact</span><span className="value">{CUSTOMER.contact}</span></div>
          <div className="row"><span className="label">Access</span><span className="value">{CUSTOMER.access}</span></div>
          <div className="row"><span className="label">Emergency</span><span className="value">{CUSTOMER.emergency}</span></div>
        </div>
        <div className="card">
          <p className="tiny">Engineer <span className="auto">auto</span></p>
          <div className="row"><span className="label">Name</span><span className="value">{ENGINEER.name} (you)</span></div>
          <div className="row"><span className="label">F-gas</span><span className="value">{ENGINEER.fgasCert}</span></div>
          <div className="row"><span className="label">Flammables</span><span className="value">{ENGINEER.hydrocarbon}</span></div>
        </div>
        <div className="card">
          <p className="tiny">Asset <span className="auto">auto</span></p>
          <h2 style={{ marginTop: 4 }}>{scenario.asset.code} · {scenario.asset.name}</h2>
          <div className="row"><span className="label">Make / model</span><span className="value">{scenario.asset.make} {scenario.asset.model}</span></div>
          <div className="row"><span className="label">Serial</span><span className="value">{scenario.asset.serial}</span></div>
          <div className="row"><span className="label">Refrigerant</span><span className="value">{scenario.asset.refrigerant} · {ref.label}</span></div>
          <div className="row"><span className="label">Charge</span><span className="value">{scenario.asset.chargeKg} kg · {co2e(scenario.asset)} t CO₂e</span></div>
          <div className="row"><span className="label">Condition</span><span className="value"><span className={`pill ${scenario.asset.condition === 'Good' ? 'green' : 'amber'}`}>{scenario.asset.condition}</span></span></div>
        </div>
        <div className="card">
          <p className="tiny">Last visit</p>
          <h3 style={{ marginTop: 4 }}>{scenario.lastVisit.date} · {scenario.lastVisit.job}</h3>
          <p className="hint">{scenario.lastVisit.result}</p>
          <p className="tiny" style={{ marginTop: 12 }}>History</p>
          {scenario.history.map((h) => (
            <div className="row" key={h.date}><span className="label">{h.date}</span><span className="value">{h.text}</span></div>
          ))}
        </div>
        {scenario.competence && (
          <div className="banner red" data-testid="competence">
            <strong>{scenario.competence.title}</strong>
            <p style={{ marginTop: 6 }}>{scenario.competence.body}</p>
          </div>
        )}
        {!job.claimed && (
          <button type="button" className="primary" data-testid="claim-job"
            onClick={() => { workTap(); patch(() => ({ claimed: true, competenceAck: true })); setBlockMsg('') }}>
            {scenario.competence ? 'I’m qualified: claim this job' : 'Claim this job'}
          </button>
        )}
        {job.claimed && !scenario.assigned && (
          <div className="banner green">Claimed by you. Your competence acknowledgement is recorded on the job.</div>
        )}
      </div>
    )
  }

  const renderSafety = () => {
    const hazards = hazardsFor(scenario, job, previewRef)
    const shownRef = previewRef || scenario.asset.refrigerant
    return (
      <div className="stack">
        <div className="card">
          <p className="tiny">Dynamic risk assessment</p>
          <h2 style={{ marginTop: 4 }}>Built for this asset and this job</h2>
          <p className="hint">The rules engine picks hazards from the equipment type, refrigerant, job type and your task tags. Locked items cannot be removed.</p>
          <div className="inputs">
            <span>Equipment: <b>{scenario.asset.type}</b></span>
            <span>Refrigerant: <b>{shownRef} ({REFRIGERANTS[shownRef].safety})</b></span>
            <span>Job: <b>{scenario.kind}{scenario.circuitMayOpen ? ', circuit may be opened' : ''}</b></span>
            <span>Result: <b data-testid="hazard-count">{hazards.length} hazards, {hazards.filter((h) => h.locked).length} locked</b></span>
          </div>
        </div>
        <div className="card">
          <h3>See it adapt (demo only)</h3>
          <p className="hint">Preview this job with a different refrigerant and watch the hazards change. The real asset is {scenario.asset.refrigerant}.</p>
          <div className="chips">
            {Object.keys(REFRIGERANTS).map((r) => {
              const isAsset = r === scenario.asset.refrigerant
              return (
                <button key={r} type="button" className={`chip ${shownRef === r ? 'on' : ''}`} data-testid={`preview-${r}`}
                  onClick={() => { setPreviewRef(isAsset ? null : r); setBlockMsg('') }}>
                  {r}{isAsset ? ' (asset)' : ''}
                </button>
              )
            })}
          </div>
          {previewRef && <div className="banner" style={{ marginTop: 10 }}>Previewing as {previewRef}. Tap {scenario.asset.refrigerant} (asset) to return and sign.</div>}
        </div>
        {hazards.map((h) => (
          <div key={h.id} className={`hazard ${h.locked ? 'locked' : ''} ${h.source.startsWith('Always') ? '' : 'conditional'}`} data-testid={`hazard-${h.id}`}>
            <div className="row" style={{ border: 0, margin: 0, padding: 0, alignItems: 'center' }}>
              <h3>{h.title}</h3>
              <span className={`pill ${h.risk === 'Red' ? 'red' : h.risk === 'Amber' ? 'amber' : 'green'}`}>{h.risk}</span>
            </div>
            <p className="reason">{h.locked ? '🔒 Mandatory · ' : 'Added by tag · '}{h.source}</p>
            <p className="hint">{h.controls}</p>
            <p className="hint">Residual risk after controls: {h.residual}.</p>
          </div>
        ))}
        <div className="card">
          <h3>Task tags</h3>
          <p className="hint">Add only if they apply. Extra controls appear straight away{scenario.asset.refrigerant === 'R290' ? ' (try hot works on this R290 job)' : ''}.</p>
          <div className="chips">
            {OPTIONAL_TAGS.map((tag) => {
              const on = job.tags.includes(tag.id)
              return (
                <button key={tag.id} type="button" className={`chip ${on ? 'on' : ''}`} data-testid={`tag-${tag.id}`}
                  onClick={() => { workTap(); patch((cur) => ({ tags: on ? cur.tags.filter((t) => t !== tag.id) : [...cur.tags, tag.id], raSignature: null, raSignedAt: null })) }}>
                  {on ? '✓ ' : '+ '}{tag.label}
                </button>
              )
            })}
          </div>
          <p className="hint">Changing tags clears any RA signature, so it is always signed against the final list.</p>
        </div>
        <div className="card">
          <h3>Confirm site conditions</h3>
          {scenario.conditions.map((c) => (
            <div key={c} className={`cond-item ${job.conditions ? 'on' : ''}`} style={{ cursor: 'default' }}>
              <span className="box">{job.conditions ? '✓' : ''}</span>
              <span>{c}</span>
            </div>
          ))}
          <button type="button" className={job.conditions ? 'secondary' : 'primary'} style={{ marginTop: 8 }} data-testid="confirm-conditions"
            onClick={() => { if (!job.conditions) workTap(); patch((cur) => ({ conditions: !cur.conditions })); setBlockMsg('') }}>
            {job.conditions ? '✓ Confirmed (tap to undo)' : 'All of these match the site'}
          </button>
        </div>
        <div className="card">
          <h3>Engineer RA signature</h3>
          <p className="hint">I have reviewed the hazards and controls and they match the site. I will stop work if conditions change.</p>
          {job.raSignature ? (
            <>
              <img className="sig-preview" src={job.raSignature} alt="RA signature" data-testid="ra-sig-img" />
              <p className="hint">Signed by {ENGINEER.name} · {job.raSignedAt} (UK time)</p>
              <button type="button" className="secondary" style={{ marginTop: 8 }} onClick={() => setSignMode('ra')}>Sign again</button>
            </>
          ) : (
            <button type="button" className="primary" data-testid="sign-ra" disabled={!!previewRef} onClick={() => setSignMode('ra')}>Sign risk assessment</button>
          )}
        </div>
        <button type="button" className="danger" data-testid="stop-work" onClick={() => patch(() => ({ stopped: true, step: 'done', maxStep: ORDER.indexOf('done') }))}>
          Stop work: unsafe to continue
        </button>
      </div>
    )
  }

  const setCheck = (id, value) => patch((cur) => ({ checks: { ...cur.checks, [id]: { ...cur.checks[id], ...value } } }))
  const createFollowUp = (item) => {
    workTap()
    patch((cur) => {
      const n = scenario.nextJobNumber + Object.keys(cur.followUps).length
      const t = followUpFor(scenario, item)
      return { followUps: { ...cur.followUps, [item.id]: { number: `JOB-${n}`, title: t.title, priority: t.priority, from: item.label } } }
    })
    setBlockMsg('')
    setToast('Follow-up job created')
  }

  const renderWork = () => {
    const doneCount = scenario.checks.filter((c) => checkDone(c, job.checks[c.id])).length
    return (
      <div className="stack">
        <div className="card">
          <p className="tiny">Equipment checklist</p>
          <h2 style={{ marginTop: 4 }}>Only the checks for {scenario.asset.code}</h2>
          <p className="hint">Built from modules: {scenario.checklistModules.join(' + ')}. {doneCount} of {scenario.checks.length} done.</p>
          <div className="progress-bar" style={{ marginTop: 8 }}><span style={{ width: `${(doneCount / scenario.checks.length) * 100}%` }} /></div>
        </div>
        {scenario.checks.map((item) => {
          const v = job.checks[item.id] || {}
          const tone = rangeTone(item, v.reading)
          const fu = job.followUps[item.id]
          return (
            <div key={item.id} className={`check-row ${v.result === 'fail' ? 'failed' : v.result === 'pass' || tone === 'ok' ? 'passed' : ''}`} data-testid={`check-${item.id}`}>
              <h3>{item.label}{item.required ? ' *' : ''}</h3>
              {item.module && <p className="mod">Module: {item.module}</p>}
              {item.hint && <p className="hint">{item.hint}</p>}
              {item.type === 'reading' && (
                <>
                  <button type="button" className="reading-btn" data-testid={`reading-${item.id}`} onClick={() => setPadItem(item)}>
                    {checkDone(item, v) ? `${v.reading} ${item.unit}` : `Enter ${item.unit}`}
                  </button>
                  <p className="hint">{item.typical}</p>
                  {tone === 'out' && <p className="hint" style={{ color: '#fcd34d' }}>Outside the typical range. Saved, and flagged on the report.</p>}
                  {tone === 'ok' && <p className="hint" style={{ color: '#6ee7b7' }}>Within the typical range.</p>}
                </>
              )}
              {item.type === 'passfail' && (
                <div className="seg">
                  <button type="button" className={v.result === 'pass' ? 'on-pass' : ''} data-testid={`pass-${item.id}`}
                    onClick={() => {
                      if (fu) { setToast(`Follow-up ${fu.number} already raised, so this stays Fail`); return }
                      if (v.result !== 'pass') workTap()
                      setCheck(item.id, { result: 'pass' })
                    }}>
                    ✓ Pass
                  </button>
                  <button type="button" className={v.result === 'fail' ? 'on-fail' : ''} data-testid={`fail-${item.id}`}
                    onClick={() => { if (v.result !== 'fail') workTap(); setCheck(item.id, { result: 'fail' }) }}>
                    ✕ Fail
                  </button>
                </div>
              )}
              {item.photo && (
                <PhotoField item={item} assetCode={scenario.asset.code} photo={v.photo}
                  onChange={(photo) => { if (photo) workTap(); setCheck(item.id, { photo }); setBlockMsg('') }} />
              )}
              {v.result === 'fail' && (
                <div className="banner red" style={{ marginTop: 10 }} data-testid={`followup-box-${item.id}`}>
                  {fu ? (
                    <>
                      <strong>✓ Follow-up {fu.number} created</strong>
                      <p style={{ marginTop: 4 }}>{fu.title}</p>
                      <p style={{ marginTop: 4 }}>Priority: {fu.priority} · linked to {scenario.jobNumber} and {scenario.asset.code} · on the office jobs list.</p>
                    </>
                  ) : (
                    <>
                      <p>A failed check needs a follow-up. AZZTECH has drafted one for you:</p>
                      <p style={{ marginTop: 6 }}><strong>{followUpFor(scenario, item).title}</strong> · {followUpFor(scenario, item).priority}</p>
                      <button type="button" className="primary" style={{ marginTop: 8 }} data-testid={`create-followup-${item.id}`} onClick={() => createFollowUp(item)}>
                        Create follow-up job
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        <div className="card">
          <p className="tiny">Refrigerant log</p>
          <h3 style={{ marginTop: 4 }}>Gas movements for {scenario.asset.code}</h3>
          <p className="hint">{scenario.refrigerantPrompt || 'PPM with no gas moved, so this is already set to none. Change it only if you added or recovered gas.'}</p>
          {job.refrigerant.movements.map((m, i) => (
            <div className="row" key={i}><span className="label">{m.type}</span><span className="value">{m.kg} kg {m.refrigerant} · {m.cylinder}</span></div>
          ))}
          {job.refrigerant.none && !job.refrigerant.movements.length && (
            <div className="banner green" style={{ marginTop: 8 }}>No refrigerant added or recovered this visit.</div>
          )}
          <div className="seg" style={{ marginTop: 10 }}>
            <button type="button" className={job.refrigerant.none && !job.refrigerant.movements.length ? 'on-pass' : ''} data-testid="refrig-none"
              onClick={() => { if (!(job.refrigerant.none && !job.refrigerant.movements.length)) workTap(); patch(() => ({ refrigerant: { none: true, movements: [] } })) }}>
              None this visit
            </button>
            <button type="button" data-testid="refrig-add"
              onClick={() => { setLogForm({ type: 'recovered', kg: '', cylinder: scenario.sampleMovements?.[0]?.cylinder || 'CYL-208' }); setLogOpen(true) }}>
              Log movement
            </button>
          </div>
          {scenario.sampleMovements && (
            <button type="button" className="secondary" style={{ marginTop: 8 }} data-testid="refrig-sample"
              onClick={() => { workTap(); patch(() => ({ refrigerant: { none: false, movements: scenario.sampleMovements } })); setBlockMsg('') }}>
              Use sample: 0.12 kg recovered, 0.145 kg added
            </button>
          )}
        </div>

        {scenario.voice && (
          <div className="card" data-testid="voice-card">
            <p className="tiny">AI voice note · mock</p>
            <h3 style={{ marginTop: 4 }}>Dictate findings (optional)</h3>
            <p className="hint">In production this records on the phone and is transcribed. Here a tap plays a canned transcript, then you review and approve. AI never signs anything.</p>
            {job.voice.phase === 'idle' && (
              <button type="button" className="mic" data-testid="voice-mic" aria-label="Record voice note"
                onClick={() => {
                  workTap()
                  patch((cur) => ({ voice: { ...cur.voice, phase: 'recording' } }))
                  setTimeout(() => patch((cur) => (cur && cur.voice.phase === 'recording' ? { voice: { ...cur.voice, phase: 'draft' } } : {})), 1400)
                }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" /></svg>
              </button>
            )}
            {job.voice.phase === 'recording' && <button type="button" className="mic recording" disabled>Listening…</button>}
            {job.voice.phase === 'draft' && !job.voice.approved && (
              <>
                <p className="tiny" style={{ marginTop: 8 }}>Transcript</p>
                <p className="hint">{scenario.voice.transcript}</p>
                <p className="tiny" style={{ marginTop: 12 }}>Structured findings</p>
                {scenario.voice.findings.map((f) => (
                  <div className="row" key={f.id}><span className="label">{f.label}</span><span className="value" style={{ textAlign: 'left' }}>{f.text}</span></div>
                ))}
                <div className="banner" style={{ marginTop: 12 }}>
                  <strong>Missing information</strong>
                  {scenario.voice.missing.map((m) => (
                    <div key={m.id} style={{ marginTop: 10 }}>
                      <p>{m.prompt}</p>
                      {job.voice.confirmed[m.id]
                        ? <p className="hint" style={{ color: '#6ee7b7' }}>Confirmed: {job.voice.answers[m.id]}</p>
                        : <p className="hint">Suggested: {m.suggestion}</p>}
                    </div>
                  ))}
                  {scenario.voice.missing.some((m) => !job.voice.confirmed[m.id]) && (
                    <button type="button" className="primary" style={{ marginTop: 10 }} data-testid="voice-confirm-missing"
                      onClick={() => {
                        workTap()
                        patch((cur) => {
                          const confirmed = { ...cur.voice.confirmed }
                          const answers = { ...cur.voice.answers }
                          for (const m of scenario.voice.missing) { confirmed[m.id] = true; answers[m.id] = m.suggestion }
                          return { voice: { ...cur.voice, confirmed, answers } }
                        })
                      }}>
                      Confirm suggested answers
                    </button>
                  )}
                </div>
                <button type="button" className="primary" style={{ marginTop: 10 }} data-testid="voice-approve"
                  disabled={scenario.voice.missing.some((m) => !job.voice.confirmed[m.id])}
                  onClick={() => { workTap(); patch((cur) => ({ voice: { ...cur.voice, approved: true } })); setBlockMsg('') }}>
                  Approve findings
                </button>
                <button type="button" className="ghost" style={{ width: '100%' }}
                  onClick={() => patch(() => ({ voice: { phase: 'idle', confirmed: {}, answers: {}, approved: false } }))}>
                  Discard
                </button>
              </>
            )}
            {job.voice.approved && <div className="banner green">Findings approved and added to the report.</div>}
          </div>
        )}
      </div>
    )
  }

  const renderResults = () => {
    const failed = scenario.checks.filter((c) => job.checks[c.id]?.result === 'fail')
    const ok = scenario.checks.filter((c) => job.checks[c.id]?.result === 'pass' || rangeTone(c, job.checks[c.id]?.reading) === 'ok').length
    const out = scenario.checks.filter((c) => rangeTone(c, job.checks[c.id]?.reading) === 'out').length
    const fups = Object.values(job.followUps)
    const photos = scenario.checks.filter((c) => job.checks[c.id]?.photo)
    return (
      <div className="stack">
        <div className="card">
          <p className="tiny">Results</p>
          <h2 style={{ marginTop: 4 }}>What this visit produced</h2>
          <div className="stats">
            <div className="good"><b>{ok}</b><span>OK</span></div>
            <div className={failed.length ? 'bad' : ''}><b>{failed.length}</b><span>Failed</span></div>
            <div className={out ? 'warn' : ''}><b>{out}</b><span>Out of range</span></div>
            <div><b>{fups.length}</b><span>Follow-ups</span></div>
          </div>
        </div>
        <div className="card">
          <h3>Readings</h3>
          {scenario.checks.filter((c) => c.type === 'reading').map((c) => {
            const r = job.checks[c.id]?.reading
            const tone = rangeTone(c, r)
            return (
              <div className="row" key={c.id}>
                <span className="label">{c.label}</span>
                <span className="value">{r ?? '—'} {c.unit} {tone && <span className={`pill ${tone === 'ok' ? 'green' : 'amber'}`}>{tone === 'ok' ? 'OK' : 'Check'}</span>}</span>
              </div>
            )
          })}
        </div>
        <div className="card" data-testid="followups-card">
          <h3>Follow-up jobs raised</h3>
          {fups.length ? fups.map((f) => (
            <div className="fu" key={f.number}>
              <span className="pill amber">{f.number} · New</span>
              <p style={{ marginTop: 6, fontWeight: 600 }}>{f.title}</p>
              <p className="hint" style={{ marginTop: 2 }}>From failed check: {f.from} · {f.priority} · office notified</p>
            </div>
          )) : <p className="hint">No failed checks, so no follow-ups.</p>}
        </div>
        <div className="card">
          <h3>Photos ({photos.length})</h3>
          {photos.length ? (
            <div className="thumbs">
              {photos.map((c) => <img key={c.id} src={job.checks[c.id].photo.src} alt={c.label} />)}
            </div>
          ) : <p className="hint">No photos.</p>}
        </div>
        <div className="card">
          <h3>Note for the report (optional)</h3>
          <textarea className="note" rows={3} value={job.notes} data-testid="notes"
            placeholder="e.g. Advised site to keep the plant room door clear."
            onChange={(e) => { const val = e.target.value; patch(() => ({ notes: val })) }} />
        </div>
        <div className="card">
          <h3>Service report</h3>
          <p className="hint">Built automatically from everything above. Signatures are added on the next step.</p>
          <button type="button" className="secondary" style={{ marginTop: 10 }} data-testid="open-report" onClick={() => setReportOpen(true)}>
            Preview service report
          </button>
        </div>
      </div>
    )
  }

  const renderClose = () => (
    <div className="stack">
      <div className="card">
        <p className="tiny">Close</p>
        <h2 style={{ marginTop: 4 }}>Sign off and close</h2>
        <p className="hint">Two signatures, then one tap to close. The report and refrigerant log are attached to the job automatically.</p>
      </div>
      <div className="card">
        <h3>Engineer signature</h3>
        {job.engineerSig ? (
          <>
            <img className="sig-preview" src={job.engineerSig} alt="Engineer signature" />
            <p className="hint">{ENGINEER.name} · {job.engineerSignedAt} (UK time)</p>
            <button type="button" className="secondary" style={{ marginTop: 8 }} onClick={() => setSignMode('engineer')}>Sign again</button>
          </>
        ) : (
          <>
            <p className="hint">You signed the RA earlier on this job. Reuse that signature, or sign again.</p>
            <div className="seg">
              <button type="button" data-testid="engineer-reuse" disabled={!job.raSignature}
                onClick={() => { workTap(); patch((cur) => ({ engineerSig: cur.raSignature, engineerSignedAt: formatNow() })); setBlockMsg('') }}>
                Use RA signature
              </button>
              <button type="button" data-testid="engineer-sign" onClick={() => setSignMode('engineer')}>Sign now</button>
            </div>
          </>
        )}
      </div>
      <div className="card">
        <h3>Customer sign-off</h3>
        <p className="hint">Often nobody is around. “Not present” is a valid close, with a reason.</p>
        {job.signoff?.type === 'signed' && (
          <>
            <img className="sig-preview" src={job.signoff.signature} alt="Customer signature" />
            <p className="hint">{job.signoff.name} · {job.signoff.at}</p>
          </>
        )}
        {job.signoff?.type === 'not_present' && <div className="banner cyan" style={{ marginTop: 8 }}>Customer not present · {job.signoff.reason}</div>}
        <div className="seg" style={{ marginTop: 10 }}>
          <button type="button" data-testid="customer-sign" onClick={() => setSignMode('customer')}>Customer signs</button>
          <button type="button" data-testid="customer-absent" onClick={() => setNotPresentOpen(true)}>Not present</button>
        </div>
      </div>
      <button type="button" className="secondary" data-testid="open-report-close" onClick={() => setReportOpen(true)}>Preview final report</button>
    </div>
  )

  const renderDone = () => {
    if (job.stopped) {
      return (
        <div className="stack">
          <div className="card">
            <div className="done-mark warn">!</div>
            <h2 style={{ textAlign: 'center' }}>Work stopped</h2>
            <p className="hint" style={{ textAlign: 'center' }}>The job stays open and, in the live app, the office would be alerted. Nothing was saved in this demo.</p>
            <button type="button" className="primary" style={{ marginTop: 16 }} onClick={goHome}>Back to scenarios</button>
          </div>
        </div>
      )
    }
    const fups = Object.values(job.followUps)
    return (
      <div className="stack" data-testid="done">
        <div className="card">
          <div className="done-mark">✓</div>
          <h2 style={{ textAlign: 'center' }}>{scenario.jobNumber} closed</h2>
          <p className="hint" style={{ textAlign: 'center' }}>Completed by {ENGINEER.name} · {job.closedAt} (UK time). Sample data only.</p>
          <p style={{ textAlign: 'center', marginTop: 12, fontSize: 15 }} data-testid="final-taps">Work taps: <strong>{taps}</strong></p>
        </div>
        {fups.length > 0 && (
          <div className="card" data-testid="jobs-list">
            <p className="tiny">Office jobs list (demo)</p>
            {fups.map((f) => (
              <div className="fu" key={f.number}>
                <div className="row" style={{ border: 0, margin: 0, padding: 0 }}><span className="pill amber">{f.number} · New</span><span className="pill">{f.priority}</span></div>
                <p style={{ marginTop: 6, fontWeight: 600 }}>{f.title}</p>
                <p className="hint" style={{ marginTop: 2 }}>Raised automatically from {scenario.jobNumber} · {scenario.asset.code}</p>
              </div>
            ))}
          </div>
        )}
        {offline && <div className="banner cyan">Saved on phone, will sync when you are back online.</div>}
        <button type="button" className="primary" data-testid="view-report" onClick={() => setReportOpen(true)}>View service report</button>
        <button type="button" className="secondary" data-testid="try-other" onClick={() => startScenario(scenario.id === 'ppm' ? 'r290' : 'ppm')}>
          Try {scenario.id === 'ppm' ? 'Scenario B: R290 repair' : 'Scenario A: R32 PPM'}
        </button>
        <button type="button" className="ghost" style={{ width: '100%' }} onClick={goHome} data-testid="again">Back to scenarios</button>
      </div>
    )
  }

  const renderJob = () => (
    <>
      <header className="app-header">
        <button type="button" className="icon-btn" aria-label="Back" data-testid="back" onClick={back}><IconBack /></button>
        <div className="brand" style={{ flex: 1 }}>
          <p className="kicker">{scenario.jobNumber}</p>
          <h1 style={{ fontSize: 16 }}>{scenario.kind} · {scenario.asset.code}</h1>
        </div>
        <button type="button" className="home-btn" onClick={goHome} aria-label="Restart demo" data-testid="home">Restart</button>
      </header>

      {step !== 'done' && (
        <div className="steps-wrap">
          <div className="progress-bar"><span style={{ width: `${Math.min(progress, 100)}%` }} /></div>
          <div className="steps">
            {STEPS.map((s, i) => (
              <button key={s.id} type="button" className={`${step === s.id ? 'active' : ''} ${i < stepIndex ? 'done' : ''}`}
                disabled={i > stepIndex} onClick={() => i <= stepIndex && go(s.id)} data-testid={`stepnav-${s.id}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="scroll">
        {savedBanner && offline && <div className="banner cyan" style={{ marginBottom: 12 }} data-testid="offline-banner">Saved on phone, will sync</div>}
        {step === 'open' && renderOpen()}
        {step === 'safety' && renderSafety()}
        {step === 'work' && renderWork()}
        {step === 'results' && renderResults()}
        {step === 'close' && renderClose()}
        {step === 'done' && renderDone()}
      </div>

      {step !== 'done' && (
        <div className="footer">
          {blockMsg && <p className="footer-error" data-testid="block-msg">{blockMsg}</p>}
          <div className="footer-row">
            {showTaps && <button type="button" className="tap-chip" onClick={() => setShowTaps(false)} title="Hide tap counter" data-testid="tap-counter">Taps {taps}</button>}
            <button type="button" className="primary" data-testid="whats-next" onClick={nextAction}>{nextLabel}</button>
          </div>
        </div>
      )}
    </>
  )

  let content = null
  if (screen === 'start') content = renderStart()
  else if (screen === 'list' && scenario) content = renderList()
  else if (scenario && job) content = reportOpen ? renderReport() : renderJob()
  else content = renderStart()

  return (
    <div className="desktop-shell">
      <p className="desktop-caption no-print">
        <strong>AZZTECH engineer demo</strong> · fictional sample data, not the live app. Open this link on a phone for the full-screen version.
      </p>
      <div className="phone-frame">
        <div className="phone-notch no-print" />
        <div className="phone-screen">
          <div className="app">
            {content}
            {toast && <div className="toast" role="status" data-testid="toast">{toast}</div>}
            {padItem && padItem.id !== '__logkg' && (
              <NumberPad
                item={padItem}
                initial={job?.checks[padItem.id]?.reading ?? ''}
                onClose={() => setPadItem(null)}
                onSave={(reading) => {
                  workTap()
                  patch((cur) => ({ checks: { ...cur.checks, [padItem.id]: { ...cur.checks[padItem.id], reading } } }))
                  setPadItem(null)
                  setBlockMsg('')
                }}
              />
            )}
            {signMode && (
              <SignPad
                title={signMode === 'ra' ? 'Sign the risk assessment' : signMode === 'engineer' ? 'Engineer sign-off' : 'Customer signature'}
                who={signMode === 'customer' ? `${CUSTOMER.contact}, ${CUSTOMER.name}` : ENGINEER.name}
                onCancel={() => setSignMode(null)}
                onSign={(data) => {
                  workTap()
                  const at = formatNow()
                  if (signMode === 'ra') patch(() => ({ raSignature: data, raSignedAt: at }))
                  else if (signMode === 'engineer') patch(() => ({ engineerSig: data, engineerSignedAt: at }))
                  else patch(() => ({ signoff: { type: 'signed', signature: data, name: CUSTOMER.contact, at, reason: null } }))
                  setSignMode(null)
                  setBlockMsg('')
                }}
              />
            )}
            {logOpen && scenario && (
              <div className="sheet" onClick={() => setLogOpen(false)} role="presentation">
                <div className="sheet-card" onClick={(e) => e.stopPropagation()}>
                  <h2>Log refrigerant movement</h2>
                  <p className="hint">{scenario.asset.refrigerant} on {scenario.asset.code}. Stored against the asset and cylinder, not as a form box.</p>
                  <div className="seg" style={{ marginTop: 10 }}>
                    {['recovered', 'added'].map((t) => (
                      <button key={t} type="button" className={logForm.type === t ? 'on-pass' : ''} onClick={() => setLogForm((f) => ({ ...f, type: t }))}>
                        {t[0].toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="reading-btn" data-testid="log-kg"
                    onClick={() => setPadItem({ id: '__logkg', label: 'Quantity', unit: 'kg', typical: 'Weight on the scales', min: 0, max: 20, type: 'reading' })}>
                    {logForm.kg ? `${logForm.kg} kg` : 'Enter kg'}
                  </button>
                  <p className="tiny" style={{ marginTop: 12 }}>Cylinder (from your van stock)</p>
                  <div className="chips">
                    {['CYL-208', 'CYL-311'].map((c) => (
                      <button key={c} type="button" className={`chip ${logForm.cylinder === c ? 'on' : ''}`} onClick={() => setLogForm((f) => ({ ...f, cylinder: c }))}>{c}</button>
                    ))}
                  </div>
                  <button type="button" className="primary" style={{ marginTop: 12 }} disabled={!logForm.kg || Number.isNaN(Number(logForm.kg))} data-testid="log-save"
                    onClick={() => {
                      workTap()
                      patch((cur) => ({ refrigerant: { none: false, movements: [...cur.refrigerant.movements, { type: logForm.type, kg: logForm.kg, refrigerant: scenario.asset.refrigerant, cylinder: logForm.cylinder }] } }))
                      setLogOpen(false)
                      setBlockMsg('')
                    }}>
                    Save to log
                  </button>
                  <button type="button" className="ghost" style={{ width: '100%' }} onClick={() => setLogOpen(false)}>Cancel</button>
                </div>
              </div>
            )}
            {padItem?.id === '__logkg' && (
              <NumberPad
                item={padItem}
                initial={logForm.kg}
                onClose={() => setPadItem(null)}
                onSave={(reading) => { setLogForm((f) => ({ ...f, kg: reading.replace('-', '') })); setPadItem(null) }}
              />
            )}
            {notPresentOpen && (
              <div className="sheet" onClick={() => setNotPresentOpen(false)} role="presentation">
                <div className="sheet-card" onClick={(e) => e.stopPropagation()}>
                  <h2>Customer not present</h2>
                  <p className="hint">Pick a reason. The report will say the customer was not there to sign.</p>
                  {['Nobody on site', 'Site contact busy, asked for report only', 'Out-of-hours visit'].map((reason) => (
                    <button key={reason} type="button" className={`cond-item ${notPresentReason === reason ? 'on' : ''}`} onClick={() => setNotPresentReason(reason)}>
                      <span className="box">{notPresentReason === reason ? '✓' : ''}</span>
                      <span>{reason}</span>
                    </button>
                  ))}
                  <button type="button" className="primary" style={{ marginTop: 12 }} data-testid="confirm-absent"
                    onClick={() => {
                      workTap()
                      patch(() => ({ signoff: { type: 'not_present', reason: notPresentReason, signature: null } }))
                      setNotPresentOpen(false)
                      setBlockMsg('')
                    }}>
                    Save reason
                  </button>
                  <button type="button" className="ghost" style={{ width: '100%' }} onClick={() => setNotPresentOpen(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
