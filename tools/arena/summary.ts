// Summarise arena .jsonl files: whole-game and per-hand first-place rates with
// 95% Wilson intervals, next to DanLM's published rates against the same bots.
// node --experimental-strip-types tools/arena/summary.ts results/*.jsonl
import { readFileSync } from 'node:fs'

// DanLM README (github.com/dashidhy/DanLM, 2026-11): DanLM vs each bot,
// single-round win rate / whole-game win rate.
const danlm: Record<string, [number, number]> = {
  'njupt-guandan-ai': [.819, 1], 'guanglan-iot': [.809, .998], 'egg-expert': [.823, .999], 'egg-pancake': [.859, .999],
}

function wilson(k: number, n: number) {
  if (!n) return [0, 0]
  const z = 1.96, p = k / n, d = 1 + z * z / n
  const mid = (p + z * z / (2 * n)) / d, half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
  return [mid - half, mid + half]
}
const pct = (x: number) => (100 * x).toFixed(1) + '%'

type Row = {ours: number, bot: string, strength: string, hands: number, firsts: number[], doubles: number[], winner: number, botErrors: number, stateErrors: number}
const groups = new Map<string, Row[]>()
for (const file of process.argv.slice(2)) {
  for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const row = JSON.parse(line) as Row
    const key = row.bot + ' / ' + row.strength
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
}
console.log('| opponent / our strength | games | game win (95% CI) | hand 頭游 (95% CI) | our 雙下 / their 雙下 | DanLM: hand / game | bot errors |')
console.log('|---|---|---|---|---|---|---|')
for (const [key, rows] of [...groups].sort()) {
  const games = rows.length, wins = rows.filter(r => r.winner === r.ours).length
  const hands = rows.reduce((n, r) => n + r.hands, 0)
  const firsts = rows.reduce((n, r) => n + r.firsts[r.ours], 0)
  const ourDoubles = rows.reduce((n, r) => n + r.doubles[r.ours], 0)
  const theirDoubles = rows.reduce((n, r) => n + r.doubles[1 - r.ours], 0)
  const errors = rows.reduce((n, r) => n + r.botErrors + r.stateErrors, 0)
  const [gl, gh] = wilson(wins, games), [hl, hh] = wilson(firsts, hands)
  const ref = danlm[rows[0].bot]
  console.log(`| ${key} | ${games} | ${pct(wins / games)} (${pct(gl)}–${pct(gh)}) | ${pct(firsts / hands)} (${pct(hl)}–${pct(hh)}) of ${hands} |` +
    ` ${pct(ourDoubles / hands)} / ${pct(theirDoubles / hands)} | ${ref ? pct(ref[0]) + ' / ' + pct(ref[1]) : '–'} | ${errors} |`)
}
