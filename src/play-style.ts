export const playStyleLabels = {
  support: '助攻',
  balanced: '穩健留牌',
  attack: '主攻',
} as const

export type PlayStyle = keyof typeof playStyleLabels
