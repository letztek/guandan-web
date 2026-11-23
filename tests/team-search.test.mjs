import test from 'node:test'
import assert from 'node:assert/strict'
import { clearlyBetter, searchReason } from '../src/team-search.ts'
import { translateReason } from '../src/reason-l10n.ts'
import { allMoves, deck } from '../src/rules.ts'

const outcome = value => ({value, teamFirst:Number(value > 0), teamDouble:Number(value === 3), enemyDouble:Number(value === -3)})
const line = (move, values) => {
  const outcomes = values.map(outcome)
  return {move, outcomes, value:values.reduce((a, b) => a + b, 0) / values.length}
}

test('the search leaves the table plan alone unless a play is better beyond sampling noise', () => {
  const reference = line(null, [1, -1, 2, 1, -2, 1, 3, -1])
  // One level better on every sampled deal.
  assert.ok(clearlyBetter(line(null, [2, 0, 3, 2, -1, 2, 3, 0]), reference))
  // The same average gain, but driven by a couple of lucky deals.
  assert.ok(!clearlyBetter(line(null, [3, -3, 3, 1, -2, -1, 3, 3]), reference))
  assert.ok(!clearlyBetter(reference, reference))
  // A single sampled deal means the hidden cards were fully determined.
  assert.ok(clearlyBetter(line(null, [3]), line(null, [1])))
  assert.ok(!clearlyBetter(line(null, [1]), line(null, [1])))
})

test('a search decision names both plays and the measured difference in every language', () => {
  const kings = allMoves(deck().filter(card => ['SK-0','HK-0','DK-0','S8-0','C8-0'].includes(card.id)), '2', true)
    .find(move => move.kind === 'full')
  const reason = searchReason(line(kings, [3, 3, 1, 3]), line(null, [1, 2, 1, 1]))
  assert.equal(reason, '推演 4 種可能的牌局到本副結束，選擇「三帶對 K 帶 8」而不是「過牌」：我方包辦前兩名的比例由 0% 提高到 75%。')
  const english = translateReason(reason, 'en')
  assert.doesNotMatch(english, /\p{Script=Han}/u)
  assert.equal(english, 'Across 4 possible deals played to the end, full house K with 8 beats pass: your team takes first and second in 75% of them instead of 0%.')
  const japanese = translateReason(reason, 'ja')
  assert.match(japanese, /4通り.*「フルハウス Kと8」は「パス」より有利.*0%から75%/)

  const first = searchReason(line(null, [1, 1, -1, 1]), line(kings, [-1, 1, -1, -1]))
  assert.match(first, /選擇「過牌」而不是「三帶對 K 帶 8」：我方拿頭游的比例由 25% 提高到 75%。/)
  assert.doesNotMatch(translateReason(first, 'en'), /\p{Script=Han}/u)
  const average = searchReason(line(null, [2, 2]), line(kings, [1, 1]))
  assert.match(average, /平均每副多升 1\.0 級。/)
  assert.doesNotMatch(translateReason(average, 'en'), /\p{Script=Han}/u)
})
