import { partner, teamOf, type Match } from './match.ts'

export type ReactionKind = 'idle' | 'lead' | 'follow' | 'pass' | 'watch' | 'finish'
  | 'win' | 'lose' | 'matchWin' | 'matchLose'
export type TableReaction = { seat: number; kind: ReactionKind; lookAt: number | 'table' | 'hand' }

const visibleSeats = [1, 2, 3]

/** Persistent poses for the currently visible table, including a restored game. */
export function tablePosture(game: Match): TableReaction[] {
  if (game.phase === 'result') {
    const winners = teamOf(game.finish[0])
    return visibleSeats.map(seat => {
      const win = teamOf(seat) === winners
      const kind = game.won ? (win ? 'matchWin' : 'matchLose') : (win ? 'win' : 'lose')
      const lookAt = win || seat === 2 ? partner(seat) : 'table'
      return {seat, kind, lookAt}
    })
  }
  if (game.phase !== 'play') return []
  const posture:TableReaction[]=[]
  if (game.target && game.holder >= 0) {
    const watcher = partner(game.holder)
    if (watcher !== 0 && watcher !== game.turn && game.pending.includes(watcher)) {
      posture.push({seat:watcher,kind:'watch',lookAt:'table'})
    }
  }
  if(game.turn!==0)posture.push({seat:game.turn,kind:game.target?'follow':'lead',lookAt:game.target?'table':'hand'})
  return posture
}

export function startsNewTableHand(previous: Match, current: Match) {
  return current.handNo !== previous.handNo || current.events.length < previous.events.length ||
    (previous.events.length > 0 && current.events[0] !== previous.events[0])
}

/** Read actions from the public log. Hands contribute only their publicly displayed counts. */
export function tableReactions(previous: Match, current: Match): TableReaction[] {
  if (startsNewTableHand(previous, current)) return tablePosture(current)
  const fresh = current.events.slice(previous.events.length)
  const cues: TableReaction[] = []
  function add(seat: number, kind: ReactionKind, lookAt: TableReaction['lookAt']) {
    if (visibleSeats.includes(seat)) cues.push({seat, kind, lookAt})
  }

  for (const event of fresh) {
    if (event.kind === 'pass') add(event.seat, 'pass', current.turn === event.seat ? 'table' : current.turn)
  }
  const played = fresh.filter(event => event.kind === 'play')
  for (const seat of current.finish) {
    if (!previous.finish.includes(seat) && !current.hands[seat].length && played.some(event => event.seat === seat)) {
      add(seat, 'finish', partner(seat))
    }
  }
  const before=tablePosture(previous),after=tablePosture(current)
  for(const pose of after){
    if(!before.some(prior=>prior.seat===pose.seat&&prior.kind===pose.kind&&prior.lookAt===pose.lookAt)){
      cues.push(pose)
    }
  }
  for(const prior of before){
    if(!after.some(pose=>pose.seat===prior.seat)&&!cues.some(cue=>cue.seat===prior.seat)){
      add(prior.seat,'idle','table')
    }
  }
  return cues
}
