// Duplicate play against DanLM itself: same format as duplicate.ts (one
// hand at a random level, no tribute, each deal played twice with the cards
// swapped), our engine as referee, both opponent seats played by DanLM through
// danlm_host.py. Needs an Apple Silicon Mac; see the arena README.
//
// node --disable-warning=ExperimentalWarning --experimental-strip-types tools/arena/danlm.ts \
//   --danlm ~/DanLM --deals 100 --out danlm.jsonl [--agent danlm_v1] [--python python3.12] [--mock]
import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { botStep, partner, shufflePack, startMatch, takeTurn, teamOf, type Match } from '../../src/match.ts'
import { allMoves, beats, interpret, ranks, type Move } from '../../src/rules.ts'
import type { Difficulty } from '../../src/difficulty.ts'
import { declaredRank, handCodes, rankCode, toAction, cardCode } from './njupt.ts'
import { countBombs, isBomb, parseArgs, seeded, type Step } from './table.ts'

const args = parseArgs(process.argv.slice(2))
const mock = process.argv.includes('--mock')
if (!mock && !args.danlm) throw new Error('--danlm <path to the DanLM checkout> is required (or --mock)')
const strength = (args.strength ?? 'advanced') as Difficulty
const deals = Number(args.deals ?? 20), from = Number(args.from ?? 0)

class Host {
  waiting: ((line: string) => void)[] = []
  proc = spawn(args.python ?? 'python3', mock
    ? [fileURLToPath(new URL('./danlm_host.py', import.meta.url)), '--mock']
    : [fileURLToPath(new URL('./danlm_host.py', import.meta.url)), args.danlm!, args.agent ?? 'danlm_v1'],
    {env: {...process.env, PYTHONPATH: args.danlm ?? ''}})
  constructor() {
    createInterface({input: this.proc.stdout}).on('line', line => this.waiting.shift()?.(line))
    this.proc.stderr.on('data', chunk => process.env.ARENA_BOT_LOG && process.stderr.write(chunk))
  }
  async send(msg: object): Promise<any> {
    const reply = await new Promise<string>(resolve => {
      this.waiting.push(resolve)
      this.proc.stdin.write(JSON.stringify(msg) + '\n')
    })
    const parsed = JSON.parse(reply)
    if (parsed.error) throw new Error('DanLM host: ' + parsed.error)
    return parsed
  }
  close() { this.proc.stdin.end(); this.proc.kill() }
}

function dealFor(deal: number): Match {
  const rng = seeded(7919 * (deal + 1) + Number(args.seed ?? 0))
  const level = ranks[Math.floor(rng() * ranks.length)]
  const s = startMatch(shufflePack(rng), rng)
  return {...s, level, scores: [level, level], owner: 0}
}

async function playHand(host: Host, start: Match, ours: number) {
  let s = structuredClone(start)
  const steps: Step[] = []
  const first = await host.send({op: 'start', hands: s.hands.map(h => handCodes(h, s.level)), level: rankCode(s.level), first: s.turn})
  if (!mock && first.player !== s.turn) throw new Error(`first player differs: DanLM ${first.player}, referee ${s.turn}`)
  while (s.phase === 'play') {
    const seat = s.turn, before = s
    if (teamOf(seat) === ours) s = botStep(s, strength)
    else {
      const {cards} = await host.send({op: 'act', seat})
      // DanLM names physical cards; our engine decides how they declare.
      const pool = [...s.hands[seat]]
      const picked = (cards as string[]).map(code => pool.splice(pool.findIndex(c => cardCode(c) === code), 1)[0])
      const move = cards.length && picked.every(Boolean) ? interpret(picked, s.level, s.target) : null
      if (cards.length && !move) throw new Error(`DanLM played ${cards.join(' ')}, which this game does not allow here`)
      if (!cards.length && !s.target) throw new Error('DanLM passed on a lead')
      s = takeTurn(s, seat, move)
    }
    const done = s.events.slice(before.events.length).find(e => e.seat === seat && (e.kind === 'play' || e.kind === 'pass'))
    const move: Move | null = done?.kind === 'play' ? done.move! : null
    const legal = before.target ? allMoves(before.hands[seat], before.level).filter(m => beats(m, before.target)) : []
    steps.push({seat, ours: teamOf(seat) === ours, size: before.hands[seat].length, action: toAction(move, s.level), bomb: isBomb(move),
      target: before.target ? toAction(before.target, before.level).slice(0, 2).join(' ') : null,
      holder: !before.target ? null : before.holder === partner(seat) ? 'partner' : 'opponent',
      holderSeat: before.target ? before.holder : -1, counts: before.hands.map(h => h.length),
      couldBeat: legal.length > 0, couldBeatWithoutBomb: legal.some(m => !isBomb(m)), finished: !!move && s.hands[seat].length === 0})
    const result = await host.send({op: 'step', seat, cards: move ? move.cards.map(cardCode) : [],
      rank: move ? declaredRank(move, s.level) : null})
    if (!mock && s.phase === 'play' && result.player !== s.turn) throw new Error(`turn differs: DanLM ${result.player}, referee ${s.turn}`)
  }
  const order = [...s.finish, ...[0, 1, 2, 3].filter(i => !s.finish.includes(i))]
  return {level: start.level, order, gain: s.gain, steps, firstTeam: teamOf(order[0]),
    rest: s.hands.map(h => handCodes(h, s.level)), restBombs: s.hands.map(h => countBombs(h, s.level))}
}

const host = new Host()
let total = 0, played = 0, aborted = 0
try {
  for (let deal = from; deal < from + deals; deal++) {
    const start = dealFor(deal)
    const runs = []
    try {
      for (const ours of [0, 1]) {
        const record = await playHand(host, start, ours)
        runs.push({deal, bot: mock ? 'mock' : 'danlm:' + (args.agent ?? 'danlm_v1'), strength, ours,
          ourScore: (record.firstTeam === ours ? 1 : -1) * record.gain, ...record})
      }
    } catch (error) {
      aborted++
      console.log(`deal ${deal}: skipped, ${(error as Error).message}`)
      continue
    }
    for (const run of runs) if (args.out) appendFileSync(args.out, JSON.stringify(run) + '\n')
    const score = runs[0].ourScore + runs[1].ourScore
    total += score; played++
    console.log(`deal ${deal} level ${start.level}: duplicate ${score >= 0 ? '+' : ''}${score}  (running ${(total / played).toFixed(2)} per deal, ${aborted} skipped)`)
  }
} finally {
  host.close()
}
