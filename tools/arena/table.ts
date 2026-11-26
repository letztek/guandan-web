// One table of the arena: our seats play through src/match.ts bots, the other
// two seats are NJUPT-competition bots behind bot_host.py. playHand() runs one
// hand from its deal (tribute included) to the result and can record a trace.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { adviseTurn, botStep, exchangeOptions, giveCard, partner, takeTurn, teamOf, type Match } from '../../src/match.ts'
import type { Difficulty } from '../../src/difficulty.ts'
import { allMoves, beats, remaining, type Move } from '../../src/rules.ts'
import { cardCode, handCodes, legalActions, rankCode, toAction, type Action } from './njupt.ts'

export function parseArgs(argv: string[]) {
  return Object.fromEntries(argv.reduce<string[][]>((pairs, word, i, all) =>
    word.startsWith('--') ? [...pairs, [word.slice(2), all[i + 1]]] : pairs, [])) as Record<string, string | undefined>
}
// --model <path to model.json>: a trained move scorer plays our seats.
// --search candidates,horizon,worlds[,z[,maxCards]]: the model plus look-ahead (src/master-search.ts),
// with a fixed number of guessed worlds and no time limit, so runs are repeatable.
export const searchStats = {decisions: 0, searched: 0, changed: 0, ms: 0, maxMs: 0}
export async function policyFromArgs(args: Record<string, string | undefined>): Promise<Policy | undefined> {
  if (!args.model) return undefined
  const {loadModel} = await import('../train/model.ts')
  const scorer = await loadModel(args.model)
  if (!args.search) return s => scorer.choose(s).move
  const {searchMove} = await import('../../src/master-search.ts')
  const {publicTable, publicView} = await import('../../src/match.ts')
  const [candidates, horizon, worlds, z, maxCards] = args.search.split(',').map(Number)
  const options = {candidates, horizon, worlds, budgetMs: Infinity, ...(Number.isFinite(z) ? {z} : {}),
    ...(Number.isFinite(maxCards) ? {maxCards} : {})}
  return s => {
    const result = searchMove(publicView(s), publicTable(s, s.turn, true), scorer, options)
    searchStats.decisions++
    searchStats.searched += Number(result.searched)
    searchStats.changed += Number(result.changed)
    searchStats.ms += result.elapsedMs
    searchStats.maxMs = Math.max(searchStats.maxMs, result.elapsedMs)
    return result.move
  }
}
export function seeded(seed: number) {
  return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296)
}

export const passAction: Action = ['PASS', 'PASS', 'PASS']
const bombKinds = ['bomb', 'flush', 'kings']
export const isBomb = (move: Move | null) => !!move && bombKinds.includes(move.kind)

