// Turn collect.ts output into training arrays for train.py.
//
// node --disable-warning=ExperimentalWarning --experimental-strip-types tools/train/export.ts \
//   --out ~/danlm-train ~/danlm-data/*.jsonl.gz
//
// For every DanLM decision with values, DanLM's candidates are mapped to this
// game's declarations and encoded with features.ts. Candidates the features
// cannot tell apart are merged, keeping the higher value. Writes <out>/train
// and <out>/val (about 5% of games, chosen by game id), each with:
//   states.u8   [N, STATE_DIM]    the position, one row per decision
//   actions.u8  [M, ACTION_DIM]   candidate plays, grouped by decision
//   q.f32       [M]               DanLM's value for each candidate
//   offsets.i32 [N + 1]           decision i owns actions offsets[i] .. offsets[i+1]
//   chosen.i32  [N]               index within the group of the play DanLM made
//   meta.json                     sizes, feature version and scales
import { closeSync, mkdirSync, openSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import type { Match } from '../../src/match.ts'
import type { Move } from '../../src/rules.ts'
import { readRecords, replay, type HandRecord } from '../arena/replay.ts'
import { rankCode } from '../arena/njupt.ts'
import { danlmMove } from '../arena/danlm-client.ts'
import { parseArgs } from '../arena/table.ts'
import { ACTION_DIM, ACTION_SCALE, FEATURE_VERSION, STATE_DIM, STATE_SCALE, actionFeatures, actionKey, stateFeatures } from './features.ts'

const args = parseArgs(process.argv.slice(2))
const files = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'))
const out = args.out ?? 'danlm-train'

class Split {
  dir: string
  fds: Record<string, number>
  n = 0
  m = 0
  constructor(name: string) {
    this.dir = join(out, name)
    mkdirSync(this.dir, {recursive: true})
    this.fds = Object.fromEntries(['states.u8', 'actions.u8', 'q.f32', 'offsets.i32', 'chosen.i32']
      .map(file => [file, openSync(join(this.dir, file), 'w')]))
    writeSync(this.fds['offsets.i32'], new Uint8Array(Int32Array.of(0).buffer))
  }
  add(state: Uint8Array, actions: Uint8Array[], q: number[], chosen: number) {
    writeSync(this.fds['states.u8'], state)
    const flat = new Uint8Array(actions.length * ACTION_DIM)
    actions.forEach((a, i) => flat.set(a, i * ACTION_DIM))
    writeSync(this.fds['actions.u8'], flat)
    writeSync(this.fds['q.f32'], new Uint8Array(Float32Array.from(q).buffer))
    this.m += actions.length
    this.n++
    writeSync(this.fds['offsets.i32'], new Uint8Array(Int32Array.of(this.m).buffer))
    writeSync(this.fds['chosen.i32'], new Uint8Array(Int32Array.of(chosen).buffer))
  }
  close() {
    for (const fd of Object.values(this.fds)) closeSync(fd)
    writeFileSync(join(this.dir, 'meta.json'), JSON.stringify({version: FEATURE_VERSION, decisions: this.n, actions: this.m,
      stateDim: STATE_DIM, actionDim: ACTION_DIM, stateScale: STATE_SCALE, actionScale: ACTION_SCALE}, null, 1))
  }
}

// Stable small hash, so a game always lands in the same split.
function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0
  return h
}

const train = new Split('train'), val = new Split('val')
const stats = {hands: 0, failedHands: 0, oldBridgeSkipped: 0, decisions: 0, unmapped: 0, chosenMissing: 0, merged: 0}

// Before bridge version 2, DanLM and this game could read a run built with a
// wild card differently (straight vs straight flush), so the two engines may
// have disagreed about the table from that play on. Such hands are left out.
const runKinds = ['straight', 'flush', 'pairs', 'steel']
function divergedBeforeFix(record: HandRecord & {bridge?: number}) {
  if ((record.bridge ?? 1) >= 2) return false
  const wildCode = 'H' + rankCode(record.level)
  return record.moves.some(m => m.kind && runKinds.includes(m.kind) && m.cards.includes(wildCode))
}
function decision(split: Split, s: Match, move: Move | null, q: [string, string, string, number][]) {
  const groups = new Map<string, {features: Uint8Array, value: number}>()
  for (const [type, rank, cardText, value] of q) {
    const cards = cardText.match(/../g) ?? []
    let candidate: Move | null
    try {
      candidate = danlmMove(s, s.turn, cards, rank, /flush/i.test(type)).move
    } catch {
      stats.unmapped++
      continue
    }
    const key = actionKey(s, candidate)
    const known = groups.get(key)
    if (known) {stats.merged++; known.value = Math.max(known.value, value)} else groups.set(key, {features: actionFeatures(s, candidate), value})
  }
  const chosenKey = actionKey(s, move)
  const keys = [...groups.keys()]
  const chosen = keys.indexOf(chosenKey)
  if (chosen < 0) {stats.chosenMissing++; return}
  split.add(stateFeatures(s), keys.map(k => groups.get(k)!.features), keys.map(k => groups.get(k)!.value), chosen)
  stats.decisions++
}

for (const file of files) {
  for (const record of readRecords(file)) {
    if (divergedBeforeFix(record)) {stats.oldBridgeSkipped++; continue}
    const split = hash(record.game) % 20 === 0 ? val : train
    try {
      replay(record, (s, index, move) => {
        const q = record.moves[index].q
        if (q && q.length > 1) decision(split, s, move, q)
      })
      stats.hands++
    } catch (error) {
      stats.failedHands++
      if (stats.failedHands <= 5) console.log(`${file} ${record.game} hand ${record.hand}: ${(error as Error).message}`)
    }
  }
  console.log(`${file}: ${JSON.stringify(stats)}`)
}
train.close()
val.close()
console.log(`train ${train.n} decisions / ${train.m} candidates, val ${val.n} / ${val.m}; state ${STATE_DIM}, action ${ACTION_DIM}`)
