import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { projectSnapshot, readSnapshot, freshness, evidenceUrl } from '../lib/business-model.mjs'
import { isAllowedEmail } from '../lib/access-policy.mjs'
const now = Date.parse('2026-09-14T12:00:00Z')
const fixture = () => ({ schemaVersion: 1, collectedAt: '2026-09-14T10:00:00Z', businesses: [{ id: 'example', name: 'Example business', objective: 'Validate demand', rawSecret: 'never-project-this', metrics: [{label:'Orders',value:0,observedAt:'2026-09-04',source:'https://github.com/example/repo/issues/1'},{label:'Margin',value:null}], sources:[], outcomes:[] }] })
test('projection strips fields and preserves null versus zero', () => {
  const result = projectSnapshot(fixture(), now)
  assert.equal(result.businesses[0].metrics[0].value, 0)
  assert.equal(result.businesses[0].metrics[1].value, null)
  assert.equal(result.businesses[0].metrics[0].state, 'stale')
  assert(!JSON.stringify(result).includes('never-project-this'))
})
test('freshness never replaces observation time with collection time', () => {
  assert.equal(freshness('2026-09-14T10:00:00Z', now), 'current')
  assert.equal(freshness('2026-09-20', now), 'unknown')
  assert.equal(freshness(null, now), 'unknown')
})
test('empty, malformed, oversized and duplicate snapshots fail safely', () => {
  assert.equal(readSnapshot().state, 'unconfigured')
  for (const value of ['{}','null','bad', 'a'.repeat(48001)]) assert.equal(readSnapshot(value).state, 'invalid')
  const f = fixture(); f.businesses.push(f.businesses[0]); assert.throws(()=>projectSnapshot(f))
})
test('unsafe evidence links are discarded', () => {
  for (const value of ['javascript:alert(1)','https://github.com.evil.test/a','http://github.com/a','https://secret@github.com/a']) assert.equal(evidenceUrl(value),null)
})
test('exact allowlist, not a domain or suffix match', () => {
  assert(isAllowedEmail('OWNER@example.com','owner@example.com,second@example.com'))
  for (const value of [null,'intruder@example.com','owner@example.com.evil']) assert(!isAllowedEmail(value,'owner@example.com'))
})
test('data layer authenticates before reading config and has no public prefix', () => {
  const code = readFileSync('lib/business-data.ts','utf8')
  assert(code.includes("import 'server-only'"))
  assert(code.indexOf('await auth()') < code.indexOf('process.env.BUSINESS_SNAPSHOT_JSON'))
  assert(code.indexOf('return null') < code.indexOf('process.env.BUSINESS_SNAPSHOT_JSON'))
  assert(!code.includes('NEXT_PUBLIC'))
})
