// Precompute what bench.html should see: the same self-play as the page, run
// in Node with the same model, so the page can check its results match.
//
// node --disable-warning=ExperimentalWarning --experimental-strip-types tools/train/bench-fixture.ts public/model/bench
import { writeFileSync } from 'node:fs'
import { loadModel } from './model.ts'
import { benchPlay } from '../../src/bench-play.ts'
import { masterAdvice } from '../../src/master.ts'
import { quickTeamSuggestion } from '../../src/team-coach.ts'

const base = process.argv[2] ?? 'public/model/bench'
const scorer = await loadModel(base)
const decisions = await benchPlay(async input => {
  const rules = quickTeamSuggestion(input.hand, input.level, input.target, input.table, undefined, true)
  const {move, q} = masterAdvice(input.master!, scorer, rules)
  return {move, q}
})
writeFileSync(base + '-expected.json', JSON.stringify(decisions))
console.log(`${decisions.length} decisions → ${base}-expected.json`)
