// Duplicate play: every deal is played twice, once with our team holding the
// seats 0/2 cards and once holding the seats 1/3 cards, against the same
// competition bot. Card luck cancels; what is left is play quality.
// Each deal is a single hand at a random level, without tribute.
//
// node --disable-warning=ExperimentalWarning --experimental-strip-types tools/arena/duplicate.ts \
//   --baselines <DanLM>/baselines --bot njupt-guandan-ai --deals 100 --out dup.jsonl
// Summarise with tools/arena/dup-report.ts.
import { appendFileSync } from 'node:fs'
import { shufflePack, startMatch, type Match } from '../../src/match.ts'
import { ranks } from '../../src/rules.ts'
import type { Difficulty } from '../../src/difficulty.ts'
import { parseArgs, policyFromArgs, searchStats, seeded, Table } from './table.ts'

const args = parseArgs(process.argv.slice(2))
if (!args.baselines) throw new Error('--baselines <path to DanLM/baselines> is required')
const bot = args.bot ?? 'njupt-guandan-ai'
const policy = await policyFromArgs(args)
const strength = (args.model ? 'model' : args.strength ?? 'advanced') as Difficulty
const deals = Number(args.deals ?? 20), from = Number(args.from ?? 0)

function dealFor(deal: number): Match {
  const rng = seeded(7919 * (deal + 1) + Number(args.seed ?? 0))
  const level = ranks[Math.floor(rng() * ranks.length)]
  const s = startMatch(shufflePack(rng), rng)
  return {...s, level, scores: [level, level], owner: 0}
}

let total = 0
for (let deal = from; deal < from + deals; deal++) {
  const start = dealFor(deal)
  let score = 0
  for (const ours of [0, 1]) {
    const table = new Table({python: args.python, baselines: args.baselines, bot, strength, ours, policy})
    try {
      const {record} = await table.playHand(structuredClone(start), [], true)
      const ourScore = (record.firstTeam === ours ? 1 : -1) * record.gain
      score += ourScore
      if (args.out) appendFileSync(args.out, JSON.stringify({deal, bot, strength, ours, ourScore, ...record, errors: table.stats}) + '\n')
    } finally {
      table.close()
    }
  }
  total += score
  console.log(`deal ${deal} level ${start.level}: duplicate ${score >= 0 ? '+' : ''}${score}  (running ${(total / (deal - from + 1)).toFixed(2)} per deal)` +
    (searchStats.decisions ? `  search: ${searchStats.searched}/${searchStats.decisions} searched, ${searchStats.changed} changed,` +
      ` ${(searchStats.ms / searchStats.decisions).toFixed(0)} ms avg, ${searchStats.maxMs.toFixed(0)} ms max` : ''))
}
