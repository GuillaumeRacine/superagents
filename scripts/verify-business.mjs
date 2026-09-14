import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { readFileSync, existsSync } from 'node:fs'
import { encode } from 'next-auth/jwt'
import { projectSnapshot } from '../lib/business-model.mjs'
const secret = 'synthetic-local-verification-only'
const marker = 'SYNTHETIC_PRIVATE_BUSINESS_SENTINEL'
const fixture = {schemaVersion:1,collectedAt:new Date().toISOString(),businesses:[{id:'sample',name:marker,objective:'Prove customer value',nextAction:'Review the evidence',coverage:'Synthetic only',metrics:[{label:'Orders',value:0,unit:'orders',period:'7 days',observedAt:'2026-09-01',source:'https://github.com/example/repo/issues/1'},{label:'Margin',value:null}],sources:[],execution:[],outcomes:[]}]}
for(const content of ['public/superagents.md','public/llms.txt']) assert(!readFileSync(content,'utf8').includes(marker))
assert(!existsSync('.next/server/app/business.html'), 'Business page must not be static')
const probe = createServer(); await new Promise(r=>probe.listen(0,'127.0.0.1',r)); const port = probe.address().port; await new Promise(r=>probe.close(r))
const base = `http://127.0.0.1:${port}`
const server = spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port)], {env:{...process.env,AUTH_SECRET:secret,AUTH_GOOGLE_ID:'example',AUTH_GOOGLE_SECRET:'example',AUTH_TRUST_HOST:'true',AUTHORIZED_GOOGLE_EMAILS:'owner@example.com,second@example.com',BUSINESS_SNAPSHOT_JSON:JSON.stringify(fixture)},stdio:'ignore'})
let browser
try {
  for(let i=0;i<80;i++){try{await fetch(base);break}catch{} await new Promise(r=>setTimeout(r,100))}
  for(const [label,email,maxAge] of [['owner','owner@example.com',600],['second','second@example.com',600],['disallowed','other@example.com',600],['expired','owner@example.com',-100]]) {
    const token = await encode({secret,salt:'authjs.session-token',token:{email},maxAge})
    for(const path of ['/business','/api/business','/business?_rsc']) {
      const response = await fetch(base+path,{redirect:'manual',headers:{cookie:`authjs.session-token=${token}`,...(path.includes('_rsc')?{RSC:'1'}:{})}})
      const body = await response.text()
      if(['owner','second'].includes(label)) {
        assert.equal(response.status,200, `${label} ${path}: ${response.headers.get('location')}`); assert(body.includes(marker)); assert.match(response.headers.get('cache-control'),/no-store/)
        if(path==='/api/business') assert.deepEqual(JSON.parse(body).snapshot,projectSnapshot(fixture))
      } else { assert([307,401].includes(response.status)); assert(!body.includes(marker)) }
    }
    console.log(`PASS ${label}: HTML/API/RSC`)
  }
  for(const cookie of ['', 'authjs.session-token=invalid']) for(const path of ['/business','/api/business','/business?_rsc']) {
    const r = await fetch(base+path,{redirect:'manual',headers:{cookie,RSC:'1','x-middleware-subrequest':'proxy:proxy:proxy:proxy:proxy'}})
    assert([307,401].includes(r.status)); assert(!(await r.text()).includes(marker))
  }
  console.log('PASS missing/invalid sessions and middleware spoof attempt')
  if(process.env.BUSINESS_PLAYWRIGHT_MODULE) {
    const {chromium} = await import(process.env.BUSINESS_PLAYWRIGHT_MODULE)
    browser = await chromium.launch({channel:'chrome',headless:true})
    const context = await browser.newContext({viewport:{width:1440,height:1000}})
    const token=await encode({secret,salt:'authjs.session-token',token:{email:'owner@example.com'},maxAge:600})
    await context.addCookies([{name:'authjs.session-token',value:token,url:base}])
    const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message))
    await page.goto(base+'/business'); await page.getByRole('heading',{name:'Business Dashboard',exact:true}).waitFor()
    await page.getByRole('link',{name:'Review business →'}).click()
    await page.getByText('Execution evidence',{exact:true}).click()
    assert(await page.getByText('Issue status is not deployment verification or business success.',{exact:false}).isVisible())
    await page.evaluate(()=>window.scrollTo(0,0))
    await page.screenshot({path:'/tmp/business-dashboard-desktop.png',fullPage:true})
    await page.setViewportSize({width:390,height:844})
    assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))
    await page.screenshot({path:'/tmp/business-dashboard-mobile.png',fullPage:true})
    assert.deepEqual(errors,[])
    console.log('PASS desktop/mobile, drilldown, no overflow or browser errors')
  }
} finally {await browser?.close();server.kill()}
