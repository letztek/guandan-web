import { allMoves, beats, deck, face, names, power, remaining, wild, type Card, type Move } from './rules.ts'
import type { PublicTable } from './team-coach.ts'
import type { PlayStyle } from './play-style.ts'

const stock = deck()

export function unseenCards(hand: Card[], table: PublicTable) {
  const known = new Map<string, number>()
  for (const card of [...hand, ...table.played, ...table.shown.filter((_, seat) => seat !== table.seat).flat()]) {
    const key = card.suit + card.rank
    known.set(key, (known.get(key) ?? 0) + 1)
  }
  return stock.filter(card => {
    const key = card.suit + card.rank, count = known.get(key) ?? 0
    if (!count) return true
    known.set(key, count - 1)
    return false
  })
}

// For a one- or two-card seat, count the possible final singles/pairs by
// rank. Two physical copies, wild level hearts and any public disclosures
// retain their proper weights. This estimates only the chance to go out now.
function shortFinishes(seat: number, level: string, table: PublicTable, unseen: Card[]) {
  const held = table.shown[seat], count = table.counts[seat]
  const unknown = count - held.length, frequency = new Map<number, number>()
  if (count >= 3 && count <= 10 && unknown === 0) {
    const moves = allMoves(held.map((card,i) => ({...card, id:'shown-'+i})), level, true)
    return (move: Move) => Number(moves.some(finish => beats(finish, move)))
  }
  const groups = new Map<string, {card: Card, copies: number}>()
  if (count < 1 || count > 2 || unknown < 0) return () => 0
  for (const card of unseen) {
    const key = wild(card, level) ? 'wild' : card.rank
    const group = groups.get(key)
    if (group) group.copies++
    else groups.set(key, {card, copies: 1})
  }
  const visible = held.map((card, i) => ({...card, id: 'known-' + i}))
  let weight = 0
  function add(cards: Card[], ways: number) {
    weight += ways
    const [first, second] = cards
    let rank = first.rank
    if (second && first.rank !== second.rank) {
      if (wild(first, level) && second.suit !== 'J') rank = second.rank
      else if (!wild(second, level) || first.suit === 'J') return
    }
    const value = power(rank, level)
    frequency.set(value, (frequency.get(value) ?? 0) + ways)
  }
  if (unknown === 0) add(visible, 1)
  if (unknown === 1) {
    for (const {card, copies} of groups.values()) add([...visible, card], copies)
  }
  if (unknown === 2) {
    const options = [...groups.values()]
    for (let i = 0; i < options.length; i++) {
      const a = options[i]
      if (a.copies > 1) add([a.card, a.card], a.copies * (a.copies - 1) / 2)
      for (const b of options.slice(i + 1)) add([a.card, b.card], a.copies * b.copies)
    }
  }
  return (move: Move) => {
    if (move.kind !== (count === 1 ? 'single' : 'pair') || !weight) return 0
    let winning = 0
    for (const [value, ways] of frequency) if (value > move.value) winning += ways
    return winning / weight
  }
}

