import test from 'node:test'
import assert from 'node:assert/strict'
import { allMoves, deck, remaining } from '../src/rules.ts'
import { adviceInput, startMatch, takeTurn } from '../src/match.ts'
import { teamSuggestion, quickTeamSuggestion } from '../src/team-coach.ts'

const styles=['support','balanced','attack']
const levels=['beginner','standard','advanced']

function position(nextCount, own=['10','10','Q','Q','Q','A','A'], lead='7',
    short=['9','6'], previous=['8','8','J','J','K','K','5','5','SJ','BJ']) {
  const stock=deck(), level='5'
  const draw=ranks=>ranks.map(rank=>{
    const i=stock.findIndex(c=>c.rank===rank)
    assert.notEqual(i,-1)
    return stock.splice(i,1)[0]
  })
  const hands=[draw(own),draw(short.slice(0,nextCount)),draw([lead,lead,'3','4']),draw(previous)]
  const events=stock.map(card=>({seat:3,kind:'play',trick:1,text:'已出',move:allMoves([card],level,true)[0]}))
  let state={...startMatch(deck(),()=>0),hands,events,level,turn:2,trick:2}
  state=takeTurn(state,2,allMoves(hands[2].slice(0,2),level,true)[0])
  return takeTurn(state,3,null)
}

function suggest(state,style,strength='standard') {
  const {hand,level,target,table}=adviceInput(state)
  return teamSuggestion(hand,level,target,table,strength,style)
}

test('same hand, partner holding a small pair, two cards still concealed downstream',()=>{
  for(const [own,lead,cheap,high] of [
    [['10','10','Q','Q','Q','A','A'],'7','10','A'],
    [['8','8','J','J','J','K','K'],'6','8','K']
  ]) {
    const state=position(2,own,lead)
    for(const strength of levels) {
      const [support,balanced,attack]=styles.map(style=>suggest(state,style,strength))
      assert.equal(support.move,null)
      assert.match(support.reason,/若握有.*對子.*過牌.*領出/)
      assert.ok(balanced.reason.includes('把對 '+high+' 留在手上'))
      for(const [advice,rank] of [[balanced,cheap],[attack,high]]) {
        assert.equal(advice.move.kind,'pair')
        assert.deepEqual(advice.move.cards.map(c=>c.rank),[rank,rank])
        assert.match(advice.reason,/若握有.*對子.*壓過隊友.*若能收圈.*三帶對/)
        assert.ok(allMoves(remaining(state.hands[0],advice.move),state.level,true).some(m=>m.kind==='full'))
        assert.equal(takeTurn(state,0,advice.move).holder,0)
      }
    }
  }
})

test('change the following seat to one card: all styles and strengths leave the teammate on lead',()=>{
  const state=position(1)
  for(const style of styles) {
    const {hand,level,target,table}=adviceInput(state)
    const fallback=quickTeamSuggestion(hand,level,target,table,style)
    assert.equal(fallback.move,null)
    for(const strength of levels) {
      const {move,reason}=suggest(state,style,strength)
      assert.equal(move,null)
      assert.match(reason,/只剩一張.*跟不了.*對子.*隊友收圈/)
      const pass=takeTurn(state,0,move)
      assert.equal(takeTurn(pass,1,null).turn,2)
    }
  }
})

test('styles are invariant to swapping hidden faces and reject no legitimate immediate finish',()=>{
  const state=position(2)
  const hidden=state.hands.slice(1).flat().reverse()
  const rearranged={...state,hands:state.hands.map((h,i)=>i ? hidden.splice(0,h.length) : h)}
  const guarded={...state,hands:state.hands.map((h,i)=>i ? new Proxy(h,{get(t,k) {
    if(k==='length')return t.length
    throw Error('Read private card at seat '+i)
  }}) : h)}
  for(const style of styles) {
    assert.deepEqual(suggest(guarded,style),suggest(rearranged,style))
    const finishing=position(1,['A','A'])
    assert.equal(suggest(finishing,style).move.kind,'pair')
  }
})

test('a publicly revealed winning pair justifies a block even for support',()=>{
  const state=position(2)
  const publicState={...state,events:[...state.events]}
  // Swap two jacks into the short seat, preserving the same public deck.
  const long=[...state.hands[3]]
  const pair=long.filter(c=>c.rank==='J')
  publicState.hands=[state.hands[0],pair,state.hands[2],
    [...long.filter(c=>c.rank!=='J'),...state.hands[1]]]
  for(const card of pair) publicState.events.push({seat:-1,kind:'system',trick:1,text:'明牌',reveal:{to:1,card}})
  for(const style of styles) {
    const {move,reason}=suggest(publicState,style)
    assert.ok(move.value>11)
    assert.match(reason,/公開的牌.*走完.*先攔/)
  }
})

test('an opponent with a publicly known bomb can re-enter on a raise, but not on a pass',()=>{
  const state=position(2,undefined,'7',['9','9'],['J','J','J','J'])
  for (const card of state.hands[3]) state.events.push({seat:-1,kind:'system',trick:1,text:'明牌',reveal:{to:3,card}})
  for (const style of ['balanced','attack']) {
    const {move,reason}=suggest(state,style)
    assert.equal(move,null)
    assert.match(reason,/先前過牌的對手.*重新.*走完/)
  }
})
