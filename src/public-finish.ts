import { unseenCards } from './partner-tactics.ts'
import { allMoves, beats, names, power, remaining, type Card, type Move } from './rules.ts'
import type { PublicTable } from './team-coach.ts'

// For a proof of control, assume every unknown card could be at each seat.
// This overestimates what the seat can hold, so seeing no reply is conclusive.
function controlsFromPublicCards(hand: Card[], level: string, table: PublicTable) {
  const unseen = unseenCards(hand, table)
  const unknownMoves = allMoves(unseen, level)
  const replies = table.counts.flatMap((count, seat) => {
    if (seat === table.seat || !count) return []
    const shown = table.shown[seat].map((card, index) => ({...card, id:'shown-' + index}))
    const possible = !shown.length ? unknownMoves :
      allMoves(shown.length === count ? shown : shown.concat(unseen), level)
    return possible.filter(move => move.cards.length <= count)
  })
  return (move: Move) => !replies.some(reply => beats(reply, move))
}

function describePlay(move: Move) {
  return names[move.kind] + ' ' + move.label
}

function compareControl(a: Move, b: Move) {
  return beats(a,b) ? 1 : beats(b,a) ? -1 : a.value-b.value
}

export function publicFinish(hand: Card[], level: string, target: Move | null, table: PublicTable, legal: Move[]) {
  const mate = (table.seat + 2) % 4
  if (hand.length > 8 || legal.length === 0 || (target && table.holder === mate)) return null
  const controls = controlsFromPublicCards(hand, level, table)
  // Prefer a shorter route. For equally short routes use the smallest play
  // that can secure the same lead, so a stronger play can be kept until later.
  const starts = legal.filter(controls).sort(compareControl)
  let plan: Move[] | undefined
  for (const start of starts) {
    const left = remaining(hand, start)
    const finish = allMoves(left, level, true)[0]
    if (finish) {
      plan = [start, finish]
      break
    }
    if (plan) continue
    for (const next of allMoves(left, level).sort(compareControl)) {
      if (!controls(next)) continue
      const last = allMoves(remaining(left, next), level, true)[0]
      if (last) {
        plan = [start, next, last]
        break
      }
    }
  }
  if (!plan) return null

  const [first, next, last] = plan
  const spentSmallJokers = table.played.filter(card => card.rank === 'SJ').length === 2 &&
    plan.slice(0, -1).some(move => ['single', 'pair'].includes(move.kind) && move.value < power('SJ', level))
  const order = '先出' + describePlay(first) + '收圈，' + (last
    ? '再由' + describePlay(next) + '守住下一圈，最後領出' + describePlay(last)
    : '下一圈領出' + describePlay(next))
  const goal = !table.finish.length ? '，替我方拿頭游。' :
    table.finish[0] === mate ? (table.finish.length === 1 ? '，我方就能包辦頭游、二游。' : '，替我方守住三游。') : '，出完全部餘牌。'
  return {move:first, reason:(spentSmallJokers ? '兩張小王都已出過。' : '') +
    '依已出牌、明牌與餘張，能連續保住牌權。' + order + goal}
}
