// bench.html: time 大師's move model on this device, through the same worker
// the game uses, and check its choices against values computed in Node.
import { askMaster, masterModelUrls } from './master-client'
import { benchPlay, type BenchDecision } from './bench-play'
import { assetPath } from './assets'

const out = document.querySelector<HTMLPreElement>('#result')!
const status = document.querySelector<HTMLParagraphElement>('#status')!
const button = document.querySelector<HTMLButtonElement>('#run')!

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}
const ms = (v: number) => v.toFixed(1) + ' ms'

async function run() {
  button.disabled = true
  out.textContent = ''
  const expected: BenchDecision[] = await fetch(assetPath('model/bench-expected.json')).then(r => r.json())
  const model = masterModelUrls('bench')
  const sizeBytes = Number((await fetch(model.bin, {method: 'HEAD'})).headers.get('content-length')) || 0
  const roundTrips: number[] = [], infer: number[] = []
  let loadMs = 0, first = 0, fallbacks = 0, matched = 0, worstQ = 0, index = 0
  const started = performance.now()
  const got = await benchPlay(async input => {
    const t = performance.now()
    const reply = await askMaster(input, model)
    const elapsed = performance.now() - t
    if (reply.loadMs !== undefined) {loadMs = reply.loadMs; first = elapsed}
    else roundTrips.push(elapsed)
    infer.push(reply.inferMs)
    if (reply.fallback) fallbacks++
    return {move: reply.advice.move, q: reply.q ?? NaN}
  }, d => {
    const e = expected[index++]
    if (e && e.key === d.key) matched++
    if (e) worstQ = Math.max(worstQ, Math.abs(e.q - d.q))
    status.textContent = `${index} / ${expected.length}`
  })
  const total = performance.now() - started
  const lines = [
    `device: ${navigator.userAgent}`,
    `cores: ${navigator.hardwareConcurrency ?? '?'}  memory: ${(navigator as {deviceMemory?: number}).deviceMemory ?? '?'} GB`,
    `model: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB (float16, same size as the real 大師 model)`,
    `first decision incl. download + decode: ${ms(first)} (load ${ms(loadMs)})`,
    `decisions: ${got.length}, total ${ms(total)}`,
    `per decision, worker round trip: median ${ms(percentile(roundTrips, .5))}, p90 ${ms(percentile(roundTrips, .9))}, max ${ms(Math.max(...roundTrips))}`,
    `per decision, inside the worker: median ${ms(percentile(infer, .5))}, p90 ${ms(percentile(infer, .9))}, max ${ms(Math.max(...infer))}`,
    `matches Node: ${matched} / ${expected.length} choices, largest value difference ${worstQ.toExponential(1)}` +
      (got.length !== expected.length ? `  (played ${got.length} decisions, expected ${expected.length})` : ''),
    `fallbacks to the rules player: ${fallbacks}`,
  ]
  out.textContent = lines.join('\n')
  status.textContent = matched === expected.length && got.length === expected.length && !fallbacks ? 'OK' : 'MISMATCH — please send the result'
  button.disabled = false
}
button.addEventListener('click', () => { run().catch(error => { status.textContent = 'Error: ' + (error as Error).message; button.disabled = false }) })
