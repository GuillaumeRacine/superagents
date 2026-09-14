// Pure projection: no credentials, source payload spreading, or network access.
const text = (v, max = 500) => typeof v === 'string' ? v.slice(0, max) : ''
const date = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null
export function evidenceUrl(value) {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && u.hostname === 'github.com' && !u.username && !u.password ? u.href : null
  } catch { return null }
}
export function freshness(observedAt, now = Date.now(), hours = 48) {
  const time = Date.parse(observedAt)
  if (!Number.isFinite(time) || time > now + 300000) return 'unknown'
  return now - time > hours * 3600000 ? 'stale' : 'current'
}
export function projectSnapshot(raw, now = Date.now()) {
  if (!raw || raw.schemaVersion !== 1 || !Array.isArray(raw.businesses) || raw.businesses.length > 30 || !date(raw.collectedAt)) throw Error('Invalid snapshot')
  const ids = new Set()
  const businesses = raw.businesses.map(b => {
    if (!/^[a-z][a-z0-9-]{0,59}$/.test(b.id) || ids.has(b.id) || !b.name) throw Error('Invalid business')
    ids.add(b.id)
    const sources = (Array.isArray(b.sources) ? b.sources : []).slice(0, 20).map(s => ({
      label: text(s.label, 100), url: evidenceUrl(s.url), observedAt: date(s.observedAt),
      state: freshness(s.observedAt, now), note: text(s.note),
    }))
    const metrics = (Array.isArray(b.metrics) ? b.metrics : []).slice(0, 12).map(m => ({
      label: text(m.label, 100), value: typeof m.value === 'number' && Number.isFinite(m.value) ? m.value : null,
      unit: text(m.unit, 50), period: text(m.period, 100), definition: text(m.definition),
      observedAt: date(m.observedAt), state: freshness(m.observedAt, now), source: evidenceUrl(m.source),
    }))
    const outcomes = (Array.isArray(b.outcomes) ? b.outcomes : []).slice(0, 20).map(o => ({
      label: text(o.label), state: ['open','blocked','candidate','closed','cancelled'].includes(o.state) ? o.state : 'unknown',
      nextAction: text(o.nextAction), doneWhen: text(o.doneWhen), source: evidenceUrl(o.source), observedAt: date(o.observedAt),
    }))
    const execution = (Array.isArray(b.execution) ? b.execution : []).slice(0, 15).map(e => ({
      label: text(e.label, 200), state: ['open','closed'].includes(e.state) ? e.state : 'unknown', source: evidenceUrl(e.source), observedAt: date(e.observedAt),
    }))
    return { id: b.id, name: text(b.name, 100), objective: text(b.objective), objectiveStatus: 'provisional',
      nextAction: text(b.nextAction), coverage: text(b.coverage), sources, metrics, outcomes, execution }
  })
  return { schemaVersion: 1, collectedAt: date(raw.collectedAt), collectionState: freshness(raw.collectedAt, now), businesses }
}
export function readSnapshot(value, now = Date.now()) {
  if (!value) return { state: 'unconfigured', snapshot: null }
  try {
    if (Buffer.byteLength(value) > 48000) throw Error('Too large')
    return { state: 'ready', snapshot: projectSnapshot(JSON.parse(value), now) }
  } catch { return { state: 'invalid', snapshot: null } }
}
