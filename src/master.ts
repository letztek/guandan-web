// 大師: the learned move scorer chooses; the explanation comes afterwards from
// the rule-based player, so a player still sees why a play makes sense.
// The scorer was trained on DanLM self-play (github.com/dashidhy/DanLM); see
// public/model/NOTICE.md. It ignores table temperament: one fixed style.
import { partner, type Match } from './match.ts'
import { names, remaining, type Move } from './rules.ts'
import type { MoveScorer } from './move-scorer.ts'
import type { quickTeamSuggestion } from './team-coach.ts'

type TeamAdvice = ReturnType<typeof quickTeamSuggestion>
const bombs = ['bomb', 'flush', 'kings']
const sameMove = (a: Move | null, b: Move | null) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.label === b.label && a.cards.length === b.cards.length)
const choiceName = (move: Move | null) => move ? names[move.kind] + ' ' + move.label : '過牌'

// Plain facts about the chosen play, for when it differs from the rule-based choice.
export function masterReason(view: Match, move: Move | null, runnerUp: Move | null | undefined) {
  const seat = view.turn, hand = view.hands[seat]
  const partnerHolds = !!view.target && view.holder === partner(seat)
  let reason: string
  if (!move) {
    reason = partnerHolds ? '隊友目前最大，大師選擇過牌，讓隊友繼續。' : '大師評估後選擇過牌，保留手牌等下一次接手。'
  } else if (move.cards.length === hand.length) {
    reason = '這手可以出完。'
  } else {
    const left = remaining(hand, move).length
    if (partnerHolds) reason = '大師選擇用' + choiceName(move) + '壓過隊友，改由自己掌握下一圈，出完剩 ' + left + ' 張。'
    else if (bombs.includes(move.kind)) reason = '大師判斷這時用' + choiceName(move) + (view.target ? '奪回牌權' : '領出') + '較有利，出完剩 ' + left + ' 張。'
    else reason = '大師選擇' + (view.target ? '用' + choiceName(move) + '壓牌' : '領出' + choiceName(move)) + '，出完剩 ' + left + ' 張。'
  }
  if (runnerUp !== undefined && !sameMove(runnerUp, move)) reason += '其次考慮的是「' + choiceName(runnerUp) + '」。'
  return reason
}

// rules: the advanced player's advice for the same position (its reason and move list).
export function masterAdvice(view: Match, scorer: MoveScorer, rules: TeamAdvice): TeamAdvice & {q: number} {
  const {move, values} = scorer.choose(view)
  const reason = sameMove(rules.move, move) ? rules.reason : masterReason(view, move, values[1]?.move)
  return {move, reason, moves: rules.moves, q: values[0].q}
}
