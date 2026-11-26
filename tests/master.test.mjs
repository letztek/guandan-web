import test from 'node:test'
import assert from 'node:assert/strict'
import { adviceInput, adviseTurn, botStep, publicView, shufflePack, startMatch, takeTurn } from '../src/match.ts'
import { candidates, stateFeatures, actionFeatures } from '../src/model-features.ts'
import { MoveScorer } from '../src/move-scorer.ts'
import { masterAdvice, masterReason } from '../src/master.ts'
import { quickTeamSuggestion } from '../src/team-coach.ts'
import { translateReason } from '../src/reason-l10n.ts'
import { offeredDifficulties, readStrengths, strengthKeys } from '../src/difficulty.ts'
import { allMoves, beats } from '../src/rules.ts'
import { randomModel } from '../tools/train/random-model.ts'

function seeded(seed) {
  return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296)
}
function midHand(seed, plays) {
  const r = seeded(seed)
  let s = startMatch(shufflePack(r), r)
  for (let i = 0; i < plays && s.phase === 'play'; i++) s = botStep(s)
  return s
}
const {json, weights} = randomModel([16, 8], 7)
const scorer = new MoveScorer(json, weights)

test('the 大師 view hides other hands but gives the model the same features as the full match', () => {
  for (const [seed, plays] of [[3, 0], [11, 17], [29, 41]]) {
    const s = midHand(seed, plays)
    const view = publicView(s)
    assert.deepEqual(view.hands[s.turn], s.hands[s.turn])
    for (let seat = 0; seat < 4; seat++) {
      assert.equal(view.hands[seat].length, s.hands[seat].length)
      if (seat !== s.turn) assert.ok(view.hands[seat].every(card => card.rank === '?'))
    }
    assert.deepEqual(stateFeatures(view), stateFeatures(s))
    const options = candidates(s)
    assert.deepEqual(candidates(view).map(m => m && m.label), options.map(m => m && m.label))
    for (const move of options) assert.deepEqual(actionFeatures(view, move), actionFeatures(s, move))
  }
})

test('大師 asks the rules side for the advanced player and plays a legal card from its own hand', () => {
  const s = midHand(11, 17)
  const input = adviceInput(s, 'master')
  assert.equal(input.strength, 'advanced')
  assert.ok(input.master)
  // Without the model (tests, tools), 大師 plays as the advanced player.
  assert.deepEqual(adviseTurn(s, 'master'), adviseTurn(s, 'advanced'))
  const rules = quickTeamSuggestion(input.hand, input.level, input.target, input.table, undefined, true)
  const advice = masterAdvice(input.master, scorer, rules)
  assert.ok(advice.move === null ? !!s.target : beats(advice.move, s.target))
  assert.notEqual(takeTurn(s, s.turn, advice.move), s)
  assert.equal(typeof advice.q, 'number')
  if (rules.move?.label === advice.move?.label && rules.move?.kind === advice.move?.kind) assert.equal(advice.reason, rules.reason)
})

test('every 大師 explanation reads in all three languages', () => {
  const reasons = []
  for (const [seed, plays] of [[3, 0], [5, 9], [11, 17], [29, 41], [31, 52]]) {
    const s = midHand(seed, plays)
    const view = publicView(s)
    const options = candidates(view)
    for (const move of options.slice(0, 6)) reasons.push(masterReason(view, move, options.find(m => m !== move)))
  }
  // A pass while the partner holds, and the bomb wording.
  const s = midHand(5, 9)
  reasons.push(masterReason({...publicView(s), target: s.target ?? allMoves(s.hands[s.turn], s.level)[0], holder: (s.turn + 2) % 4}, null, undefined))
  for (const reason of new Set(reasons)) {
    assert.match(reason, /\p{Script=Han}/u)
    for (const language of ['en', 'ja']) {
      const translated = translateReason(reason, language)
      if (language === 'en') assert.doesNotMatch(translated, /\p{Script=Han}/u, reason + ' → ' + translated)
      else assert.doesNotMatch(translated, /大師|隊友|過牌|出完剩/, reason + ' → ' + translated)
    }
  }
})

test('a build without the model never offers 大師, and a saved 大師 setting plays as 進階', () => {
  assert.ok(!offeredDifficulties().includes('master'))
  const values = new Map([[strengthKeys.opponents, 'master']])
  globalThis.window = {localStorage: {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)}}
  try {
    assert.deepEqual(readStrengths(), {ally: 'standard', opponents: 'advanced'})
  } finally {delete globalThis.window}
})

test('the shipped 大師 model loads with this build\'s features and chooses legal plays', async () => {
  const { existsSync } = await import('node:fs')
  if (!existsSync('public/model/master.json')) return
  const { loadModel } = await import('../tools/train/model.ts')
  // A feature change without a retrained model would throw here instead of silently falling back.
  const shipped = await loadModel('public/model/master')
  assert.equal(shipped.json.dtype, 'float16')
  for (const [seed, plays] of [[3, 0], [11, 17], [29, 41]]) {
    const s = midHand(seed, plays)
    const {move} = shipped.choose(publicView(s))
    assert.ok(move === null ? !!s.target : beats(move, s.target))
    assert.notEqual(takeTurn(s, s.turn, move), s)
  }
})
