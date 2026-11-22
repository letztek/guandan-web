import { allMoves, beats } from './rules.ts'
import { takeTurn, type Match } from './match.ts'

export const automaticPassText = '自動過牌（整手無法跟牌）'

export function canAutoPass(game: Match) {
  if (game.phase !== 'play' || game.turn !== 0 || !game.hands[0].length ||
      !game.target || game.pending[0] !== 0) return false
  return !allMoves(game.hands[0], game.level).some(move => beats(move, game.target))
}

export function autoPass(game: Match): Match {
  if (!canAutoPass(game)) return game
  const next = takeTurn(game, 0, null)
  const events = [...next.events]
  events[game.events.length] = {...events[game.events.length], text: automaticPassText}
  return {...next, events}
}
