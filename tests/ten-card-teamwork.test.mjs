import test from 'node:test'
import assert from 'node:assert/strict'
import { adviceInput, adviseTurn, takeTurn } from '../src/match.ts'
import { allMoves, beats, uid } from '../src/rules.ts'
import { tenCardGame } from './fixtures/ten-card-game.mjs'

const advice = game => adviseTurn(game,'advanced','support')
const faces = cards => cards.map(card=>card.suit+card.rank).sort()

test('the advanced partner stops the ten-card leader and takes a one-card partner\'s trick only to set up first and second', () => {
  const block = tenCardGame('block'), yieldToMate = tenCardGame('yield')
  assert.deepEqual(block.hands[2], yieldToMate.hands[2])
  assert.deepEqual(block.target,yieldToMate.target)
  const stopView = adviceInput(block,'advanced','support'), letView = adviceInput(yieldToMate,'advanced','support')
  assert.deepEqual(stopView.table.counts,[8,10,8,12])
  assert.deepEqual(letView.table.counts,[1,10,8,19])
  assert.deepEqual(faces(stopView.table.played),faces(letView.table.played))
  assert.deepEqual(stopView.table.shown,[[],[],[],[]])
  assert.deepEqual(letView.table.shown,stopView.table.shown)

  const stop = advice(block), letThrough = advice(yieldToMate)
  assert.equal(stop.move?.kind,'full')
  assert.equal(stop.move.label,'K 帶 8')
  assert.match(stop.reason,/10 張/)
  assert.match(stop.reason,/壓|攔/)
  assert.equal(takeTurn(block,2,stop.move).hands[2].length,3)

  // Passing lets the one-card partner go out first, but leaves this seat with
  // eight cards. Played to the end of the deal on sampled hands, taking the
  // trick with the kings sheds five of them and sets up first and second place.
  assert.equal(letThrough.move?.kind,'full')
  assert.equal(letThrough.move.label,'K 帶 8')
  assert.match(letThrough.reason,/推演 \d+ 種可能的牌局到本副結束/)
  assert.match(letThrough.reason,/包辦前兩名的比例由 \d+% 提高到 \d+%/)
  // Without the full-deal search, the table plan still leaves the trick to the partner.
  const standardYield = adviseTurn(yieldToMate,'standard','support')
  assert.equal(standardYield.move,null)
  assert.match(standardYield.reason,/隊友.*(?:剩 1 張|一張)/)
  assert.match(standardYield.reason,/先過|過牌/)
  assert.ok(allMoves(yieldToMate.hands[2],'2').some(move=>beats(move,yieldToMate.target)))
  const afterPass = takeTurn(yieldToMate,2,null)
  assert.equal(afterPass.turn,3)
  const nextLead = takeTurn(afterPass,3,null)
  assert.equal(nextLead.turn,0)
  const mateFinish = allMoves(nextLead.hands[0],nextLead.level,true)[0]
  assert.deepEqual(takeTurn(nextLead,0,mateFinish).finish,[0])
})

test('ten-card decisions and explanations are identical when the concealed holdings are changed or inaccessible', () => {
  for (const situation of ['block','yield']) {
    const game = tenCardGame(situation)
    const hidden = game.hands.filter((_,seat)=>seat!==2).flat().reverse()
    const shuffled = {...game,hands:game.hands.map((hand,seat)=>seat===2 ? hand : hidden.splice(0,hand.length))}
    assert.notDeepEqual(shuffled.hands[1].map(uid),game.hands[1].map(uid))
    const guarded = {...game,hands:game.hands.map((hand,seat)=>seat===2 ? hand : new Proxy(hand,{
      get(cards,property) {
        if (property==='length') return cards.length
        throw Error('Inspected concealed card at seat '+seat)
      }
    }))}
    const expected = advice(game)
    assert.deepEqual(advice(shuffled),expected)
    assert.deepEqual(advice(guarded),expected)
    assert.doesNotMatch(expected.reason,/對手(?:握有|持有|手裡有)|對手的(?:順子|三帶對)/)
  }
})

test('advanced seats on both teams start watching at ten', () => {
  for (const count of [5,9,10,11]) {
    const game = tenCardGame('block',0,count)
    assert.equal(game.hands[1].length,count)
    const standard = adviseTurn(game,'standard','support')
    assert.doesNotMatch(standard.reason,/對手剩 \d+ 張/)
    assert.doesNotMatch(adviseTurn(game,'beginner','support').reason,/對手剩 \d+ 張/)
    if (count===11) assert.doesNotMatch(advice(game).reason,/對手剩 \d+ 張/)
    else assert.match(advice(game).reason,new RegExp('對手剩 '+count+' 張'))
  }
  // The opposing seats get exactly the same warning window as the partner.
  for (const offset of [1,3]) {
    const enemy = tenCardGame('block',offset)
    assert.match(advice(enemy).reason,/對手剩 10 張/)
    assert.doesNotMatch(adviseTurn(enemy,'standard','support').reason,/對手剩 \d+ 張/)
  }
})
