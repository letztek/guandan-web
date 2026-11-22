import assert from 'node:assert/strict'
import { startMatch, takeTurn } from '../../src/match.ts'
import { deck, interpret, power, wild } from '../../src/rules.ts'

// A complete, legal deal at level 2. The NPC sits opposite the human at seat 2.
// Only the ownership of the table's full house, the pass and the remaining
// hand counts change between the two public decisions; the same faces are out.
export function tenCardGame(situation = 'block', rotation = 0, opponentCount = 10) {
  assert.ok(['block','yield'].includes(situation))
  assert.ok(opponentCount>=5 && opponentCount<=11)
  const stock = deck(), level = '2'
  function draw(faces) {
    return faces.split(' ').map(face => {
      const index = stock.findIndex(card => card.suit + card.rank === face)
      assert.notEqual(index, -1, face)
      return stock.splice(index, 1)[0]
    })
  }
  const actor = draw('SK HK DK S8 C8 D3 H7 SJ')
  const threat = draw('S3 C4 D5 H6 C7 H9 C9 D9 D4 S4')
  const mate = draw('HA C3 H4 SJ HK DA D5 D6')
  const other = draw('H10 D10 H3 C6 S6 H7 D7 CK SA DQ CJ HJ')
  const target = draw('SQ HQ CQ S6 H6')
  const holder = ((situation === 'block' ? 1 : 0) + rotation)%4
  if (threat.length>opponentCount) other.push(...threat.splice(opponentCount))
  if (threat.length<opponentCount) threat.push(other.pop())
  if (situation === 'yield') other.push(...mate.splice(1))
  const ending = [mate,threat,actor,other]
  const hands = Array.from({length:4},(_,seat)=>[...ending[(seat-rotation+4)%4]])
  hands[holder].push(...target)

  // Reconstruct the earlier tricks instead of revealing anyone's held cards.
  // Each player sheds their spare singles in descending order. The next seat
  // can win the last (lowest) single and begin its own set of leads.
  const prior = hands.map(hand=>stock.splice(0,27-hand.length).sort((a,b)=>power(b.rank,level)-power(a.rank,level)))
  const first = (holder+1)%4
  const cut = prior[first].find(c=>c.suit!=='J' && !wild(c,level))
  const start = (power(cut.rank,'')-1)%4
  const deal = hands.map((hand,s)=>[...hand,...prior[s]])
  const pack = Array.from({length:27},(_,i)=>
    [0,1,2,3].map(n=>deal[(start+n)%4][i])).flat()
  const eligible = pack.filter(card=>card.suit!=='J' && !wild(card,level))
  let game = startMatch(pack,()=>(eligible.indexOf(cut)+.5)/eligible.length)
  for (let i=0;i<4;i++) {
    const seat = (first+i)%4
    for (const card of prior[seat]) {
      while (game.turn!==seat) game=takeTurn(game,game.turn,null)
      const single=interpret([card],level,game.target)
      assert.ok(single)
      game=takeTurn(game,seat,single)
    }
  }
  while (game.turn!==holder) game=takeTurn(game,game.turn,null)
  game=takeTurn(game,holder,interpret(target,level,null))
  if (situation==='yield') game=takeTurn(game,game.turn,null)
  return game
}
