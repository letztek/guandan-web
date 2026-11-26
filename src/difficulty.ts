export const difficultyNames = {beginner:'入門',standard:'標準',advanced:'進階',master:'大師'} as const
export type Difficulty = keyof typeof difficultyNames
// 大師 plays a learned model shipped as public/model/master.*; a build without
// the model offers the other levels only.
export const masterAvailable = import.meta.env?.VITE_MASTER_MODEL === true
export function offeredDifficulties(): Difficulty[] {
  return (Object.keys(difficultyNames) as Difficulty[]).filter(value => value !== 'master' || masterAvailable)
}
export type BotSide = 'ally' | 'opponents'
export type BotStrengths = Record<BotSide,Difficulty>
export const strengthKeys = {ally:'guandan.strength.ally',opponents:'guandan.strength.opponents'} as const
const sides = ['ally','opponents'] as const
const unsaved = new Map<BotSide,Difficulty>()

export function difficultyForSeat(seat:number, strengths:BotStrengths): Difficulty {
  if (seat===0) return 'standard' // The player's coach keeps its multi-trick strategy.
  return seat===2 ? strengths.ally : strengths.opponents
}

function readStrength(side:BotSide):Difficulty {
  const temporary=unsaved.get(side)
  if (temporary) return temporary
  try {
    const value=window.localStorage.getItem(strengthKeys[side])
    if (value==='master' && !masterAvailable) return 'advanced'
    if (value && Object.hasOwn(difficultyNames,value)) return value as Difficulty
  } catch { /* Settings still work for this visit. */ }
  return 'standard'
}

export function readStrengths():BotStrengths {
  return {ally:readStrength('ally'),opponents:readStrength('opponents')}
}

export function saveStrength(side:BotSide,value:Difficulty) {
  try {
    window.localStorage.setItem(strengthKeys[side],value)
    unsaved.delete(side)
  } catch {unsaved.set(side,value)}
}

export function isStrengthKey(key:string|null) {
  return key===null || sides.some(side=>key===strengthKeys[side])
}
