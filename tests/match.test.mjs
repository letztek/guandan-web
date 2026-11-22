import test from 'node:test'
import assert from 'node:assert/strict'
import { adviseTurn, botStep, exchangeOptions, giveCard, nextHand, openingTributeNotice, partner, settle, shufflePack, startMatch, takeTurn } from '../src/match.ts'
import { allMoves, deck, uid, wild } from '../src/rules.ts'

function seeded(seed) {
  return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296)
}
function setup(spec) {
  const pool = deck()
  const hands=spec.map(row=>row.map(rank=>pool.splice(pool.findIndex(c=>c.rank===rank),1)[0]))
  return {...startMatch(),hands,turn:0,events:[]}
}
function single(s,rank) {return allMoves(s.hands[s.turn],s.level).find(m=>m.kind==='single' && m.cards[0].rank===rank)}
function arrangeDonors(wanted,start=0) {
  const pool=deck(), h=[[],[],[],[]]
  for(let i=0;i<4;i++) for(const key of wanted[i]??[]) {
    const index=pool.findIndex(c=>uid(c)===key);assert.notEqual(index,-1)
    h[i].push(pool.splice(index,1)[0])
  }
  for(let i=0;i<4;i++) while(h[i].length<27) h[i].push(pool.shift())
  const pack=[]
  for(let i=0;i<108;i++)pack.push(h[(start+i)%4][Math.floor(i/4)])
  return pack
}
const jokers=deck().filter(c=>c.rank==='BJ').map(uid)
test('four real hands, partners sit opposite; a lead cannot pass or play out of turn',()=>{
  const r=seeded(41),s=startMatch(shufflePack(r),r)
  assert.deepEqual(s.hands.map(h=>h.length),[27,27,27,27])
  assert.equal(new Set(s.hands.flat().map(uid)).size,108)
  assert.equal(partner(0),2)
  assert.throws(()=>takeTurn(s,s.turn,null))
  assert.throws(()=>takeTurn(s,(s.turn+1)%4,null))
})
test('a last-card leader gives the wind to their partner when the others pass',()=>{
  let s=setup([['7'],['3','4'],['5','6'],['8','9']])
  s=takeTurn(s,0,single(s,'7'))
  for(const seat of [1,2,3])s=takeTurn(s,seat,null)
  assert.equal(s.turn,2);assert.equal(s.target,null);assert.equal(s.trick,2)
  assert.deepEqual(s.finish,[0])
})
test('players may re-enter after passing when somebody else raises',()=>{
  let s=setup([['4','8'],['6','7'],['5','9'],['3','10']])
  s=takeTurn(s,0,single(s,'4'));s=takeTurn(s,1,null)
  s=takeTurn(s,2,single(s,'5'));s=takeTurn(s,3,null);s=takeTurn(s,0,null)
  assert.equal(s.turn,1)
  assert.equal(takeTurn(s,1,single(s,'6')).holder,1)
})
test('same-team top two end immediately; same-team first/last advance by one',()=>{
  let s=setup([['7'],['3','4'],['8'],['5','6']])
  s=takeTurn(s,0,single(s,'7'));s=takeTurn(s,1,null);s=takeTurn(s,2,single(s,'8'))
  assert.equal(s.phase,'result');assert.deepEqual(s.finish,[0,2]);assert.equal(s.scores[0],'5')
  const last=settle({...s,scores:['2','2'],finish:[0,1,3]})
  assert.deepEqual(last.finish,[0,1,3,2]);assert.equal(last.scores[0],'3')
})
test('passing A requires the declaring team and a partner in second or third',()=>{
  const s={...startMatch(),scores:['A','A'],owner:1,level:'A'}
  assert.equal(settle({...s,finish:[0,2]}).won,false)
  assert.equal(settle({...s,finish:[1,0,3]}).won,true)
  assert.equal(settle({...s,finish:[1,0,2]}).won,false)
  assert.equal(settle({...s,level:'K',scores:['K','2'],owner:0,finish:[0,2]}).scores[0],'A')
})
test('two big jokers across the donors resist a double tribute',()=>{
  const end=settle({...startMatch(),finish:[0,2]})
  const s=nextHand(end,arrangeDonors([[],[jokers[0]],[],[jokers[1]]],1))
  assert.equal(s.phase,'play');assert.equal(s.turn,0);assert.match(s.events[0].text,/抗貢/)
  assert.match(openingTributeNotice(s),/雙下.*兩張大王.*上副頭游/)
  const sameDonor=nextHand(end,arrangeDonors([[],jokers,[],[]],1))
  assert.match(openingTributeNotice(sameDonor),/雙下/)
  const mixed=nextHand(end,arrangeDonors([[jokers[0]],[jokers[1]],[],[]],1))
  assert.equal(mixed.phase,'donate');assert.equal(openingTributeNotice(mixed),null)
})
test('a single donor resists with both big jokers and the notice lasts through the opening trick',()=>{
  const end=settle({...startMatch(),finish:[0,1,2]})
  let s=nextHand(end,arrangeDonors([[],[],[],jokers]))
  assert.equal(s.turn,0);assert.equal(s.phase,'play');assert.equal(s.exchange,null)
  const notice=openingTributeNotice(s)
  assert.match(notice,/末游持有兩張大王.*上副頭游（你）/)
  s=takeTurn(s,0,allMoves(s.hands[0],s.level).find(m=>m.kind==='single'))
  assert.equal(openingTributeNotice(s),notice)
  for(const seat of [1,2,3])s=takeTurn(s,seat,null)
  assert.equal(openingTributeNotice(s),null);assert.equal(s.events[0].text,notice)
  const split=nextHand(end,arrangeDonors([[],[jokers[0]],[],[jokers[1]]]))
  assert.equal(split.phase,'donate');assert.equal(openingTributeNotice(split),null)
})
test('single tribute, recipient returns a legal low card, actual donor opens',()=>{
  const end=settle({...startMatch(),finish:[0,1,3]})
  let s=nextHand(end,arrangeDonors([[jokers[0]],[],[jokers[1]],[]]))
  assert.equal(s.turn,2);assert.equal(s.phase,'donate')
  const c=exchangeOptions(s)[0];assert.equal(c.rank,'BJ')
  assert.ok(exchangeOptions(s).every(c=>!wild(c,s.level)))
  s=giveCard(s,2,c);assert.equal(s.turn,0);assert.equal(s.hands[0].length,28)
  assert.ok(exchangeOptions(s).every(c=>Number(c.rank)<=10&&c.rank!==s.level))
  s=giveCard(s,0,exchangeOptions(s)[0]);assert.equal(s.turn,2);assert.equal(s.phase,'play')
  assert.deepEqual(s.hands.map(h=>h.length),[27,27,27,27])
  assert.equal(new Set(s.hands.flat().map(uid)).size,108)
})
test('equal double tribute goes clockwise and the first finisher’s right seat opens',()=>{
  const end=settle({...startMatch(),finish:[0,2]})
  const small=deck().filter(c=>c.rank==='SJ').map(uid)
  let s=nextHand(end,arrangeDonors([jokers,[small[0]],[],[small[1]]],1))
  while(s.phase==='donate')s=giveCard(s,s.turn,exchangeOptions(s)[0])
  assert.deepEqual(s.exchange.gifts.map(g=>[g.from,g.to]),[[1,0],[3,2]])
  while(s.phase==='return')s=giveCard(s,s.turn,exchangeOptions(s)[0])
  assert.equal(s.turn,1);assert.equal(new Set(s.hands.flat().map(uid)).size,108)
})
test('the coach lets its partner hold the table unless it can finish immediately',()=>{
  let s=setup([['4','7'],['8','3'],['5','6'],['8','7']])
  s=takeTurn(s,0,single(s,'4'));s=takeTurn(s,1,null)
  assert.equal(adviseTurn(s).move,null)
  assert.equal(adviseTurn({...s,hands:s.hands.map((h,i)=>i===2?h.slice(0,1):h)}).move.kind,'single')
})
test('seeded full matches terminate, conserve all played cards, and reach a valid A result',()=>{
  for(const seed of [4,17,72]){
    const r=seeded(seed)
    let s=startMatch(shufflePack(r),r),steps=0
    while(!s.won && ++steps<10000){
      if(s.phase==='result'){
        const played=s.events.filter(e=>e.move).flatMap(e=>e.move.cards)
        assert.equal(new Set([...played,...s.hands.flat()].map(uid)).size,108)
        assert.equal(played.length+s.hands.flat().length,108)
        s=nextHand(s,shufflePack(r))
      } else s=botStep(s)
    }
    assert.ok(s.won,'seed '+seed);assert.equal(s.level,'A');assert.ok(s.handNo>1)
  }
})
