// Is the value head trustworthy? Run on held-out DanLM self-play games
// (the same ~5% of games export.ts puts in val), before using it anywhere.
//
// node --disable-warning=ExperimentalWarning --experimental-strip-types tools/train/value-check.ts \
//   ~/danlm-model-v4v/model.json ~/danlm-data/*-2026112[34]T*.jsonl.gz
//
// 1. One scale for both sides: when consecutive decisions in a hand belong to
//    opposite teams, V(next) should be about -V(this): correlation of V with
//    -V(next) and the mean of their sum. Also at one moment, the mover's V
//    against the next opponent's own view of the same position.
// 2. Better than guessing: V against how the hand really ended for the mover's
//    team (mean squared error against always guessing the mean, share of hands
//    where V picks the side that went out first), by stage of the hand.
import { readRecords, replay } from '../arena/replay.ts'
import { loadModel } from './model.ts'
import { stateFeatures } from '../../src/model-features.ts'

const [modelPath, ...files] = process.argv.slice(2)
const scorer = await loadModel(modelPath)
if (!scorer.hasValue) throw new Error(modelPath + ' has no value head')

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0
  return h
}
const corr = (x: number[], y: number[]) => {
  const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2 }
  return sxy / Math.sqrt(sxx * syy)
}
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length

const adjacent = {v: [] as number[], next: [] as number[]}
const moment = {mover: [] as number[], other: [] as number[]}
const stages = new Map<string, {pred: number[], outcome: number[]}>()
let hands = 0, positions = 0
for (const file of files) {
  for (const record of readRecords(file)) {
    if ((record as {bridge?: number}).bridge !== 2 || hash(record.game) % 20 !== 0) continue
    if (record.moves.some(m => (m as {teacher?: unknown}).teacher)) continue   // DanLM against DanLM only
    let previous: {v: number, team: number} | null = null
    replay(record, s => {
      const seat = s.turn, v = scorer.value(stateFeatures(s, seat))
      const outcome = (record.order[0] % 2 === seat % 2 ? 1 : -1) * record.gain
      const left = s.hands.reduce((n, h) => n + h.length, 0)
      const stage = left > 80 ? '81–108 cards left' : left > 50 ? '51–80 cards left' : left > 25 ? '26–50 cards left' : '≤25 cards left'
      const bucket = stages.get(stage) ?? {pred: [], outcome: []}
      bucket.pred.push(v); bucket.outcome.push(outcome); stages.set(stage, bucket)
      if (previous && previous.team !== seat % 2) { adjacent.v.push(previous.v); adjacent.next.push(v) }
      previous = {v, team: seat % 2}
      const opponent = (seat + 1) % 4
      if (s.hands[opponent].length) { moment.mover.push(v); moment.other.push(scorer.value(stateFeatures(s, opponent))) }
      positions++
    })
    hands++
  }
}
console.log(`${hands} held-out hands, ${positions} positions`)
const sums = adjacent.v.map((v, i) => v + adjacent.next[i])
console.log(`1. one scale: consecutive opposite-team decisions (${adjacent.v.length}): correlation of V with -V(next) ${corr(adjacent.v, adjacent.next.map(x => -x)).toFixed(3)},` +
  ` mean V + V(next) ${mean(sums).toFixed(3)}, mean |V| ${mean(adjacent.v.map(Math.abs)).toFixed(3)}`)
console.log(`   same moment, mover vs next opponent's own view: correlation with -V ${corr(moment.mover, moment.other.map(x => -x)).toFixed(3)},` +
  ` mean sum ${mean(moment.mover.map((v, i) => v + moment.other[i])).toFixed(3)}`)
const all = {pred: [] as number[], outcome: [] as number[]}
console.log('2. against the real outcome (mover\'s team):')
for (const stage of ['81–108 cards left', '51–80 cards left', '26–50 cards left', '≤25 cards left', 'all']) {
  const b = stage === 'all' ? all : stages.get(stage)
  if (!b || !b.pred.length) continue
  if (stage !== 'all') { all.pred.push(...b.pred); all.outcome.push(...b.outcome) }
  const m = mean(b.outcome)
  const mse = mean(b.pred.map((p, i) => (p - b.outcome[i]) ** 2)), base = mean(b.outcome.map(o => (o - m) ** 2))
  const right = mean(b.pred.map((p, i) => Number(Math.sign(p) === Math.sign(b.outcome[i]))))
  console.log(`   ${stage.padEnd(18)} ${String(b.pred.length).padStart(7)} positions: mse ${mse.toFixed(3)} vs guessing the mean ${base.toFixed(3)}` +
    ` (R2 ${(1 - mse / base).toFixed(3)}), picks the winning side ${(100 * right).toFixed(1)}%, correlation ${corr(b.pred, b.outcome).toFixed(3)}`)
}
