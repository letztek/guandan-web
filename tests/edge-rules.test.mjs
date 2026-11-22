import assert from 'node:assert/strict'
import test from 'node:test'
import { allMoves, beats, deck, interpret, uid } from '../src/rules.ts'
import { startMatch, takeTurn } from '../src/match.ts'
import { levelSelectionHint } from '../src/level-selection.ts'

test('every physical card in both decks has its own identifier', () => {
  const pack = deck()
  assert.equal(new Set(pack.map(card => card.id)).size, 108)
  const sevens = pack.filter(card => card.suit === 'S' && card.rank === '7')
  assert.equal(interpret([sevens[0], sevens[0]], '2', null), null)
  assert.equal(interpret(sevens, '2', null).kind, 'pair')
})

test('77 88 and two heart-level wilds have three legal six-card declarations', () => {
  const pack = deck()
  const cards = ['S7-0','D7-0','S8-0','C8-0','H2-0','H2-1']
    .map(id => pack.find(card => card.id === id))
  const choices = allMoves(cards, '2', true)
  assert.deepEqual(
    choices.map(choice => [choice.kind, choice.label]).sort(),
    [['pairs','6·7·8'], ['pairs','7·8·9'], ['steel','7·8']].sort()
  )
  const target = choices.find(choice => choice.label === '6·7·8')
  assert.deepEqual(choices.filter(choice => beats(choice, target)).map(choice => choice.label), ['7·8·9'])
})

test('at level five the match accepts AA and the heart five over three kings and records it as three aces', () => {
  const pack = deck()
  const cards = ids => ids.map(id=>pack.find(c=>c.id===id))
  const aces = cards(['SA-0','CA-0'])
  const [heart, natural] = cards(['H5-0','D5-0'])
  const kings = cards(['CK-0','SK-0','DK-0'])
  const state = {...startMatch(pack,()=>0), level:'5', turn:3,
    hands:[[...aces,heart,natural],cards(['C3-0']),cards(['C4-0']),[...kings,...cards(['D6-0'])]]}
  const target = interpret(kings,'5',null)
  const response = takeTurn(state,3,target)
  const declared = interpret([...aces,heart],'5',response.target)
  assert.equal(declared.kind,'triple')
  const played = takeTurn(response,0,declared)
  assert.equal(played.target.label, 'A × 3')
  assert.deepEqual(played.target.as, {[uid(heart)]:'A'})
  assert.deepEqual(played.hands[0], [natural])

  const invalid = [...aces,natural]
  assert.equal(interpret(invalid,'5',null),null)
  assert.throws(()=>takeTurn(response,0,{...declared,cards:invalid}), /不符合牌型/)
  assert.match(levelSelectionHint(invalid,'5',target), /♦5.*♥5/)

  const pair = interpret(kings.slice(0,2),'5',null)
  const followingPair = takeTurn(state,3,pair)
  assert.equal(interpret([...aces,heart],'5',pair),null)
  assert.throws(()=>takeTurn(followingPair,0,declared), /無法壓過/)
  assert.match(levelSelectionHint([...aces,heart],'5',pair), /三張 A.*對子/)
})
