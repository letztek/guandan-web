import test from 'node:test'
import assert from 'node:assert/strict'
import { botStep, shufflePack, startMatch } from '../src/match.ts'
import { ACTION_DIM, ACTION_SCALE, STATE_DIM, STATE_SCALE, actionFeatures, candidates, stateFeatures } from '../src/model-features.ts'

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

test('play history reads the current trick, the last trick and passes under an opponent', async () => {
  const { playHistory } = await import('../tools/train/features.ts')
  const { takeTurn } = await import('../src/match.ts')
  const { allMoves, beats } = await import('../src/rules.ts')
  const r = seeded(77)
  let s = startMatch(shufflePack(r), r)
  const leader = s.turn
  const lowest = allMoves(s.hands[leader], s.level).filter(m => m.kind === 'single').sort((a, b) => a.value - b.value)[0]
  s = takeTurn(s, leader, lowest)
  const second = s.turn
  s = takeTurn(s, second, null)
  // Seen by the third seat: the leader is its partner (2 seats back is relative 2).
  const third = s.turn
  let h = playHistory(s, third)
  const rel = other => (other - third + 4) % 4
  assert.deepEqual(h.latest[rel(leader)], lowest)
  assert.equal(h.latest[rel(second)], null)
  assert.equal(h.latest[0], undefined)
  assert.equal(h.playsThisTrick, 1)
  assert.equal(h.lastWinner, -1)
  // The second seat passed on an opponent's single, so nothing above that value is suggested.
  assert.equal(h.tally[rel(second)].passedUnder[0], lowest.value)
  assert.equal(h.tally[rel(leader)].leads, 1)
  // Everyone else passes: a new trick starts with the leader to lead again.
  while (s.trick === 1) s = takeTurn(s, s.turn, s.target && s.holder !== s.turn ? null : allMoves(s.hands[s.turn], s.level)[0])
  h = playHistory(s, s.turn)
  assert.deepEqual(h.latest, [undefined, undefined, undefined, undefined])
  assert.equal(h.playsThisTrick, 0)
  assert.equal(h.lastWinner, (leader - s.turn + 4) % 4)
  assert.equal(h.lastLead, 'single')
})
