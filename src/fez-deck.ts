const suits = ['S', 'H', 'C', 'D']
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

// The two physical decks share one print atlas, laid out in nine columns and six rows.
export function cardFaceIndex({suit,rank}: {suit:string; rank:string}) {
  if (suit === 'J') return rank === 'BJ' ? 53 : 52
  return suits.indexOf(suit) * 13 + ranks.indexOf(rank)
}
