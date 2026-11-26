// Arena: this game's bots against NJUPT-competition baseline bots, refereed by
// this game's own engine (src/match.ts), whole games from level 2 to A.
//
// node --disable-warning=ExperimentalWarning --experimental-strip-types tools/arena/run.ts \
//   --baselines <DanLM>/baselines --bot njupt-guandan-ai --strength advanced --games 20 --seed 1
//
// Our team alternates between seats 0/2 and 1/3. One JSON line per game goes to --out.
import { appendFileSync } from 'node:fs'
import { nextHand, partner, shufflePack, startMatch } from '../../src/match.ts'
import type { Difficulty } from '../../src/difficulty.ts'
import { parseArgs, policyFromArgs, seeded, Table } from './table.ts'

const args = parseArgs(process.argv.slice(2))
const baselines = args.baselines
const botName = args.bot ?? 'njupt-guandan-ai'
const policy = await policyFromArgs(args)
const strength = (args.model ? 'model' : args.strength ?? 'advanced') as Difficulty
const games = Number(args.games ?? 10)
const firstGame = Number(args.from ?? 0)
if (!baselines) throw new Error('--baselines <path to DanLM/baselines> is required')

async function playGame(game: number) {
  const rng = seeded(1000003 * (game + 1) + Number(args.seed ?? 0))
  const ours = game % 2
  const table = new Table({python: args.python, baselines: baselines!, bot: botName, strength, ours, policy})
  const stats = {game, ours, bot: botName, strength, hands: 0, firsts: [0, 0], doubles: [0, 0], gains: [0, 0], winner: -1}
  let s = startMatch(shufflePack(rng), rng), donors: number[] = []
  try {
    while (true) {
      stats.hands++
      const played = await table.playHand(s, donors)
      s = played.s
      const {order, firstTeam} = played.record
      stats.firsts[firstTeam]++
      if (order[1] === partner(order[0])) stats.doubles[firstTeam]++
      stats.gains[firstTeam] += s.gain
      if (s.won) {stats.winner = firstTeam; break}
      if (stats.hands >= 80) break
      donors = order[1] === partner(order[0]) ? [order[2], order[3]] : [order[3]]
      s = nextHand(s, shufflePack(rng))
    }
  } finally {
    table.close()
  }
  return {...stats, ...table.stats}
}

const totals = {games: 0, wins: 0, hands: 0, firsts: 0, doubles: 0, oppDoubles: 0, botErrors: 0, stateErrors: 0, ms: 0, decisions: 0}
for (let game = firstGame; game < firstGame + games; game++) {
  const stats = await playGame(game)
  if (args.out) appendFileSync(args.out, JSON.stringify(stats) + '\n')
  totals.games++
  totals.wins += Number(stats.winner === stats.ours)
  totals.hands += stats.hands
  totals.firsts += stats.firsts[stats.ours]
  totals.doubles += stats.doubles[stats.ours]
  totals.oppDoubles += stats.doubles[1 - stats.ours]
  totals.botErrors += stats.botErrors
  totals.stateErrors += stats.stateErrors
  totals.ms += stats.ourMs
  totals.decisions += stats.ourDecisions
  console.log(`game ${game}: ${stats.winner === stats.ours ? 'WIN ' : stats.winner < 0 ? 'CAP ' : 'LOSS'} hands=${stats.hands}` +
    ` firsts ${stats.firsts[stats.ours]}-${stats.firsts[1 - stats.ours]} botErr=${stats.botErrors} stateErr=${stats.stateErrors}` +
    (stats.sampleError ? ' | ' + stats.sampleError.split('\n').slice(-2).join(' ') : ''))
}
console.log(JSON.stringify({...totals, gameWinRate: totals.wins / totals.games, handFirstRate: totals.firsts / totals.hands,
  msPerDecision: Math.round(totals.ms / Math.max(1, totals.decisions))}))
