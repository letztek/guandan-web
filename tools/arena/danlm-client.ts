// Client side of danlm_host.py, shared by danlm.ts (duplicate play) and
// collect.ts (DanLM self-play data). See danlm_host.py for the protocol.
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import type { Match } from '../../src/match.ts'
import { allMoves, beats, interpret, ranks, type Move } from '../../src/rules.ts'
import { cardCode, declaredRank, rankCode } from './njupt.ts'

// DanLM names a run (straight, straight flush, three pairs, two triples) by its
// highest rank; the competition protocol in njupt.ts names it by the lowest.
const runLength: Record<string, number> = {straight: 5, flush: 5, pairs: 3, steel: 2}
export function danlmRank(move: Move, level: string) {
  const length = runLength[move.kind]
  return length ? rankCode(['A', ...ranks][move.value + length - 1]) : declaredRank(move, level)
}
// Bumped when the bridge changes in a way that affects collected data.
export const BRIDGE_VERSION = 2

export type HostOptions = {python?: string, danlm?: string, agent?: string, mock?: boolean}

export class DanlmHost {
  waiting: ((line: string) => void)[] = []
  proc
  constructor(o: HostOptions) {
    const script = fileURLToPath(new URL('./danlm_host.py', import.meta.url))
    this.proc = spawn(o.python ?? 'python3', o.mock ? [script, '--mock'] : [script, o.danlm!, o.agent ?? 'danlm_v1'],
      {env: {...process.env, PYTHONPATH: o.danlm ?? ''}})
    createInterface({input: this.proc.stdout}).on('line', line => this.waiting.shift()?.(line))
    this.proc.stderr.on('data', chunk => process.env.ARENA_BOT_LOG && process.stderr.write(chunk))
  }
  async send(msg: object): Promise<any> {
    const reply = await new Promise<string>((resolve, reject) => {
      this.waiting.push(resolve)
      this.proc.stdin.write(JSON.stringify(msg) + '\n', error => error && reject(error))
    })
    const parsed = JSON.parse(reply)
    if (parsed.error) throw new Error('DanLM host: ' + parsed.error)
    return parsed
  }
  close() { this.proc.stdin.end(); this.proc.kill() }
}

// DanLM names physical cards, a declared rank and whether it is a straight flush;
// find this game's declaration of the same cards. guessed: none matched (wild cards).
export function danlmMove(s: Match, seat: number, cards: string[], rank: string | null, flush?: boolean): {move: Move | null, guessed: boolean} {
  if (!cards.length) {
    if (!s.target) throw new Error('DanLM passed on a lead')
    return {move: null, guessed: false}
  }
  const pool = [...s.hands[seat]]
  const picked = cards.map(code => {
    const index = pool.findIndex(c => cardCode(c) === code)
    return index < 0 ? undefined : pool.splice(index, 1)[0]
  })
  if (!picked.every(Boolean)) throw new Error(`DanLM played ${cards.join(' ')}, which is not in this seat's hand`)
  const declared = allMoves(picked as Move['cards'], s.level, true).filter(m => beats(m, s.target))
    .find(m => danlmRank(m, s.level) === rank && (flush === undefined || (m.kind === 'flush') === flush))
  const move = declared ?? interpret(picked as Move['cards'], s.level, s.target)
  if (!move) throw new Error(`DanLM played ${cards.join(' ')}, which this game does not allow here`)
  return {move, guessed: !declared}
}
