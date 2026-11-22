import test from 'node:test'
import assert from 'node:assert/strict'
import { autoPass, automaticPassText, canAutoPass } from '../src/auto-pass.ts'
import { allMoves, deck } from '../src/rules.ts'
import { startMatch, takeTurn } from '../src/match.ts'

function position(ownIds=['S3-0'], targetIds=['S7-0'], level='5') {
  const stock=deck()
  const take=id=>{
    const index=stock.findIndex(card=>card.id===id)
    assert.notEqual(index,-1,id)
    return stock.splice(index,1)[0]
  }
  const own=ownIds.map(take), targetCards=targetIds.map(take)
  const target=targetCards.length?allMoves(targetCards,level,true)[0]:null
  return {...startMatch(deck(),()=>0),level,hands:[own,stock.splice(0,3),stock.splice(0,3),stock.splice(0,3)],
    turn:0,holder:target?3:-1,pending:target?[0,1,2]:[],target,events:[]}
}

test('the last unplayable card automatically passes using the normal turn transition',()=>{
  const game=position(), before=structuredClone(game)
  assert.equal(canAutoPass(game),true)
  const next=autoPass(game)
  const manual=takeTurn(game,0,null)
  assert.deepEqual(next,{...manual,events:[{...manual.events[0],text:automaticPassText}]})
  assert.deepEqual(game,before)
  assert.deepEqual(next.hands,game.hands)
  assert.equal(autoPass(next),next,'a repeated callback cannot pass the next seat')
})

test('legal final singles, level cards and jokers remain manual',()=>{
  for(const [own,target] of [['S8-0','S7-0'],['S5-0','SA-0'],['H5-0','SA-0'],['JSJ-0','DA-0'],['JBJ-0','JSJ-0']]) {
    const game=position([own],[target])
    assert.equal(canAutoPass(game),false,own+' over '+target)
    assert.equal(autoPass(game),game)
  }
  assert.equal(canAutoPass(position(['S7-0'],['S7-1'])),true,'equal ranks cannot beat a single')
  assert.equal(canAutoPass(position(['JBJ-0'],['S4-0','C4-0'])),true,'one joker cannot follow a pair')
})

test('auto-pass requires a live hand, an active human response and the correct pending seat',()=>{
  const base=position()
  for(const game of [
    position(['S3-0'],[]),
    {...base,hands:[[],...base.hands.slice(1)]},
    {...base,turn:1},
    {...base,pending:[1,0,2]},
    ...['donate','return','result'].map(phase=>({...base,phase}))
  ]) {
    assert.equal(canAutoPass(game),false)
    assert.equal(autoPass(game),game)
  }
})

test('a last response closes the trick, records the automatic pass and leaves the next lead manual',()=>{
  const game={...position(),holder:2,pending:[0]}
  const next=autoPass(game)
  assert.equal(next.turn,2)
  assert.equal(next.target,null)
  assert.equal(next.trick,game.trick+1)
  assert.equal(next.events[0].kind,'pass')
  assert.equal(next.events[0].text,automaticPassText)
  assert.equal(next.events[1].kind,'system')
  assert.equal(canAutoPass(next),false)
})

test('three of a kind and longer hands pass automatically when none of their subsets can follow',()=>{
  const pair=['S8-0','H8-0']
  for (const [own,target] of [
    [['S3-0','C3-0','D3-0'],pair],
    [['S6-0','H7-0','D9-0','CJ-0','SQ-0'],pair],
    [['S9-0','C9-0','D9-0'],['S8-0','H8-0','C8-0','D8-0']],
    [['SA-0','CA-0','H5-0'],['JSJ-0','JSJ-1','JBJ-0','JBJ-1']],
  ]) {
    const game=position(own,target)
    assert.equal(canAutoPass(game),true)
    const passed=autoPass(game)
    assert.equal(passed.events[0].kind,'pass')
    assert.deepEqual(passed.hands,game.hands)
  }
})

test('any playable subset, wildcard response, straight flush or bomb leaves the decision to the player',()=>{
  for (const [own,target] of [
    [['S9-0','C9-0','D9-0'],['S8-0','H8-0']],
    [['SA-0','CA-0','H5-0','S3-0'],['SK-0','HK-0','CK-0']],
    [['S9-0','C9-0','D9-0','H9-0','S3-0'],['SA-0','CA-0']],
    [['S6-0','S7-0','S8-0','S9-0','S10-0','D3-0'],['SK-0','HK-0','CK-0','DK-0']],
    [['JSJ-0','JSJ-1','JBJ-0','JBJ-1','D3-0'],['SA-0','CA-0','DA-0','HA-0']],
  ]) {
    const game=position(own,target)
    assert.equal(canAutoPass(game),false)
    assert.equal(autoPass(game),game)
  }
})
