// DanLM self-play data for training our own model. All four seats are DanLM
// (danlm_host.py); this game's engine referees whole games from 2 to A, with
// tribute and return chosen by this game's heuristic. Needs an Apple Silicon Mac.
//
// node --disable-warning=ExperimentalWarning --experimental-strip-types tools/arena/collect.ts \
//   --danlm ~/DanLM --python ~/danlm-venv/bin/python --out-dir ~/danlm-data --worker 0 --hours 9 [--model model.json]
//
// Output: <out-dir>/w<worker>-<run>-<shard>.jsonl.gz, one JSON line per hand:
//   bridge                               danlm-client BRIDGE_VERSION (absent in data from before version 2)
//   game, hand, level, scores, owner     the hand's level and both teams' levels when it was dealt
//   dealt[4]                             hands as dealt, before tribute (card codes, see njupt.ts)
//   resisted                             true when the hand opened with 抗貢
//   exchange[]                           [from, to, card, 'tribute' | 'back'] in the order revealed
//   first                                the seat that leads the hand
//   moves[]                              every play in order:
//     seat, cards (codes, [] = pass), kind/value/label (this game's declaration),
//     teacher: {cards, rank, flush}  with --model, on the model's seats: what DanLM would have played,
//     q: [[type, rank, "cards", value], ...]  DanLM's values for its best candidates
//        (this game's engine replays every state from dealt + exchange + moves),
//     legal: DanLM's number of legal plays, agrees: DanLM's play is its best value
//   order, gain, won                     finish order (all four seats), levels gained, match won
// A shard is written whole every --shard hands, so an interrupted run loses at most one shard.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { botStep, nextHand, partner, shufflePack, startMatch, takeTurn, type Match } from '../../src/match.ts'
import { declaredRank, handCodes, cardCode, rankCode } from './njupt.ts'
import { parseArgs, seeded } from './table.ts'
import { BRIDGE_VERSION, DanlmHost, danlmMove, danlmRank } from './danlm-client.ts'
import type { Move } from '../../src/rules.ts'

const args = parseArgs(process.argv.slice(2))
const mock = process.argv.includes('--mock')
if (!mock && !args.danlm) throw new Error('--danlm <path to the DanLM checkout> is required (or --mock)')
const worker = Number(args.worker ?? 0)
const hours = Number(args.hours ?? 9)
const maxGames = Number(args.games ?? Infinity)
const shardSize = Number(args.shard ?? 200)
const top = Number(args.top ?? 64)
const outDir = args['out-dir'] ?? 'danlm-data'
const run = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
mkdirSync(outDir, {recursive: true})
// DAgger: with --model, one team (alternating by game) plays the model's choices
// while DanLM still labels every decision, so the data covers positions the
// model itself reaches. Each model move records DanLM's own pick as `teacher`.
let modelChoice: ((s: Match) => Move | null) | undefined
if (args.model) {
  const {loadModel} = await import('../train/model.ts')
  const scorer = await loadModel(args.model)
  modelChoice = s => scorer.choose(s).move
}

const deadline = Date.now() + hours * 3600_000
let shard: string[] = [], shardNo = 0
function flush() {
  if (!shard.length) return
  const file = join(outDir, `w${worker}-${run}-${String(shardNo++).padStart(4, '0')}.jsonl.gz`)
  writeFileSync(file, gzipSync(shard.join('\n') + '\n'))
  shard = []
}

