import assert from 'node:assert/strict'
import test from 'node:test'
import { adviceInput, adviseTurn, shufflePack, startMatch, takeTurn } from '../src/match.ts'
import { allMoves, deck, interpret } from '../src/rules.ts'
import { quickTeamSuggestion, teamSuggestion } from '../src/team-coach.ts'

// Recorded table actions, rather than replaying a policy that might change.
function partnerKing() {
  let seed=20261124
  function random() {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0
    return seed/4294967296
  }
  let game=startMatch(shufflePack(random),random)
  const plays=[
    'CA-0 CA-1 DA-0 D2-1 D2-0 S2-1','DK-0 CK-1 SK-0 SA-1 HA-0 DA-1','','','',
    'C2-1 S2-0 H3-0 C3-0 S4-1 H4-0','C3-1 D3-1 C4-1 S4-0 D5-0 H5-1',
    'HQ-1 SQ-0 SK-1 CK-0 HA-1 SA-0','','','','C4-0 H4-1 D4-0 H5-0 S5-0',
    'D7-0 D7-1 H7-1 H3-1 S3-1','D9-1 D9-0 S9-1 S6-1 H6-0',
    'CJ-1 DJ-1 H2-0 DK-1 HK-1','','','','H7-0 C7-1 C7-0','','','','D3-0','S7-0','HK-0','',
  ]
  for (const ids of plays) {
    const cards=game.hands[game.turn].filter(card=>ids.split(' ').includes(card.id))
    const move=cards.length ? interpret(cards,game.level,game.target) : null
    if (ids) assert.ok(move,ids)
    game=takeTurn(game,game.turn,move)
  }
  assert.deepEqual(game.hands.map(h=>h.length),[15,10,12,15])
  assert.equal(game.holder,0)
  assert.equal(game.target.label,'K')
  return game
}

test('Athena keeps the four fives when the partner king still holds, including fast decisions',()=>{
  const game=partnerKing()
  const advice=adviseTurn(game,'advanced','attack')
  assert.equal(advice.move,null)
  assert.match(advice.reason,/過.*炸彈/)
  const {hand,level,target,table}=adviceInput(game,'advanced','attack')
  assert.equal(quickTeamSuggestion(hand,level,target,table,'attack',true).move,null)
})

test('the same bomb immediately takes first when it is the entire hand',()=>{
  const game=partnerKing()
  const {hand,level,target,table}=adviceInput(game,'advanced','attack')
  const bomb=hand.filter(c=>c.rank==='5')
  const finishTable={...table,counts:[15,10,bomb.length,15],
    played:table.played.concat(hand.filter(c=>c.rank!=='5'))}
  const choice=teamSuggestion(bomb,level,target,finishTable,'advanced','attack')
  assert.equal(choice.move?.kind,'bomb')
  assert.equal(choice.move.cards.length,4)
  assert.match(choice.reason,/頭游/)
})

test('a visible last big joker justifies bombing the partner king to prevent first place',()=>{
  const stock=deck()
  const take=id=>stock.splice(stock.findIndex(c=>c.id===id),1)[0]
  const own=['C5-0','S5-0','D5-0','H5-0','S3-0'].map(take)
  const king=take('HK-0'), joker=take('JBJ-0')
  const partner=['S4-0','C6-0'].map(take), other=['S9-0','C8-0'].map(take)
  const target=allMoves([king],'2',true)[0]
  const table={seat:2,holder:0,pending:[2,3],counts:[partner.length,other.length,own.length,1],
    finish:[],played:[king,...stock],shown:[[],[],[],[joker]]}
  const choice=teamSuggestion(own,'2',target,table,'advanced','support')
  assert.equal(choice.move?.kind,'bomb')
  assert.match(choice.reason,/公開的牌.*先攔/)
})
