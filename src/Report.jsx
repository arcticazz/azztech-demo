import { ENGINEER, CUSTOMER, REFRIGERANTS, OPTIONAL_TAGS, buildHazards } from './data.js'

export function formatNow(d = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short',
  }).format(d)
}

export function co2e(asset) {
  const ref = REFRIGERANTS[asset.refrigerant]
  const t = (asset.chargeKg * ref.gwp) / 1000
  return t < 0.1 ? t.toFixed(4) : t.toFixed(2)
}

export function hazardsFor(scenario, job, refOverride) {
  return buildHazards({
    assetType: scenario.asset.type,
    refrigerant: refOverride || scenario.asset.refrigerant,
    jobKind: scenario.kind,
    circuitMayOpen: scenario.circuitMayOpen,
    tags: job.tags,
  })
}

export function rangeTone(item, reading) {
  if (reading === undefined || reading === null || reading === '' || item.min == null) return null
  const n = Number(reading)
  if (Number.isNaN(n)) return null
  return n < item.min || n > item.max ? 'out' : 'ok'
}

export function checkDone(item, v = {}) {
  if (item.type === 'reading') return v.reading !== undefined && v.reading !== ''
  return !!v.result
}

export function Report({ scenario, job, closedAt }) {
  const hazards = hazardsFor(scenario, job)
  const ref = REFRIGERANTS[scenario.asset.refrigerant]
  const photos = scenario.checks.filter((c) => job.checks[c.id]?.photo).map((c) => ({ label: c.label, ...job.checks[c.id].photo }))
  const fups = Object.values(job.followUps)
  return (
    <div className="report" data-testid="report">
      <div className="report-head">
        <div>
          <div className="brand-line">AZZTECH · Service report</div>
          <h2 style={{ marginTop: 4 }}>{scenario.jobNumber} · {scenario.kind}</h2>
        </div>
        <span className={`rpill ${closedAt ? 'ok' : 'draft'}`}>{closedAt ? 'Completed' : 'Draft'}</span>
      </div>
      <p className="r-demo">DEMO REPORT · fictional sample data · not a live job record</p>

      <h4>Job and site</h4>
      <table><tbody>
        <tr><td>Customer</td><td>{CUSTOMER.name}</td></tr>
        <tr><td>Site</td><td>{CUSTOMER.site}, {CUSTOMER.address}</td></tr>
        <tr><td>Location</td><td>{scenario.location}</td></tr>
        <tr><td>Site contact</td><td>{CUSTOMER.contact}</td></tr>
        <tr><td>Job type</td><td>{scenario.kind} · {scenario.priority}</td></tr>
        <tr><td>Scope</td><td>{scenario.summary}</td></tr>
        <tr><td>Engineer</td><td>{ENGINEER.name} · {ENGINEER.fgasCert}</td></tr>
        <tr><td>Completed</td><td>{closedAt ? `${closedAt} (UK time)` : 'Not yet closed'}</td></tr>
      </tbody></table>

      <h4>Asset</h4>
      <table><tbody>
        <tr><td>Asset</td><td>{scenario.asset.code} · {scenario.asset.name}</td></tr>
        <tr><td>Make / model</td><td>{scenario.asset.make} {scenario.asset.model} · S/N {scenario.asset.serial}</td></tr>
        <tr><td>Refrigerant</td><td>{scenario.asset.refrigerant} ({ref.label}) · {scenario.asset.chargeKg} kg · {co2e(scenario.asset)} t CO₂e</td></tr>
      </tbody></table>

      <h4>Risk assessment</h4>
      <p>Dynamic RA: {hazards.length} hazards, {hazards.filter((h) => h.locked).length} mandatory (set by the rules engine). Site conditions {job.conditions ? 'confirmed' : 'not confirmed'}{job.tags.length ? `. Task tags: ${job.tags.map((t) => OPTIONAL_TAGS.find((o) => o.id === t)?.label).join(', ')}` : ''}.</p>
      <ul className="r-list">
        {hazards.map((h) => <li key={h.id}><strong>{h.title}</strong> · risk {h.risk} → {h.residual} <span className="r-src">({h.source})</span></li>)}
      </ul>
      {job.raSignature && (
        <div className="r-sig"><img src={job.raSignature} alt="Engineer RA signature" /><span>RA signed by {ENGINEER.name} · {job.raSignedAt}</span></div>
      )}

      <h4>Checklist and readings</h4>
      <table className="r-checks"><tbody>
        {scenario.checks.map((item) => {
          const v = job.checks[item.id] || {}
          let result = '—'
          let cls = ''
          if (item.type === 'reading' && checkDone(item, v)) {
            const tone = rangeTone(item, v.reading)
            result = `${v.reading} ${item.unit}${tone === 'out' ? ' (outside typical)' : ''}`
            cls = tone === 'out' ? 'warn' : ''
          } else if (item.type === 'passfail' && v.result) {
            result = v.result === 'pass' ? 'Pass' : 'FAIL'
            cls = v.result === 'fail' ? 'bad' : 'good'
          }
          return <tr key={item.id}><td>{item.label}</td><td className={cls}>{result}</td></tr>
        })}
      </tbody></table>

      <h4>Refrigerant log</h4>
      {job.refrigerant.movements.length ? (
        <table><tbody>
          {job.refrigerant.movements.map((m, i) => (
            <tr key={i}><td style={{ textTransform: 'capitalize' }}>{m.type}</td><td>{m.kg} kg {m.refrigerant} · cylinder {m.cylinder}</td></tr>
          ))}
        </tbody></table>
      ) : (
        <p>No refrigerant added or recovered this visit.</p>
      )}

      <h4>Photos ({photos.length})</h4>
      {photos.length ? (
        <div className="r-photos">
          {photos.map((p) => (
            <figure key={p.label}><img src={p.src} alt={p.label} /><figcaption>{p.label}{p.sample ? ' · sample' : ''}</figcaption></figure>
          ))}
        </div>
      ) : <p>No photos.</p>}

      {(job.notes || job.voice?.approved) && (
        <>
          <h4>Engineer findings</h4>
          {job.voice?.approved && scenario.voice ? scenario.voice.findings.map((f) => <p key={f.id}><em>{f.label}:</em> {f.text}</p>) : null}
          {job.voice?.approved && scenario.voice ? scenario.voice.missing.map((m) => <p key={m.id}>{job.voice.answers[m.id]}</p>) : null}
          {job.notes && <p>{job.notes}</p>}
        </>
      )}

      <h4>Follow-up work</h4>
      {fups.length ? (
        <ul className="r-list">
          {fups.map((f) => <li key={f.number} data-testid="report-followup"><strong>{f.number}</strong> · {f.title} · {f.priority}</li>)}
        </ul>
      ) : <p>None required.</p>}

      <h4>Sign-off</h4>
      <div className="r-sigs">
        <div>
          <p className="r-src">Engineer</p>
          {job.engineerSig ? <><img src={job.engineerSig} alt="Engineer signature" /><p>{ENGINEER.name} · {job.engineerSignedAt}</p></> : <p>Awaiting signature</p>}
        </div>
        <div>
          <p className="r-src">Customer</p>
          {job.signoff?.type === 'signed' && <><img src={job.signoff.signature} alt="Customer signature" /><p>{job.signoff.name} · {job.signoff.at}</p></>}
          {job.signoff?.type === 'not_present' && <p>Customer not present: {job.signoff.reason}.</p>}
          {!job.signoff && <p>Awaiting sign-off</p>}
        </div>
      </div>
      <p className="r-demo" style={{ marginTop: 14 }}>Generated automatically from the job, RA, checklist, photos, refrigerant log and signatures. Nothing was typed twice.</p>
    </div>
  )
}
