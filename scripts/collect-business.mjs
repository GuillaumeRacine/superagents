// Operator-invoked read-only collection. Config and output MUST be outside this
// public checkout. Credentials stay in the existing GitHub CLI session.
import { readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { resolve, dirname, relative, isAbsolute } from 'node:path'
import { execFileSync } from 'node:child_process'
import { projectSnapshot } from '../lib/business-model.mjs'
const [configFile, outputFile] = process.argv.slice(2)
if (!configFile || !outputFile) throw Error('Usage: node scripts/collect-business.mjs PRIVATE_CONFIG PRIVATE_OUTPUT')
const root = realpathSync(process.cwd())
for (const file of [configFile, outputFile]) {
  const absolute = resolve(realpathSync(dirname(resolve(file))), resolve(file).split('/').at(-1))
  const rel = relative(root, absolute)
  if (!rel.startsWith('..') && !isAbsolute(rel)) throw Error('Private files must be outside public checkout')
}
const config = JSON.parse(readFileSync(configFile,'utf8'))
const collectedAt = new Date().toISOString()
const gh = path => JSON.parse(execFileSync('gh',['api',path],{encoding:'utf8',maxBuffer:4000000,stdio:['ignore','pipe','pipe']}))
function contents(repo, path) {
  const v = gh(`repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=main`)
  return JSON.parse(Buffer.from(v.content,'base64').toString())
}
const state = contents(config.outcomeSource.repository, config.outcomeSource.path)
const businesses = config.businesses.map(b => {
  const sources = [], metrics = [], execution = [], outcomes = []
  let native
  const url = `https://github.com/${b.metricSource.repository}/blob/main/${b.metricSource.path}`
  try {
    native = contents(b.metricSource.repository,b.metricSource.path)
    sources.push({label:'Business metric collector',url,observedAt:native.ts,note:(native.errors||[]).join('; ') || 'Collector reports no errors. Not independent business validation.'})
  } catch { sources.push({label:'Business metric collector',url,observedAt:null,note:'Read failed. No values inferred.'}) }
  for(const m of b.metrics) {
    const v = native?.metrics?.[m.key]
    metrics.push({label:m.label,value:v?.value ?? null,unit:v?.unit||m.unit||'',period:m.period,definition:[m.definition,v?.note].filter(Boolean).join(' '),observedAt:native?.ts||null,source:url})
  }
  for(const repo of b.repositories) {
    try {
      const issues = gh(`repos/${repo}/issues?state=open&sort=updated&direction=desc&per_page=20`).filter(i=>!i.pull_request).slice(0,3)
      for(const i of issues) execution.push({label:i.title,state:i.state,source:i.html_url,observedAt:i.updated_at})
      sources.push({label:'Execution sample',url:`https://github.com/${repo}/issues`,observedAt:collectedAt,note:'Up to three recently updated open issues, from first twenty issue/PR results. Not the full backlog or outcome acceptance.'})
    } catch { sources.push({label:'Execution sample',url:`https://github.com/${repo}/issues`,observedAt:null,note:'Read failed; coverage unknown.'}) }
  }
  for(const id of b.outcomeIds) {
    const o = state.outcomes?.[id]
    if(!o) throw Error('Mapped outcome missing')
    outcomes.push({label:o.outcome,state:o.state,nextAction:o.next_action,doneWhen:o.done_when,observedAt:collectedAt,source:`https://github.com/${config.outcomeSource.repository}/blob/main/${config.outcomeSource.path}`})
  }
  sources.push({label:'Retained outcome mapping',url:`https://github.com/${config.outcomeSource.repository}/blob/main/${config.outcomeSource.path}`,observedAt:collectedAt,note:b.outcomeIds.length?'Explicit IDs only; owner disposition retained.':'No explicitly mapped retained outcome IDs; do not infer business goals from unrelated personal intentions.'})
  return {...b, metrics, sources, execution, outcomes}
})
const result = projectSnapshot({schemaVersion:1,collectedAt,businesses})
writeFileSync(outputFile,JSON.stringify(result,null,2)+'\n',{mode:0o600})
console.log(`Collected ${result.businesses.length} businesses. Private payload not printed.`)
