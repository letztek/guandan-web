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
// DanLM's play types (danzero.engine.actions) for this game's kinds. The rank alone
// is not enough: two wild cards let the same cards be a 5-card bomb or a full house
// (S4 C4 D4 H5 H5 at level 5), or two triples or three pairs (C4 H4 C5 S5 H5 H5),
// with the same rank either way.
const danlmTypes: Record<string, string> = {single: 'single', pair: 'double', triple: 'triple', full: 'fullhouse',
  straight: 'straight', pairs: 'tube', steel: 'plate', bomb: 'normalbomb', flush: 'flushbomb', kings: 'jokerbomb'}
export const danlmType = (move: Move) => danlmTypes[move.kind]
// Bumped when the bridge changes in a way that affects collected data.
// 3: plays cross the bridge with their type, not just rank and the straight-flush flag.
export const BRIDGE_VERSION = 3

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

// A play as DanLM names it: physical cards, declared rank and play type. Data from
// before bridge version 3 has no type, only whether the play is a straight flush.
export type DanlmPlay = {cards: string[], rank: string | null, type?: string | null, flush?: boolean}

// Four kings are one play whatever rank DanLM's encoding carries for them.
const rankMatches = (move: Move, level: string, rank: string | null) => move.kind === 'kings' || danlmRank(move, level) === rank

// Find this game's declaration of the cards DanLM played. guessed: none has DanLM's
// type and rank, so the two engines may read the play differently.
export function danlmMove(s: Match, seat: number, play: DanlmPlay): {move: Move | null, guessed: boolean} {
  const {cards, rank, type, flush} = play
  if (!cards.length) {
    if (!s.target) throw new Error('DanLM passed on a lead')
    return {move: null, guessed: false}
  }
  const pool = [...s.hands[seat]]
  const picked = cards.map(code => {
    const index = pool.findIndex(c => cardCode(c) === code)
    return index < 0 ? undefined : pool.splice(index, 1)[0]
  }) as Move['cards']
  if (!picked.every(Boolean)) throw new Error(`DanLM played ${cards.join(' ')}, which is not in this seat's hand`)
  const sameType = allMoves(picked, s.level, true).filter(m => beats(m, s.target) &&
    (type ? danlmType(m) === type : flush === undefined || (m.kind === 'flush') === flush))
  // Declarations with the same type and rank differ only in what a full house's
  // wild pair stands for; prefer the one that keeps wild cards as themselves.
  const declared = sameType.filter(m => rankMatches(m, s.level, rank))
    .sort((a, b) => Object.keys(a.as).length - Object.keys(b.as).length)[0]
  const move = declared ?? (type ? sameType[0] : undefined) ?? interpret(picked, s.level, s.target)
  if (!move) throw new Error(`DanLM played ${cards.join(' ')}, which this game does not allow here`)
  return {move, guessed: !declared}
}

// The step message that tells DanLM's shadow engine which play was made.
export function danlmStep(seat: number, move: Move | null, level: string) {
  return {op: 'step', seat, cards: move ? move.cards.map(cardCode) : [],
    rank: move ? danlmRank(move, level) : null, type: move ? danlmType(move) : null}
}
