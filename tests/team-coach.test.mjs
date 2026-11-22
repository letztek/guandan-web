import test from 'node:test'
import assert from 'node:assert/strict'
import { adviseTurn, botStep, publicTable, startMatch, takeTurn } from '../src/match.ts'
import { allMoves, deck, uid } from '../src/rules.ts'

function table(spec,turn=0) {
  const stock=deck()
  const hands=spec.map(row=>row.map(rank=>{
    const i=stock.findIndex(c=>c.rank===rank);assert.notEqual(i,-1)
    return stock.splice(i,1)[0]
  }))
  return {...startMatch(),turn,hands,events:[]}
}
function playSingle(s,rank) {
  const card=s.hands[s.turn].find(c=>c.rank===rank)
  return takeTurn(s,s.turn,allMoves([card],s.level,true)[0])
}
function decision(s) {
  const advice=adviseTurn(s), applied=takeTurn(s,s.turn,advice.move)
  assert.deepEqual(applied,botStep(s),'coach and bot must choose the same legal declaration')
  return advice
}
function reveal(s,to,card,from) {
  return {...s,events:[...s.events,{seat:-1,kind:'system',trick:s.trick,text:'明牌',reveal:{to,from,card}}]}
}

test('a low single feeds a one-card partner who can actually take first place',()=>{
  let s=table([['3','8','8','Q'],['3','3','3'],['9'],['4','5','6']])
  const a=decision(s);assert.equal(a.move.label,'3');assert.match(a.reason,/隊友只剩 1 張/)
  s=takeTurn(s,0,a.move);s=botStep(s);s=botStep(s)
  assert.deepEqual(s.finish,[2])
})
test('a pair cannot feed a one-card opponent, so the coach leads the pair',()=>{
  const s=table([['3','4','4','8'],['BJ'],['6','9','Q','A'],['3','7','10']])
  const a=decision(s);assert.equal(a.move.kind,'pair');assert.match(a.reason,/對手只剩一張/)
})
test('intercept an exposed partner trick to stop a final single, then secure first and second',()=>{
  let s=table([['3','J'],['6','7','8'],['BJ','4','4'],['K']])
  s=playSingle(s,'3');s=takeTurn(s,1,null)
  const a=decision(s);assert.equal(a.move.label,'大王');assert.match(a.reason,/隊友目前最大.*對手/)
  s=takeTurn(s,2,a.move)
  while(s.target) s=botStep(s)
  assert.equal(s.turn,2)
  s=botStep(s);assert.deepEqual(s.finish,[2])
  while(s.target) s=botStep(s)
  assert.equal(s.turn,0);assert.match(decision(s).reason,/包辦頭游、二游/)
  s=botStep(s);assert.deepEqual(s.finish,[2,0]);assert.equal(s.phase,'result')
})
test('a publicly known lower final card, or a last-to-act pass, lets partner keep control',()=>{
  let s=table([['9','Q'],['6','7','8'],['BJ','4','4'],['5']])
  s=reveal(s,3,s.hands[3][0]);s=playSingle(s,'9');s=takeTurn(s,1,null)
  assert.equal(decision(s).move,null)
  s={...s,events:s.events.slice(1),pending:[2]}
  assert.equal(decision(s).move,null)
})
test('when partner took first but an opponent already finished second, protect third',()=>{
  const s={...table([['J'],[],[],['K']]),finish:[2,1]}
  const a=decision(s);assert.match(a.reason,/對手已拿二游.*守住三游/);assert.doesNotMatch(a.reason,/包辦/)
  const end=takeTurn(s,0,a.move)
  assert.equal(end.phase,'result');assert.equal(end.gain,2);assert.deepEqual(end.finish,[2,1,0,3])
})
test('a short opponent with the lead warrants spending a bomb to deny another free lead',()=>{
  let s=table([['4','4','4','4','8','9','J'],['3','6','7'],['5','6','10'],['BJ','K']],3)
  s=playSingle(s,'BJ')
  const a=decision(s);assert.equal(a.move.kind,'bomb');assert.match(a.reason,/1 張的對手.*領出/)
})
test('pass an opponent’s low single when partner has a good chance to finish over it',()=>{
  let s=table([['BJ','10','Q'],['5','8','J'],['7'],['3','8','9','K']],3)
  s=playSingle(s,'3')
  const a=decision(s);assert.equal(a.move,null);assert.match(a.reason,/過牌.*隊友只剩 1 張/)
})
test('the partner can finish an exposed pair over a small legal pair lead',()=>{
  let s=table([['3','3','A','A','Q'],['4','4','6'],['7','7'],['8','9','10','J']])
  for(const c of s.hands[2]) s=reveal(s,2,c)
  const a=decision(s);assert.equal(a.move.kind,'pair');assert.equal(a.move.value,3);assert.match(a.reason,/餘牌都已公開/)
})
test('skeletal/legacy events safely omit earlier face observations',()=>{
  const game=startMatch(deck(),()=>0)
  assert.equal(publicTable(game).shown.flat().length,1)
  const s={...game,events:game.events.map(({reveal,...e})=>e)}
  assert.deepEqual(publicTable(s).shown,[[],[],[],[]]);assert.ok(decision(s).move)
})
test('decisions cannot inspect hidden hands or change after a hidden-hand permutation',()=>{
  let s=table([['3','3','8','J'],['4','5'],['6'],['9','Q','A']])
  const expected=adviseTurn(s)
  const hidden=s.hands.slice(1).flat().reverse()
  const altered={...s,hands:s.hands.map((cards,i)=>i?hidden.splice(0,cards.length):cards)}
  assert.deepEqual(adviseTurn(altered),expected)
  const guarded={...s,hands:s.hands.map((cards,i)=>i ? new Proxy(cards,{get(target,key) {
    if(key==='length')return target.length
    throw new Error('Hidden cards were inspected at seat '+i)
  }}) : cards)}
  assert.deepEqual(adviseTurn(guarded),expected)
})
test('playing or transferring either physical copy consumes the same publicly known face',()=>{
  const exposed=deck().filter(c=>c.rank==='9' && c.suit==='S')
  function afterPublicPlay(which) {
    let s=table([['3','8','J'],['4','5'],['6'],['9','Q','A']],3)
    s.hands[3][0]=exposed[which];s=reveal(s,3,exposed[0])
    return playSingle(s,'9')
  }
  const a=afterPublicPlay(0), b=afterPublicPlay(1)
  assert.deepEqual(publicTable(a),publicTable(b))
  assert.deepEqual(publicTable(b).shown[3],[])
  assert.deepEqual(publicTable(b).played,[{suit:'S',rank:'9'}])
  assert.deepEqual(adviseTurn(a),adviseTurn(b))
  let moved=table([['4','6'],['8','9'],['J'],['K','A']])
  moved=reveal(reveal(moved,1,exposed[0]),2,exposed[1],1)
  assert.deepEqual(publicTable(moved).shown,[[],[],[{suit:'S',rank:'9'}],[]])
  assert.notEqual(uid(exposed[0]),uid(exposed[1]))
})
