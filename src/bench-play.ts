// The fixed self-play that bench.html times and tools/train/bench-fixture.ts
// precomputes: 大師 in all four seats, one hand per seed.
import { adviceInput, shufflePack, startMatch, takeTurn, type Match } from './match.ts'
import type { Move } from './rules.ts'

export const BENCH_SEEDS = [11, 23, 37, 41, 59, 67]
export type BenchDecision = {key: string, q: number}
export const moveKey = (move: Move | null) => move ? move.kind + ' ' + move.label : 'pass'

function seeded(seed: number) {
  return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296)
}

// decide(input) returns the chosen move and its value for one position.
export async function benchPlay(decide: (input: ReturnType<typeof adviceInput>) => Promise<{move: Move | null, q: number}>,
    onDecision?: (d: BenchDecision) => void) {
  const decisions: BenchDecision[] = []
  for (const seed of BENCH_SEEDS) {
    const r = seeded(seed)
    let s: Match = startMatch(shufflePack(r), r)
    while (s.phase === 'play') {
      const {move, q} = await decide(adviceInput(s, 'master'))
      const d = {key: moveKey(move), q}
      decisions.push(d)
      onDecision?.(d)
      s = takeTurn(s, s.turn, move)
    }
  }
  return decisions
}
