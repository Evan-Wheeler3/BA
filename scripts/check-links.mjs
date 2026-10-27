// Checks every URL in the resource registry and prints a report.
// Run from a machine with normal internet access:  npm run check-links
//
// Interpreting results: Trailhead and Salesforce Help render client-side and may
// answer automated requests with 403/429 or a login wall. Those are reported as
// "inconclusive", not "broken". Only a 404/410 is treated as a likely dead link.
// A successful response means the URL resolves — it is not a content review, so this
// script never marks a resource as "reviewed"; update resources.ts by hand after
// reading a page.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const src = readFileSync(new URL('../src/domain/content/resources.ts', import.meta.url), 'utf8')
const entries = [...src.matchAll(/id: '([^']+)',\s*\n\s*title: '([^']+)'[\s\S]*?url: '([^']+)'/g)].map((m) => ({ id: m[1], title: m[2], url: m[3] }))

async function probe(url) {
  const started = Date.now()
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (BA Exam Coach link checker)', Accept: 'text/html' },
      signal: AbortSignal.timeout(15000),
    })
    const status = res.status
    const verdict = status < 300 ? 'ok' : status === 404 || status === 410 ? 'broken' : 'inconclusive'
    return { status, verdict, finalUrl: res.url, ms: Date.now() - started }
  } catch (e) {
    return { status: 0, verdict: 'unreachable', error: String(e?.cause?.code ?? e?.message ?? e), ms: Date.now() - started }
  }
}

const results = []
for (const e of entries) {
  const r = await probe(e.url)
  results.push({ ...e, ...r, checkedAt: new Date().toISOString() })
  const redirect = r.finalUrl && r.finalUrl !== e.url ? ` → ${r.finalUrl}` : ''
  console.log(`${r.verdict.padEnd(12)} ${String(r.status).padEnd(4)} ${e.id.padEnd(18)} ${e.url}${redirect}${r.error ? ` (${r.error})` : ''}`)
}
mkdirSync(new URL('../test-results/', import.meta.url), { recursive: true })
writeFileSync(new URL('../test-results/link-report.json', import.meta.url), JSON.stringify(results, null, 2))
const broken = results.filter((r) => r.verdict === 'broken')
console.log(`\n${results.length} links: ${results.filter((r) => r.verdict === 'ok').length} ok, ${broken.length} broken, ${results.filter((r) => r.verdict === 'inconclusive').length} inconclusive, ${results.filter((r) => r.verdict === 'unreachable').length} unreachable.`)
console.log('Report written to test-results/link-report.json')
process.exitCode = broken.length ? 1 : 0