class Remote {
  proc: ChildProcessWithoutNullStreams
  waiting: ((line: string) => void)[] = []
  constructor(python: string, baselines: string, bot: string, seat: number) {
    const host = fileURLToPath(new URL('./bot_host.py', import.meta.url))
    this.proc = spawn(python, ['-I', host, baselines, bot, String(seat)], {cwd: process.env.ARENA_TMP ?? '/tmp'})
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

// One decision in the play phase, seen from the seat that made it.
export type Step = {seat: number, ours: boolean, size: number, action: Action, bomb: boolean,
  target: string | null, holder: 'partner' | 'opponent' | null, holderSeat: number, counts: number[],
  couldBeat: boolean, couldBeatWithoutBomb: boolean, finished: boolean, reason?: string}
export type HandRecord = {level: string, order: number[], gain: number, steps: Step[],
  rest: string[][], restBombs: number[], firstTeam: number}

// policy: when given, our seats play its choice instead of the game's bot (tribute stays with the bot).
export type Policy = (s: Match) => Move | null
export type TableOptions = {python?: string, baselines: string, bot: string, strength: Difficulty, ours: number, policy?: Policy}
export class Table {
  remotes: Map<number, Remote>
  ours: number
  strength: Difficulty
  policy?: Policy
  stats = {botErrors: 0, stateErrors: 0, ourMs: 0, ourDecisions: 0, sampleError: ''}
  constructor(o: TableOptions) {
    this.ours = o.ours
    this.strength = o.strength
    this.policy = o.policy
    const botSeats = [0, 1, 2, 3].filter(seat => teamOf(seat) !== o.ours)
    this.remotes = new Map(botSeats.map(seat => [seat, new Remote(o.python ?? 'python3', o.baselines, o.bot, seat)]))
  }
  close() { for (const remote of this.remotes.values()) remote.close() }

  async tell(msg: object) {
    for (const reply of await Promise.all([...this.remotes.values()].map(remote => remote.send(msg)))) {
      if (reply.stateError) {this.stats.stateErrors++; this.stats.sampleError ||= reply.stateError}
    }
  }
  ranksFor(s: Match, seat: number) {
    return {selfRank: rankCode(s.scores[teamOf(seat)]), oppoRank: rankCode(s.scores[1 - teamOf(seat)]), curRank: rankCode(s.level)}
  }
  async ask(s: Match, seat: number, stage: string, actions: Action[], cur: {pos: number, action: Action}) {
    const reply = await this.remotes.get(seat)!.send({type: 'act', stage, handCards: handCodes(s.hands[seat], s.level),
      publicInfo: s.hands.map(h => ({rest: h.length, playArea: null})), ...this.ranksFor(s, seat),
      curPos: cur.pos, curAction: cur.action,
      greaterPos: s.target ? s.holder : -1, greaterAction: s.target ? toAction(s.target, s.level) : passAction,
      actionList: actions, indexRange: actions.length - 1})
    if (typeof reply.index !== 'number') {
      this.stats.botErrors++
      this.stats.sampleError ||= reply.error ?? 'no index'
      return 0
    }
    return reply.index
  }

  // donors: the seats that resisted tribute, when this hand opens with 抗貢.
  async playHand(s: Match, donors: number[], trace = false): Promise<{s: Match, record: HandRecord}> {
    const start = s
    const steps: Step[] = []
    for (const seat of this.remotes.keys()) {
      await this.remotes.get(seat)!.send({type: 'notify', stage: 'beginning', handCards: handCodes(s.hands[seat], s.level),
        myPos: seat, ...this.ranksFor(s, seat)})
    }
    if (s.events.some(e => e.resistedTribute)) {
      await this.tell({type: 'notify', stage: 'anti-tribute', antiNums: donors.length, antiNum: donors.length, antiPos: donors})
    }
    while (s.phase === 'donate' || s.phase === 'return') {
      const seat = s.turn, phase = s.phase, before = s.events.length
      if (this.remotes.has(seat)) {
        const options = exchangeOptions(s)
        const stage = phase === 'donate' ? 'tribute' : 'back'
        const index = await this.ask(s, seat, stage, options.map(c => [stage, stage, [cardCode(c)]] as Action), {pos: -1, action: passAction})
        s = giveCard(s, seat, options[index] ?? options[0])
      } else s = botStep(s, this.strength)
      const revealed = s.events.slice(before).filter(e => e.reveal?.from !== undefined)
      if (revealed.length) {
        const result = revealed.map(e => [e.reveal!.from, e.reveal!.to, cardCode(e.reveal!.card)])
        await this.tell({type: 'notify', stage: phase === 'donate' ? 'tribute' : 'back', result})
      }
    }
    let cur = {pos: -1, action: passAction}
    while (s.phase === 'play') {
      const seat = s.turn, before = s
      const ours = !this.remotes.has(seat)
      let reason: string | undefined
      if (!ours) {
        const {options, actions} = legalActions(s.hands[seat], s.level, s.target)
        const index = await this.ask(s, seat, 'play', actions, cur)
        s = takeTurn(s, seat, options[index] ?? options[0])
      } else {
        const t = performance.now()
        // Same as botStep in the play phase, keeping the stated reason for the trace.
        if (this.policy) {
          s = takeTurn(s, seat, this.policy(s))
        } else {
          const advice = adviseTurn(s, this.strength)
          s = takeTurn(s, seat, advice.move)
          reason = advice.reason
        }
        this.stats.ourMs += performance.now() - t
        this.stats.ourDecisions++
      }
      const done = s.events.slice(before.events.length).find(e => e.seat === seat && (e.kind === 'play' || e.kind === 'pass'))
      const move: Move | null = done?.kind === 'play' ? done.move! : null
      cur = {pos: seat, action: toAction(move, s.level)}
      if (trace) {
        const legal = before.target ? allMoves(before.hands[seat], before.level).filter(m => beats(m, before.target)) : []
        steps.push({seat, ours, size: before.hands[seat].length, action: cur.action, bomb: isBomb(move),
          target: before.target ? toAction(before.target, before.level).slice(0, 2).join(' ') : null,
          holder: !before.target ? null : before.holder === partner(seat) ? 'partner' : 'opponent',
          holderSeat: before.target ? before.holder : -1,
          counts: before.hands.map(h => h.length), couldBeat: legal.length > 0,
          couldBeatWithoutBomb: legal.some(m => !isBomb(m)), finished: !!move && s.hands[seat].length === 0, ...(reason ? {reason} : {})})
      }
      const holder = s.target ? s.holder : before.holder, target = s.target ?? before.target
      await this.tell({type: 'notify', stage: 'play', curPos: seat, curAction: cur.action,
        greaterPos: holder, greaterAction: target ? toAction(target, s.level) : passAction})
    }
    const order = [...s.finish, ...[0, 1, 2, 3].filter(i => !s.finish.includes(i))]
    await this.tell({type: 'notify', stage: 'episodeOver', order, curRank: rankCode(start.level),
      restCards: [0, 1, 2, 3].map(i => [i, handCodes(s.hands[i], s.level)])})
    const restBombs = s.hands.map(h => countBombs(h, s.level))
    return {s, record: {level: start.level, order, gain: s.gain, steps, firstTeam: teamOf(order[0]),
      rest: s.hands.map(h => handCodes(h, s.level)), restBombs}}
  }
}

// Disjoint bombs a hand can still make, greedily from the biggest.
export function countBombs(hand: Match['hands'][number], level: string) {
  let rest = hand, n = 0
  while (true) {
    const bomb = allMoves(rest, level).filter(isBomb).sort((a, b) => b.cards.length - a.cards.length)[0]
    if (!bomb) return n
    rest = remaining(rest, bomb)
    n++
  }
}
