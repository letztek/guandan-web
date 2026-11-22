import type { FezModel } from './fez-character'
import type { PlayStyle } from './play-style'

// The standing portraits were rendered with the same orthographic view as the lobby.
export const standingFrame = { height: 2.15, belowFloor: .15, imageAspect: 640 / 768 }

function partner<Id extends FezModel>(rig: Id, name: string, playStyle: PlayStyle, selectionGreeting: 'A' | 'open-palm-invitation', minimumFrameWidth: number) {
  return {
    id: rig,
    rig,
    name,
    playStyle,
    selectionGreeting,
    minimumFrameWidth,
    portrait: `character/${rig}-seat.webp`,
    model: `character/${rig}-seat.glb`,
  } as const
}

export const partners = [
  partner('hanakomachi', '鈴音', 'support', 'A', 1.40),
  partner('high-waitress', '珊迪', 'balanced', 'A', 0),
  partner('athena', '天宮', 'attack', 'open-palm-invitation', 1.40),
] as const

export type PartnerId = (typeof partners)[number]['id']
export const defaultPartnerId: PartnerId = 'hanakomachi'
