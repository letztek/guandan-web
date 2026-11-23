// Arena: this game's bots against NJUPT-competition baseline bots, refereed by
// this game's own engine (src/match.ts), whole games from level 2 to A.
//
// node --disable-warning=ExperimentalWarning --experimental-strip-types tools/arena/run.ts \
//   --baselines <DanLM>/baselines --bot njupt-guandan-ai --strength advanced --games 20 --seed 1
//
// Our team alternates between seats 0/2 and 1/3. One JSON line per game goes to --out.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { botStep, exchangeOptions, giveCard, nextHand, partner, shufflePack, startMatch, takeTurn, teamOf, type Match } from '../../src/match.ts'
import type { Difficulty } from '../../src/difficulty.ts'
import type { Move } from '../../src/rules.ts'
import { cardCode, handCodes, legalActions, rankCode, toAction, type Action } from './njupt.ts'

const args = Object.fromEntries(process.argv.slice(2).reduce<string[][]>((pairs, word, i, all) =>
  word.startsWith('--') ? [...pairs, [word.slice(2), all[i + 1]]] : pairs, []))
const baselines = args.baselines
const botName = args.bot ?? 'njupt-guandan-ai'
const strength = (args.strength ?? 'advanced') as Difficulty
const games = Number(args.games ?? 10)
const firstGame = Number(args.from ?? 0)
const out = args.out
const python = args.python ?? 'python3'
if (!baselines) throw new Error('--baselines <path to DanLM/baselines> is required')

function seeded(seed: number) {
  return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296)
}

class Remote {
  proc: ChildProcessWithoutNullStreams
  waiting: ((line: string) => void)[] = []
  constructor(seat: number) {
    const host = fileURLToPath(new URL('./bot_host.py', import.meta.url))
    this.proc = spawn(python, ['-I', host, baselines, botName, String(seat)], {cwd: process.env.ARENA_TMP ?? '/tmp'})
    createInterface({input: this.proc.stdout}).on('line', line => this.waiting.shift()?.(line))
    if (process.env.ARENA_BOT_LOG) this.proc.stderr.pipe(process.stderr)
    else this.proc.stderr.resume()
  }
  send(msg: object): Promise<{index?: number|null, error?: string, stateError?: string}> {
    return new Promise((resolve, reject) => {
      this.waiting.push(line => resolve(JSON.parse(line)))
      this.proc.stdin.write(JSON.stringify(msg) + '\n', error => error && reject(error))
    })
  }
  close() { this.proc.stdin.end(); this.proc.kill() }
}

const passAction: Action = ['PASS', 'PASS', 'PASS']

