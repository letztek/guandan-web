// Report on duplicate.ts output. For each card set, compares how our team and
// the bot team played the very same cards.
//   node --experimental-strip-types tools/arena/dup-report.ts dup/*.jsonl
//   node --experimental-strip-types tools/arena/dup-report.ts dup/*.jsonl --show 12   (one deal, both tables)
import { readFileSync } from 'node:fs'
import type { HandRecord, Step } from './table.ts'

type Row = HandRecord & {deal: number, bot: string, ours: number, ourScore: number}
const files = process.argv.slice(2).filter(a => !a.startsWith('--') && !/^\d+$/.test(a))
const showAt = process.argv.indexOf('--show')
const rows: Row[] = files.flatMap(f => readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)))
const team = (seat: number) => seat % 2
const isPass = (s: Step) => s.action[0] === 'PASS'

// Behaviour of the team holding card set T in one played hand.
function metrics(r: Row, T: number) {
  const steps = r.steps.filter(s => team(s.seat) === T)
  const opp = (s: Step) => s.counts.filter((_, i) => team(i) !== T)
  const minOpp = (s: Step) => Math.min(...opp(s).filter(n => n > 0))
  const partnerSeatsOut = (s: Step) => s.counts.filter((n, i) => team(i) === T && n === 0).length
  return {
    first: Number(r.firstTeam === T),
    double: Number(r.firstTeam === T && team(r.order[1]) === T),
    doubledDown: Number(r.firstTeam !== T && team(r.order[1]) !== T),
    last: Number(team(r.order[3]) === T),
    score: (r.firstTeam === T ? 1 : -1) * r.gain,
    leads: steps.filter(s => !s.target).length,
    tricksPlayed: steps.filter(s => !isPass(s)).length,
    overPartner: steps.filter(s => s.holder === 'partner' && !isPass(s) && !s.finished).length,
    bombOverPartner: steps.filter(s => s.holder === 'partner' && s.bomb && !s.finished).length,
    bombs: steps.filter(s => s.bomb).length,
    earlyBombs: steps.filter(s => s.bomb && minOpp(s) > 10).length,
    bombsVsShort: steps.filter(s => s.bomb && minOpp(s) <= 5).length,
    letShortOppRun: steps.filter(s => s.holder === 'opponent' && isPass(s) && s.couldBeat && s.counts[s.holderSeat] <= 5).length,
    letShortOppRunNoBombNeeded: steps.filter(s => s.holder === 'opponent' && isPass(s) && s.couldBeatWithoutBomb && s.counts[s.holderSeat] <= 5).length,
    passedFollowable: steps.filter(s => s.holder === 'opponent' && isPass(s) && s.couldBeatWithoutBomb).length,
    bigSingleLeads: steps.filter(s => !s.target && s.action[0] === 'Single').length,
    leadsAfterPartnerOut: steps.filter(s => !s.target && partnerSeatsOut(s) > 0).length,
    restBombs: r.restBombs.filter((_, i) => team(i) === T).reduce((a, b) => a + b, 0),
    restCards: r.rest.filter((_, i) => team(i) === T).reduce((a, h) => a + h.length, 0),
    firstOutTrick: r.steps.findIndex(s => s.finished),
  }
}
type M = ReturnType<typeof metrics>

// Pair up: deal × card set → our play and the bots' play.
const byDeal = new Map<string, {ours?: M, bots?: M, oursRow?: Row, botsRow?: Row}>()
for (const r of rows) {
  for (const T of [0, 1]) {
    const key = r.bot + '#' + r.deal + '#' + T
    const entry = byDeal.get(key) ?? {}
    if (T === r.ours) {entry.ours = metrics(r, T); entry.oursRow = r} else {entry.bots = metrics(r, T); entry.botsRow = r}
    byDeal.set(key, entry)
  }
}
const pairs = [...byDeal.entries()].filter(([, e]) => e.ours && e.bots)

if (showAt > 0) {
  const deal = Number(process.argv[showAt + 1])
  for (const r of rows.filter(r => r.deal === deal)) {
    console.log(`\n=== deal ${deal} (${r.bot}), level ${r.level}: OUR team on seats ${r.ours}/${r.ours + 2}; order ${r.order.join(',')}; our score ${r.ourScore}`)
    for (const s of r.steps) {
      const who = (s.ours ? 'ours ' : 'bot  ') + 'S' + s.seat
      const act = isPass(s) ? 'pass' : s.action[0] + ' ' + s.action[1] + ' [' + (s.action[2] as string[]).join(' ') + ']'
      const note = [s.holder === 'partner' && !isPass(s) ? 'OVER PARTNER' : '', s.bomb ? 'BOMB' : '',
        isPass(s) && s.couldBeatWithoutBomb && s.holder === 'opponent' ? 'could follow' : '',
        isPass(s) && s.couldBeat && !s.couldBeatWithoutBomb && s.holder === 'opponent' ? 'had bomb' : ''].filter(Boolean).join(', ')
      console.log(`${who} [${s.counts.join(' ')}] ${s.target ? 'vs ' + s.target.padEnd(14) : 'LEAD'.padEnd(17)} ${act}${note ? '   <- ' + note : ''}`)
    }
    console.log('rest:', r.rest.map((h, i) => `S${i}: ${h.join(' ')}`).join(' | '))
  }
  process.exit(0)
}

const keys = Object.keys(pairs[0][1].ours!) as (keyof M)[]
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
function table(title: string, subset: typeof pairs) {
  console.log(`\n### ${title} (${subset.length} card sets)`)
  console.log('| metric (per hand, same cards) | ours | bots | ours − bots |')
  console.log('|---|---|---|---|')
  for (const k of keys) {
    const o = mean(subset.map(([, e]) => e.ours![k])), b = mean(subset.map(([, e]) => e.bots![k]))
    console.log(`| ${k} | ${o.toFixed(2)} | ${b.toFixed(2)} | ${(o - b >= 0 ? '+' : '') + (o - b).toFixed(2)} |`)
  }
}
for (const bot of [...new Set(rows.map(r => r.bot))]) {
  const mine = pairs.filter(([k]) => k.startsWith(bot + '#'))
  const deals = new Set(mine.map(([k]) => k.split('#')[1]))
  const dup = [...deals].map(d => rows.filter(r => r.bot === bot && r.deal === Number(d)).reduce((a, r) => a + r.ourScore, 0))
  const sd = Math.sqrt(mean(dup.map(x => (x - mean(dup)) ** 2)))
  console.log(`\n## ${bot}: duplicate score ${mean(dup).toFixed(2)} ± ${(1.96 * sd / Math.sqrt(dup.length)).toFixed(2)} levels per deal (${dup.length} deals; + means we play the same cards better)`)
  table('all card sets', mine)
  table('card sets where the bots scored more with the same cards', mine.filter(([, e]) => e.bots!.score > e.ours!.score))
  const swings = mine.map(([k, e]) => ({deal: k.split('#')[1], set: k.split('#')[2], swing: e.bots!.score - e.ours!.score}))
    .sort((a, b) => b.swing - a.swing).slice(0, 12)
  console.log('\nbiggest swings against us (deal/card set: levels):', swings.map(s => `${s.deal}/${s.set}: ${s.swing}`).join(', '))
}
