import { redirect } from 'next/navigation'
import { getBusinessData } from '@/lib/business-data'
import styles from './business.module.css'
import { useMDXComponents } from 'nextra-theme-docs'

const { wrapper: Wrapper } = useMDXComponents()
const pageMetadata = { title: 'Business Dashboard', filePath: 'app/business/page.tsx', searchable: false }

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Business Dashboard', robots: { index: false, follow: false } }
const when = (value: string) => value ? new Date(value).toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }) + ' ET' : 'Not observed'
function Evidence({ url, label = 'View evidence' }: {url: string, label?: string}) {
  return url ? <a href={url} target="_blank" rel="noopener noreferrer">{label} ↗</a> : <span>No linked evidence</span>
}
export default async function BusinessDashboard() {
  const data = await getBusinessData()
  if (!data) redirect('/api/auth/signin?callbackUrl=%2Fbusiness')
  const snapshot = data.snapshot
  return <Wrapper toc={[]} metadata={pageMetadata} sourceCode=""><div className={styles.dashboard} data-pagefind-ignore="all">
    <header className={styles.hero}>
      <div className={styles.eyebrow}>SUPER AGENTS / FOUNDER VIEW</div>
      <h1>Business Dashboard</h1>
      <p>Your businesses. The evidence. Your next decision.</p>
      <div className={styles.tags}><span>Private · Read-only</span><span>Selected portfolio · Not the whole estate</span></div>
    </header>
    <nav className={styles.nav} aria-label="Business sections"><a href="/finance">Finance Dashboard ↗</a><a href="#attention">Attention</a><a href="#portfolio">Portfolio</a><a href="#coverage">Data coverage</a><a href="/">Documentation ↗</a></nav>
    {!snapshot ? <section className={styles.panel}>
      <h2>{data.state === 'invalid' ? 'Data needs attention' : 'Private data is not connected yet'}</h2>
      <p>{data.state === 'invalid' ? 'The snapshot failed validation. No partial or unvalidated records are displayed.' : 'The secure dashboard is ready. Business records will appear after the source snapshot and Google sign-in verification are complete.'}</p>
      <p>No results, revenue, or progress have been assumed. Your documentation remains available.</p>
      <a href="https://github.com/GuillaumeRacine/superagents/issues/30">View rollout status ↗</a>
    </section> : <>
      <div className={styles.status}>Snapshot collected {when(snapshot.collectedAt)} · {snapshot.collectionState}. Individual observations may be older. Reloading does not refresh the source.</div>
      <section id="attention" className={styles.panel}>
        <div className={styles.sectionLabel}>01 / NEXT DECISIONS</div><h2>Needs your attention</h2>
        <p className={styles.muted}>Proposed next actions, not owner-approved priorities. No automated decisions.</p>
        {snapshot.businesses.map(b => <a className={styles.attention} href={`#${b.id}`} key={b.id}><strong>{b.name}</strong><span>{b.nextAction || 'Next action not yet defined.'}</span><span aria-hidden="true">↗</span></a>)}
      </section>
      <section id="portfolio"><div className={styles.sectionLabel}>02 / PORTFOLIO</div><h2>Business overview</h2>
        <div className={styles.grid}>{snapshot.businesses.map(b => <article className={styles.card} key={b.id}>
          <div className={styles.cardTop}><h3><a href={`#${b.id}`}>{b.name}</a></h3><span className={styles.badge}>Partial coverage</span></div>
          <p>{b.objective || 'Objective not yet defined.'}</p><small>Provisional focus · Outcome acceptance not inferred</small>
          <div className={styles.metrics}>{b.metrics.slice(0,2).map((m,i) => <div key={i}><span>{m.label}</span><strong>{m.value === null ? 'Unknown' : m.value.toLocaleString('en-CA')}</strong><small>{m.unit} · {m.period} · {m.state}</small></div>)}</div>
          <a href={`#${b.id}`}>Review business →</a>
        </article>)}</div>
      </section>
      {snapshot.businesses.map(b => <section id={b.id} className={styles.panel} key={b.id}>
        <div className={styles.sectionLabel}>BUSINESS DETAIL</div><h2>{b.name}</h2><p>{b.objective}</p>
        <details open><summary>Results and metrics</summary><div className={styles.metricGrid}>
          {b.metrics.length === 0 && <p>No verified metrics connected.</p>}
          {b.metrics.map((m,i) => <article className={styles.metric} key={i}><h3>{m.label}</h3><strong>{m.value === null ? 'Unknown' : m.value.toLocaleString('en-CA')}</strong><p>{m.unit} · {m.period}</p><p>{m.definition}</p><small>{m.state} · Observed {when(m.observedAt)}</small><Evidence url={m.source}/></article>)}
        </div></details>
        <details open><summary>Outcomes</summary>{!b.outcomes.length && <p>No explicitly mapped retained outcomes. This does not mean there are no business goals.</p>}
          {b.outcomes.map((o,i) => <article className={styles.row} key={i}><h3>{o.label}</h3><p>Recorded status: {o.state}</p><p>Done when: {o.doneWhen || 'Not specified'}</p><p>Next: {o.nextAction || 'Not specified'}</p><small>Observed {when(o.observedAt)}</small><Evidence url={o.source}/></article>)}
        </details>
        <details><summary>Execution evidence</summary><p>Issue status is not deployment verification or business success. This is a selected sample, not a complete backlog.</p>{b.execution.map((e,i) => <article className={styles.row} key={i}><h3>{e.label}</h3><p>{e.state} · Source updated {when(e.observedAt)}</p><Evidence url={e.source}/></article>)}</details>
        <details><summary>Sources and supporting systems</summary><p>{b.coverage}</p>{b.sources.map((s,i) => <article className={styles.row} key={i}><h3>{s.label}</h3><p>{s.state} · Observed {when(s.observedAt)}</p><p>{s.note}</p><Evidence url={s.url}/></article>)}</details>
        <a href="#portfolio">↑ Back to portfolio</a>
      </section>)}
    </>}
    <section id="coverage" className={styles.panel}><div className={styles.sectionLabel}>03 / TRUST & COVERAGE</div><h2>Know what you’re looking at</h2><p>Business outcomes, delivery activity, and data freshness are separate. Missing data is not zero. A successful agent run is not an accepted result.</p><p>This first release uses reviewed snapshots. Live source collection, cross-device telemetry, financial reconciliation, private search and exports are not connected yet.</p><p>Only your existing allowlisted Google accounts can access this view. Private business content is excluded from the public documentation export and search index.</p></section>
  </div></Wrapper>
}
