// All data in this file is invented for the demo. No real customers, sites or people.

export const ENGINEER = {
  name: 'Jamie Hall',
  role: 'Refrigeration engineer',
  company: 'AZZTECH demo',
  fgasCert: 'F-gas Cat I · cert DEMO-55120',
  hydrocarbon: 'Flammable refrigerants (A2L / A3) · demo cert HC-2291',
  van: 'Van 07',
}

export const CUSTOMER = {
  name: 'Demo Foods Ltd',
  site: 'Unit 4 Cold Store',
  address: '12 Harbour Way, Bristol BS1 6QH',
  contact: 'Sam Patel (site supervisor)',
  phone: '0117 000 0000',
  access: 'Report to goods-in. Plant room key on the site key board.',
  emergency: 'Nearest A&E: Bristol Royal Infirmary (demo). Assembly point: front car park.',
}

export const REFRIGERANTS = {
  R32: { name: 'R32', safety: 'A2L', gwp: 675, label: 'A2L · mildly flammable' },
  R290: { name: 'R290 (propane)', safety: 'A3', gwp: 3, label: 'A3 · highly flammable' },
  R404A: { name: 'R404A', safety: 'A1', gwp: 3922, label: 'A1 · non-flammable, high GWP' },
}

// Hazard modules. The rules engine below decides which ones apply.
const H = {
  electrical: {
    title: 'Electrical isolation / LOTO', risk: 'Amber', residual: 'Green',
    controls: 'Isolate at the local isolator, lock off with your own padlock, and prove dead with a tested voltage indicator before opening panels.',
  },
  lone: {
    title: 'Lone working', risk: 'Amber', residual: 'Green',
    controls: 'Check in with the office on arrival and departure. Phone signal can be poor in plant areas.',
  },
  pressure: {
    title: 'Pressurised refrigerant / cold burns', risk: 'Amber', residual: 'Green',
    controls: 'Safety glasses and refrigerant-rated gloves when connecting gauges. Check hoses and seals before use.',
  },
  manualPlant: {
    title: 'Manual handling: panels and guards', risk: 'Amber', residual: 'Green',
    controls: 'Use two people or lifting aids for heavy guards. Keep a clear walkway around the unit.',
  },
  manualCabinet: {
    title: 'Manual handling: moving the cabinet and stock', risk: 'Amber', residual: 'Green',
    controls: 'Empty the cabinet before moving it. Use a sack truck or two people. Check the floor is dry.',
  },
  food: {
    title: 'Food stock and hygiene', risk: 'Amber', residual: 'Green',
    controls: 'Ask site to move stock to a back-up freezer. Keep tools off food surfaces. Record the as-found temperature.',
  },
  a2l: {
    title: 'A2L mildly flammable refrigerant', risk: 'Amber', residual: 'Green',
    controls: 'Ventilate the area. Keep ignition sources away. Leak-check with an A2L-rated detector before any hot work.',
  },
  a3: {
    title: 'Highly flammable refrigerant (A3)', risk: 'Red', residual: 'Amber',
    controls: 'No smoking or naked flames. Use non-sparking tools and an intrinsically safe torch. Hydrocarbon-safe recovery unit only.',
  },
  atex: {
    title: 'Temporary flammable zone (ATEX)', risk: 'Red', residual: 'Amber',
    controls: 'Set a 3 m exclusion zone with signs. Personal gas detector switched on and alarming below 20% LFL. Keep the zone ventilated while the circuit is open.',
  },
  highGwp: {
    title: 'High-GWP refrigerant (F-gas)', risk: 'Amber', residual: 'Green',
    controls: 'Recover all gas. No venting. Record every kg against the asset and cylinder.',
  },
  recovery: {
    title: 'Opening the circuit: recovery and recharge', risk: 'Red', residual: 'Amber',
    controls: 'Recover into a correctly rated cylinder before breaking into the circuit. Weigh recovered and added charge into the refrigerant log.',
  },
  hotworks: {
    title: 'Hot works / brazing', risk: 'Red', residual: 'Amber',
    controls: 'Clear combustibles, purge with oxygen-free nitrogen, keep an extinguisher to hand, and do a 30-minute fire watch after finishing.',
  },
  hotworksA3: {
    title: 'Brazing on a hydrocarbon circuit', risk: 'Red', residual: 'Amber',
    controls: 'Recover fully, purge with OFN, and prove gas-free with the detector before any flame. Hot works permit from site required.',
  },
  height: {
    title: 'Working at height', risk: 'Red', residual: 'Amber',
    controls: 'Use a suitable platform or podium steps on firm ground. Never stand on the unit or cabinet.',
  },
}

/**
 * Deterministic rules engine. Same inputs, same hazards every time.
 * AI never decides what is mandatory.
 */
