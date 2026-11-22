import { names, symbols, wild, type Card, type Move } from './rules.ts'

// Called when a selection cannot be played. Explain the common attempt to
// complete a natural pair with the level card the player actually selected.
export function levelSelectionHint(cards: Card[], level: string, target: Move|null) {
  if (cards.length !== 3) return null
  const levelCard = cards.find(card => card.rank === level)
  if (!levelCard) return null
  const pair = cards.filter(card => card.rank !== level)
  if (pair.length !== 2 || pair[0].rank !== pair[1].rank || pair[0].suit === 'J') return null
  const rank = pair[0].rank
  if (!wild(levelCard, level)) {
    return symbols[levelCard.suit]+level+' 只能當 '+level+'。要把一對 '+rank+' 補成三張，需用同點數的牌或 ♥'+level+'。'
  }
  if (!target) return null
  const mapping = '♥'+level+' 代 '+rank+'，這手是三張 '+rank+'。'
  if (target.kind === 'pair') return mapping+'桌面是對子，跟對子時請只選兩張。'
  if (target.kind === 'triple') return mapping+'點數要大於桌面的 '+target.label+' 才能跟牌。'
  return mapping+'三張無法壓過桌面的'+names[target.kind]+'。'
}