// A partner already owns the trick. A pass preserves that claim. Raising
// reopens action even for opponents who passed earlier in the same trick.
export function partnerResponse(hand: Card[], level: string, target: Move | null,
    table: PublicTable, legal: Move[], style: PlayStyle) {
  const mate = (table.seat + 2) % 4
  if (!target || table.holder !== mate || !table.counts[mate]) return null
  const opponents = [(table.seat + 1) % 4, (table.seat + 3) % 4].filter(s => table.counts[s] > 0)
  const waiting = opponents.filter(s => table.pending.slice(1).includes(s))
  const next = table.pending[1]
  if (!waiting.length) return {move:null, reason:'隊友目前最大，你過牌後這圈就結束，下一圈由隊友先出。'}
  if (waiting.every(s => table.counts[s] < Math.min(4, target.cards.length))) {
    const only = waiting.length === 1 && table.counts[waiting[0]] === 1
    return {move:null, reason:(only ? '下家對手只剩一張，跟不了桌上的' : '後續對手的張數都不夠跟桌上的') +
      names[target.kind] + '，也湊不成炸彈。過牌就能讓隊友收圈，下一圈由他先出。'}
  }
  if ((target.kind !== 'single' && target.kind !== 'pair') ||
      !waiting.some(s => table.counts[s] === target.cards.length)) return null

  const unseen = unseenCards(hand, table)
  const risks = new Map(opponents.map(s => [s, shortFinishes(s, level, table, unseen)]))
  const threat = waiting.reduce((a,b) => risks.get(a)!(target) >= risks.get(b)!(target) ? a : b)
  const risk = risks.get(threat)!(target)
  if (!risk) {
    if (waiting.every(s => table.counts[s] <= target.cards.length)) return {move:null,
      reason:'依已出牌、明牌和剩餘張數，後面的對手組不出更大的'+names[target.kind]+'。過牌讓隊友收圈，下一圈由他先出。'}
    return null
  }
  const who = threat === next ? '下家對手' : '後面的對手'
  const size = table.counts[threat] === 2 ? '兩張' : table.counts[threat] === 1 ? '一張' : table.counts[threat]+' 張'
  const certain = risk === 1
  const exposed = table.shown[threat].length === table.counts[threat]
  const warning = who + '剩' + size + (certain
    ? (exposed ? '，公開的牌' : '，依已出牌可確定他') + '能一次走完。'
    : '，若握有更大的' + names[target.kind] + '就能走完。')
  if (style === 'support' && risk < .35 && table.counts[mate] <= 4) {
    return {move:null, reason:warning + '隊友目前最大、只剩 ' + table.counts[mate] +
      ' 張。這手過牌保留他的領出機會，讓他先整理餘牌。'}
  }

  // For an uncertain threat, overtake a partner only with a route to going
  // out on the next lead. Against a certain exit, allow an emergency block.
  let best: {move:Move, danger:number, cost:number, exit:Move|undefined} | undefined
  for (const move of legal) {
    if (!certain && (move.kind !== target.kind || move.cards.some(card => wild(card, level)))) continue
    const danger = Math.max(...opponents.map(s => risks.get(s)!(move)))
    if (danger >= risk) continue
    const left = remaining(hand, move)
    const exit = left.length <= 10 ? allMoves(left, level, true)[0] : undefined
    if (!certain && !exit) continue
    const cost = move.value + (move.kind === target.kind ? 0 : 25) +
      12 * move.cards.filter(c => wild(c, level)).length + (exit ? 0 : 20)
    // A certain exit takes priority for all styles. Otherwise a cautious
    // actor buys the cheapest improvement and an attacker denies more ranks.
    const preferPressure = certain || style === 'attack'
    if (!best || (preferPressure
      ? danger < best.danger || (danger === best.danger && cost < best.cost)
      : cost < best.cost || (cost === best.cost && danger < best.danger))) {
      best = {move, danger, cost, exit}
    }
  }
  if (!best) {
    const reentry = opponents.find(s => !waiting.includes(s) && legal.length &&
      legal.every(m => risks.get(s)!(m) === 1))
    if (reentry !== undefined && risk < 1) return {move:null, reason:warning +
      '這手過牌。若壓過隊友，先前過牌的對手會重新取得跟牌機會，依公開資訊他能直接走完。'}
    return null
  }
  const {move, exit} = best
  const method = certain ? '先攔這次收牌' : style === 'attack' ? '主動把門檻拉高' : '用較省的牌提高門檻'
  let keep = ''
  if (style === 'balanced' && move.kind === 'pair') {
    const left = remaining(hand, move)
    const higherPair = legal.filter(m => m.kind === 'pair' && m.value > move.value &&
      m.cards.every(c => left.includes(c) && c.rank === m.cards[0].rank) &&
      left.filter(c => c.rank === m.cards[0].rank).length === 2).sort((a,b) => b.value-a.value)[0]
    if (higherPair) keep = '把對 ' + face(higherPair.cards[0]) + ' 留在手上。'
  }
  const reason = warning + '用' + names[move.kind] + ' ' + move.label + ' 壓過隊友，' + method + '。' + keep +
    (exit ? '若能收圈，下圈可領出' + names[exit.kind] + ' ' + exit.label + '，一次出完。' : '若能收圈，下圈就由我方領出。')
  return {move, reason}
}