export function buildHazards({ assetType, refrigerant, jobKind, circuitMayOpen, tags }) {
  const ref = REFRIGERANTS[refrigerant]
  const out = []
  const add = (id, source, locked = true) => out.push({ id, ...H[id], source, locked })

  add('electrical', 'Always: powered equipment')
  add('lone', 'Always: unaccompanied visit')
  add('pressure', `Asset has a refrigerant circuit (${refrigerant})`)
  if (assetType === 'Condensing unit') add('manualPlant', 'Equipment: condensing unit')
  if (assetType === 'Integral cabinet') {
    add('manualCabinet', 'Equipment: integral cabinet')
    add('food', 'Equipment: food storage cabinet')
  }
  if (ref.safety === 'A2L') add('a2l', `Refrigerant ${refrigerant} is A2L`)
  if (ref.safety === 'A3') {
    add('a3', `Refrigerant ${refrigerant} is A3`)
    add('atex', `Refrigerant ${refrigerant} is A3`)
  }
  if (ref.gwp >= 2500) add('highGwp', `${refrigerant} GWP ${ref.gwp}`)
  if (circuitMayOpen) add('recovery', `${jobKind} job: circuit may be opened`)
  if (tags.includes('hotworks')) {
    add('hotworks', 'You tagged hot works', false)
    if (ref.safety === 'A3') add('hotworksA3', `Hot works + ${refrigerant} (A3)`)
  }
  if (tags.includes('height')) add('height', 'You tagged working at height', false)
  return out
}

export const OPTIONAL_TAGS = [
  { id: 'hotworks', label: 'Hot works / brazing' },
  { id: 'height', label: 'Working at height' },
]