const totals = {games: 0, hands: 0, decisions: 0, skippedGames: 0, guessed: 0, agrees: 0, scored: 0, modelMoves: 0, modelAgrees: 0}
async function playGame(host: DanlmHost, game: number) {
  const seed = (worker * 1_000_003 + game * 7919 + Date.now()) >>> 0
  const rng = seeded(seed)
  let s = startMatch(shufflePack(rng), rng)
  let records: string[] = []
  while (true) {
    const dealt = s.hands.map(h => handCodes(h, s.level))
    const scores = [...s.scores], owner = s.owner, handNo = s.handNo
    const resisted = s.events.some(e => e.resistedTribute)
    const exchange: [number, number, string, string][] = []
    while (s.phase === 'donate' || s.phase === 'return') {
      const phase = s.phase, before = s.events.length
      s = botStep(s, 'standard')
      for (const e of s.events.slice(before)) if (e.reveal?.from !== undefined) {
        exchange.push([e.reveal.from, e.reveal.to, cardCode(e.reveal.card), phase === 'donate' ? 'tribute' : 'back'])
      }
    }
    const level = s.level, first = s.turn
    const opened = await host.send({op: 'start', hands: s.hands.map(h => handCodes(h, level)), level: rankCode(level),
      first, levels: s.scores.map(rankCode)})
    if (!mock && opened.player !== first) throw new Error(`first player differs: DanLM ${opened.player}, referee ${first}`)
    const moves: object[] = []
    while (s.phase === 'play') {
      const seat = s.turn
      const reply = await host.send({op: 'act', seat, top, lead: !s.target})
      const modelSeat = modelChoice && seat % 2 === game % 2
      let move: Move | null
      if (modelSeat) {
        move = modelChoice!(s)
        totals.modelMoves++
        const codes = (move ? move.cards.map(cardCode) : []).sort().join()
        totals.modelAgrees += Number(codes === [...reply.cards].sort().join())
      } else {
        const mapped = danlmMove(s, seat, reply.cards, reply.rank, reply.flush)
        move = mapped.move
        if (mapped.guessed) totals.guessed++
      }
      s = takeTurn(s, seat, move)
      const step = await host.send({op: 'step', seat, cards: move ? move.cards.map(cardCode) : [], rank: move ? danlmRank(move, level) : null, flush: move?.kind === 'flush'})
      if (step.guessed) totals.guessed++
      if (!mock && s.phase === 'play' && step.player !== s.turn) throw new Error(`turn differs: DanLM ${step.player}, referee ${s.turn}`)
      totals.decisions++
      if (reply.q) {totals.scored++; totals.agrees += Number(reply.argmaxAgrees)}
      moves.push({seat, cards: move ? move.cards.map(cardCode) : [], ...(move ? {kind: move.kind, value: move.value, label: move.label} : {}),
        ...(modelSeat ? {teacher: {cards: reply.cards, rank: reply.rank, flush: reply.flush}} : {}),
        ...(reply.q && reply.legal > 1 ? {q: reply.q, legal: reply.legal, agrees: reply.argmaxAgrees} : {})})
    }
    const order = [...s.finish, ...[0, 1, 2, 3].filter(i => !s.finish.includes(i))]
    records.push(JSON.stringify({bridge: BRIDGE_VERSION, game: `${worker}-${run}-${game}`, seed, hand: handNo, level, scores, owner,
      dealt, resisted, exchange, first, moves, order, gain: s.gain, won: s.won}))
    totals.hands++
    if (s.won || s.handNo >= 80) break
    s = nextHand(s, shufflePack(rng))
  }
  // Keep a game's hands together; a game cut short by an error is dropped whole.
  shard.push(...records)
  if (shard.length >= shardSize) flush()
}

const host = new DanlmHost({python: args.python, danlm: args.danlm, agent: args.agent, mock})
const started = Date.now()
try {
  for (let game = 0; game < maxGames && Date.now() < deadline; game++) {
    try {
      await playGame(host, game)
      totals.games++
    } catch (error) {
      totals.skippedGames++
      console.log(`game ${game}: dropped, ${(error as Error).message}`)
    }
    const minutes = (Date.now() - started) / 60000
    console.log(`[w${worker}] ${minutes.toFixed(1)} min: ${totals.games} games, ${totals.hands} hands, ${totals.decisions} decisions` +
      ` (${Math.round(totals.decisions / Math.max(minutes, 1e-9))}/min), dropped ${totals.skippedGames}, guessed ${totals.guessed}` +
      (totals.scored ? `, best-Q agreement ${(100 * totals.agrees / totals.scored).toFixed(1)}%` : '') +
      (totals.modelMoves ? `, model = DanLM in ${(100 * totals.modelAgrees / totals.modelMoves).toFixed(1)}% of its moves` : ''))
  }
} finally {
  flush()
  host.close()
}
