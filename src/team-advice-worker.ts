import { teamSuggestion } from './team-coach'
import type { TeamAdviceInput } from './match'

self.onmessage = ({data}: {data: TeamAdviceInput}) => {
  const {hand, level, target, table, strength, style} = data
  self.postMessage(teamSuggestion(hand, level, target, table, strength, style))
}
