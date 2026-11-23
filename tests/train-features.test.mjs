import test from 'node:test'
import assert from 'node:assert/strict'
import { botStep, shufflePack, startMatch } from '../src/match.ts'
import { ACTION_DIM, ACTION_SCALE, STATE_DIM, STATE_SCALE, actionFeatures, candidates, stateFeatures } from '../tools/train/features.ts'

function seeded(seed) {
  return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296)
}
// A position some way into a hand, with plays and an open trick on the table.
function midHand(seed, plays) {
  const r = seeded(seed)
  let s = startMatch(shufflePack(r), r)
  for (let i = 0; i < plays && s.phase === 'play'; i++) s = botStep(s)
  return s
}

test('state features use only what the seat to move can see', () => {
  for (const [seed, plays] of [[3, 9], [11, 23], [29, 40]]) {
    const s = midHand(seed, plays)
    const seat = s.turn
    const hidden = s.hands.filter((_, i) => i !== seat).flat().reverse()
    const shuffled = {...s, hands: s.hands.map((hand, i) => i === seat ? hand : hidden.splice(0, hand.length))}
    assert.notDeepEqual(shuffled.hands[(seat + 1) % 4], s.hands[(seat + 1) % 4])
    assert.deepEqual(stateFeatures(shuffled), stateFeatures(s))
    for (const move of candidates(s)) assert.deepEqual(actionFeatures(shuffled, move), actionFeatures(s, move))
  }
})

test('features fit in a byte and match the exported scales; PASS leads the list when following', () => {
  assert.equal(STATE_SCALE.length, STATE_DIM)
  assert.equal(ACTION_SCALE.length, ACTION_DIM)
  const s = midHand(5, 13)
  assert.equal(stateFeatures(s).length, STATE_DIM)
  const options = candidates(s)
  for (const move of options) assert.equal(actionFeatures(s, move).length, ACTION_DIM)
  if (s.target) assert.equal(options[0], null)
  else assert.ok(options.every(Boolean))
  // Different plays look different to the model.
  const keys = new Set(options.map(m => actionFeatures(s, m).join()))
  assert.ok(keys.size > 1)
})
