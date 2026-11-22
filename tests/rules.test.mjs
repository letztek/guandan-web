import test from 'node:test'
import assert from 'node:assert/strict'
import { allMoves, beats, coach, deal, deck, initialHand, initialTarget, interpret, remaining, uid } from '../src/rules.ts'

function cards(...codes) {
  const pack=deck()
  return codes.map(code=>{
    const suit=code==='SJ'||code==='BJ'?'J':code[0]
    const rank=suit==='J'?code:code.slice(1)
    const index=pack.findIndex(c=>c.suit===suit&&c.rank===rank)
    assert.ok(index>=0,code)
    return pack.splice(index,1)[0]
  })
}
const classify=(...codes)=>interpret(cards(...codes),'2',null)
test('two decks and 27 unique physical cards per deal',()=>{
  assert.equal(deck().length,108);assert.equal(new Set(deck().map(uid)).size,108)
  const h=deal();assert.equal(new Set(h.map(uid)).size,27)
})
test('coach preserves the three consecutive pairs in the opening exercise',()=>{
  const h=initialHand(), target=interpret(initialTarget(),'2',null), legal=allMoves(h,'2')
  const best=coach(h,'2',target,legal)[0].move
  assert.ok(best.cards.every(c=>c.rank==='J'));assert.equal(best.kind,'pair')
  assert.equal(interpret(remaining(h,best),'2',null).kind,'pairs')
})
test('a five-card run cannot loop through K A 2',()=>{
  assert.equal(classify('SA','C2','H3','D4','S5').kind,'straight')
  assert.equal(classify('SK','HA','C2','D3','S4'),null)
  assert.ok(beats(classify('S10','HJ','CQ','DK','SA'),classify('SA','C2','H3','D4','S5')))
})
test('hearts level card substitutes for a missing suit and rank',()=>{
  const m=classify('S4','S5','S7','S8','H2')
  assert.equal(m.kind,'flush');assert.deepEqual(Object.values(m.as),['♠6'])
  assert.equal(classify('SJ','H2'),null)
  assert.equal(classify('H2','H2').value,16)
})
test('four jokers outrank six-card bombs, flushes and five-card bombs',()=>{
  const five=classify('S7','H7','D7','C7','S7')
  const six=classify('S4','H4','D4','C4','S4','C4')
  const flush=classify('S4','S5','S6','S7','S8'),kings=classify('SJ','SJ','BJ','BJ')
  assert.ok(beats(kings,six)&&beats(six,flush)&&beats(flush,five))
  assert.ok(!beats(five,flush)&&!beats(flush,six))
})
test('same-length bombs use effective level rank; a full house uses its triple',()=>{
  assert.ok(beats(classify('S2','C2','D2','H2'),classify('SA','CA','DA','HA')))
  assert.ok(!beats(classify('S4','H4','C4','SA','HA'),classify('S5','H5','C5','S3','D3')))
})
test('pair sequences, steel plates and ordinary follow restrictions',()=>{
  assert.equal(classify('SA','HA','C2','D2','S3','D3').kind,'pairs')
  assert.equal(classify('SK','CK','DK','HA','CA','SA').kind,'steel')
  assert.equal(classify('S7','C7','H8','D8'),null)
  assert.ok(!beats(classify('SA','DA'),classify('S7','C7','H7')))
})
test('all recommended groups use existing cards once and beat the table',()=>{
  for(let i=0;i<12;i++){
    const h=deal(),level=['2','8','A'][i%3],t=interpret(initialTarget(),level,null)
    for(const {move:m} of coach(h,level,t,allMoves(h,level))){
      assert.ok(beats(m,t));assert.ok(interpret(m.cards,level,t))
      assert.equal(new Set(m.cards.map(uid)).size,m.cards.length)
      assert.equal(remaining(h,m).length+m.cards.length,h.length)
    }
  }
})