async function playGame(game: number) {
  const rng = seeded(1000003 * (game + 1) + Number(args.seed ?? 0))
  const ours = game % 2
  const botSeats = [0, 1, 2, 3].filter(seat => teamOf(seat) !== ours)
  const remotes = new Map(botSeats.map(seat => [seat, new Remote(seat)]))
  const stats = {game, ours, bot: botName, strength, hands: 0, firsts: [0, 0], doubles: [0, 0], gains: [0, 0],
    winner: -1, botErrors: 0, stateErrors: 0, ourMs: 0, ourDecisions: 0, sampleError: ''}
  async function tell(msg: object) {
    for (const reply of await Promise.all([...remotes.values()].map(remote => remote.send(msg)))) {
      if (reply.stateError) {stats.stateErrors++; stats.sampleError ||= reply.stateError}
    }
  }
  function publicInfo(s: Match) { return s.hands.map(h => ({rest: h.length, playArea: null})) }
  function ranksFor(s: Match, seat: number) {
    return {selfRank: rankCode(s.scores[teamOf(seat)]), oppoRank: rankCode(s.scores[1 - teamOf(seat)]), curRank: rankCode(s.level)}
  }
  async function ask(s: Match, seat: number, stage: string, actions: Action[], cur: {pos: number, action: Action}) {
    const reply = await remotes.get(seat)!.send({type: 'act', stage, handCards: handCodes(s.hands[seat], s.level),
      publicInfo: publicInfo(s), ...ranksFor(s, seat), curPos: cur.pos, curAction: cur.action,
      greaterPos: s.target ? s.holder : -1, greaterAction: s.target ? toAction(s.target, s.level) : passAction,
      actionList: actions, indexRange: actions.length - 1})
    if (typeof reply.index !== 'number') {
      stats.botErrors++
      stats.sampleError ||= reply.error ?? 'no index'
      return 0
    }
    return reply.index
  }

  let s = startMatch(shufflePack(rng), rng)
  try {
    while (true) {
      stats.hands++
      const start = s
      for (const seat of botSeats) {
        await remotes.get(seat)!.send({type: 'notify', stage: 'beginning', handCards: handCodes(s.hands[seat], s.level),
          myPos: seat, ...ranksFor(s, seat)})
      }
      if (s.events.some(e => e.resistedTribute)) {
        const donors = s.handNo > 1 ? previousDonors : []
        await tell({type: 'notify', stage: 'anti-tribute', antiNums: donors.length, antiNum: donors.length, antiPos: donors})
      }
      while (s.phase === 'donate' || s.phase === 'return') {
        const seat = s.turn, phase = s.phase, before = s.events.length
        if (remotes.has(seat)) {
          const options = exchangeOptions(s)
          const stage = phase === 'donate' ? 'tribute' : 'back'
          const index = await ask(s, seat, stage, options.map(c => [stage, stage, [cardCode(c)]] as Action), {pos: -1, action: passAction})
          s = giveCard(s, seat, options[index] ?? options[0])
        } else s = botStep(s, strength)
        const revealed = s.events.slice(before).filter(e => e.reveal?.from !== undefined)
        if (revealed.length) {
          const result = revealed.map(e => [e.reveal!.from, e.reveal!.to, cardCode(e.reveal!.card)])
          await tell({type: 'notify', stage: phase === 'donate' ? 'tribute' : 'back', result})
        }
      }
      let cur = {pos: -1, action: passAction}
      while (s.phase === 'play') {
        const seat = s.turn, before = s
        if (remotes.has(seat)) {
          const {options, actions} = legalActions(s.hands[seat], s.level, s.target)
          const index = await ask(s, seat, 'play', actions, cur)
          s = takeTurn(s, seat, options[index] ?? options[0])
        } else {
          const t = performance.now()
          s = botStep(s, strength)
          stats.ourMs += performance.now() - t
          stats.ourDecisions++
        }
        const done = s.events.slice(before.events.length).find(e => e.seat === seat && (e.kind === 'play' || e.kind === 'pass'))
        const move: Move | null = done?.kind === 'play' ? done.move! : null
        cur = {pos: seat, action: toAction(move, s.level)}
        const holder = s.target ? s.holder : before.holder, target = s.target ?? before.target
        await tell({type: 'notify', stage: 'play', curPos: seat, curAction: cur.action,
          greaterPos: holder, greaterAction: target ? toAction(target, s.level) : passAction})
      }
      // Hand over: settle() filled s.finish; rest of the order for the bots.
      const order = [...s.finish, ...[0, 1, 2, 3].filter(i => !s.finish.includes(i))]
      const winTeam = teamOf(order[0])
      stats.firsts[winTeam]++
      if (order[1] === partner(order[0])) stats.doubles[winTeam]++
      stats.gains[winTeam] += s.gain
      await tell({type: 'notify', stage: 'episodeOver', order, curRank: rankCode(start.level),
        restCards: [0, 1, 2, 3].map(i => [i, handCodes(s.hands[i], s.level)])})
      if (s.won) {stats.winner = winTeam; break}
      if (stats.hands >= 80) break
      previousDonors = order[1] === partner(order[0]) ? [order[2], order[3]] : [order[3]]
      s = nextHand(s, shufflePack(rng))
    }
  } finally {
    for (const remote of remotes.values()) remote.close()
  }
  return stats
}
let previousDonors: number[] = []

const totals = {games: 0, wins: 0, hands: 0, firsts: 0, doubles: 0, oppDoubles: 0, botErrors: 0, stateErrors: 0, ms: 0, decisions: 0}
for (let game = firstGame; game < firstGame + games; game++) {
  previousDonors = []
  const stats = await playGame(game)
  const line = JSON.stringify(stats)
  if (out) appendFileSync(out, line + '\n')
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