export const SCENARIOS = {
  ppm: {
    id: 'ppm',
    title: 'Routine PPM',
    subtitle: 'Condensing unit · R32',
    blurb: 'Assigned to you. Sign the dynamic RA, take readings and photos, fail one check, raise a follow-up, close with a report.',
    jobNumber: 'JOB-1042',
    nextJobNumber: 1043,
    kind: 'PPM',
    priority: 'Routine',
    status: 'Assigned',
    assigned: true,
    due: 'Today, 09:00–12:00',
    summary: 'Six-month planned maintenance on the rear plant-room condensing unit.',
    location: 'Plant room, rear of warehouse',
    circuitMayOpen: false,
    asset: {
      code: 'CU-04', name: 'Condensing unit, cold room 2', type: 'Condensing unit',
      make: 'Demo Coolers', model: 'DC-6Z', serial: 'DC-44821',
      refrigerant: 'R32', chargeKg: 3.2, condition: 'Good', installed: 'Mar 2022',
    },
    lastVisit: {
      date: '11 May 2026', job: 'JOB-0971',
      result: 'PPM passed. Suction 4.6 bar, discharge 18.4 bar, superheat 8 K. No defects.',
    },
    history: [
      { date: '11 May 2026', text: 'PPM passed, no defects' },
      { date: '18 Nov 2025', text: 'PPM passed, condenser washed' },
      { date: '4 Aug 2025', text: 'Fan capacitor replaced' },
    ],
    competence: null,
    conditions: [
      'The plant room is ventilated and clear of ignition sources',
      'Access and walkways are clear',
      'No other contractors are working on this equipment',
      'Site conditions match the hazards above',
    ],
    checklistModules: ['Condensing unit PPM', 'A2L refrigerant checks'],
    checks: [
      { id: 'visual', label: 'Visual condition of unit and pipework', type: 'passfail', required: true, photo: true, photoRequired: true,
        hint: 'Photo of the unit as found.', sample: 'unit' },
      { id: 'suction', label: 'Suction pressure', type: 'reading', unit: 'bar', min: 4.0, max: 6.0, required: true, typical: 'Typical 4.0–6.0 bar', sampleValue: '4.8' },
      { id: 'discharge', label: 'Discharge pressure', type: 'reading', unit: 'bar', min: 16, max: 22, required: true, typical: 'Typical 16–22 bar', sampleValue: '18.9' },
      { id: 'superheat', label: 'Superheat', type: 'reading', unit: 'K', min: 5, max: 12, required: true, typical: 'Typical 5–12 K', sampleValue: '7.5' },
      { id: 'electrical', label: 'Electrical connections tight and undamaged', type: 'passfail', required: true, photo: true,
        hint: 'Demo: mark this as Fail to see a follow-up job created.', demoFail: true, sample: 'terminal',
        followUp: { title: 'Replace discoloured contactor terminal and retighten connections on CU-04', priority: 'Within 7 days' } },
      { id: 'condenser', label: 'Condenser coil clean, fans running', type: 'passfail', required: true },
      { id: 'leak', label: 'Leak check with A2L-rated detector', type: 'passfail', required: true, module: 'A2L refrigerant checks' },
    ],
    refrigerantDefaultNone: true,
    voice: false,
  },

  r290: {
    id: 'r290',
    title: 'Reactive repair',
    subtitle: 'R290 freezer cabinet · urgent',
    blurb: 'Unassigned call-out. Claim it, see the RA adapt for R290, tag hot works, log recovered gas, try the voice note.',
    jobNumber: 'JOB-2117',
    nextJobNumber: 2118,
    kind: 'Reactive',
    priority: 'Urgent',
    status: 'New',
    assigned: false,
    due: 'Respond within 4 hours',
    summary: 'Upright freezer cabinet not holding temperature. Ice on the evaporator. Possible leak.',
    location: 'Kitchen prep area, back wall',
    circuitMayOpen: true,
    asset: {
      code: 'FF-12', name: 'Upright freezer cabinet', type: 'Integral cabinet',
      make: 'Demo Cabinets', model: 'UF-600', serial: 'UC-22910',
      refrigerant: 'R290', chargeKg: 0.15, condition: 'Average', installed: 'Jan 2023',
    },
    lastVisit: {
      date: '22 Jun 2026', job: 'JOB-0814',
      result: 'PPM passed. Box holding at −18 °C. No leak found.',
    },
    history: [
      { date: '22 Jun 2026', text: 'PPM passed, box at −18 °C' },
      { date: '9 Jan 2026', text: 'Door gasket replaced' },
    ],
    competence: {
      title: 'Flammable refrigerant competence',
      body: 'This asset uses R290 (A3, highly flammable). Confirm you hold a flammable refrigerant qualification and will follow the RA controls. This is a warning, not a hard block; your acknowledgement is recorded on the job.',
    },
    conditions: [
      'The area is ventilated and ignition sources are controlled',
      'A hydrocarbon-safe recovery unit, scales and gas detector are to hand',
      'Stock has been moved out of the cabinet',
      'Site conditions match the hazards above',
    ],
    checklistModules: ['Integral cabinet reactive', 'A3 hydrocarbon checks'],
    checks: [
      { id: 'confirm', label: 'Fault confirmed (temperature high, ice on evaporator)', type: 'passfail', required: true, photo: true, photoRequired: true,
        hint: 'Pass = the reported fault is present. Photo of the ice-up or display.', sample: 'ice' },
      { id: 'box-temp', label: 'Box temperature as found', type: 'reading', unit: '°C', min: -22, max: -15, required: true, typical: 'Setpoint −18 °C', sampleValue: '-2' },
      { id: 'lfl', label: 'Gas detector in work area before opening circuit', type: 'reading', unit: '% LFL', min: 0, max: 20, required: true, typical: 'Must be below 20% LFL', sampleValue: '0', module: 'A3 hydrocarbon checks' },
      { id: 'leak-found', label: 'Leak located and repaired', type: 'passfail', required: true, photo: true, hint: 'Photo of the repaired joint or valve.', sample: 'valve' },
      { id: 'pressure', label: 'OFN pressure test hold', type: 'reading', unit: 'bar', min: 10, max: 25, required: true, typical: 'Hold at 15 bar for 10 min', sampleValue: '15' },
      { id: 'running', label: 'Cabinet running and pulling down after recharge', type: 'passfail', required: true },
      { id: 'caps', label: 'Access valve caps fitted', type: 'passfail', required: true, module: 'A3 hydrocarbon checks',
        hint: 'Demo: mark this as Fail (no spare cap on the van) to raise a follow-up.', demoFail: true,
        followUp: { title: 'Fit missing access valve cap on FF-12 suction schrader', priority: 'Next visit' } },
    ],
    refrigerantDefaultNone: false,
    refrigerantPrompt: 'Log any R290 recovered or added. This writes to the asset refrigerant log, not a form box.',
    sampleMovements: [
      { type: 'recovered', kg: '0.12', refrigerant: 'R290', cylinder: 'CYL-208' },
      { type: 'added', kg: '0.145', refrigerant: 'R290', cylinder: 'CYL-208' },
    ],
    voice: {
      transcript:
        'Cabinet was up at minus two, should be minus eighteen. Ice built up on the evap, found a leak on the suction schrader. Recovered the charge, replaced the schrader core, pressure tested, recharged with one four five grams from cylinder two zero eight. Running nicely now, box coming down. Didn’t have a spare cap for the schrader, I’ll mention that.',
      findings: [
        { id: 'fault', label: 'Fault', text: 'Cabinet not holding temperature. As found: −2 °C against a −18 °C setpoint. Ice on the evaporator.' },
        { id: 'cause', label: 'Cause', text: 'Leak at the suction schrader core.' },
        { id: 'work', label: 'Work done', text: 'Recovered the charge, replaced the schrader core, pressure tested, recharged 145 g of R290 from cylinder CYL-208.' },
        { id: 'outcome', label: 'Outcome', text: 'Cabinet running and pulling down. No spare schrader cap on the van; follow-up raised.' },
      ],
      missing: [
        { id: 'hold', prompt: 'Pressure test result is not in the note. What was the hold pressure and duration?', suggestion: 'OFN pressure test at 15 bar, held for 10 minutes, no decay.' },
        { id: 'postleak', prompt: 'Did you leak-check after recharge?', suggestion: 'Leak-checked with hydrocarbon detector after recharge, no leak found.' },
      ],
    },
  },
}

export const STEPS = [
  { id: 'open', label: 'Job' },
  { id: 'safety', label: 'Safety' },
  { id: 'work', label: 'Work' },
  { id: 'results', label: 'Results' },
  { id: 'close', label: 'Close' },
]
