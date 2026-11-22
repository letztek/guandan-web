import * as THREE from 'three'

type Card = {rank:string; suit:string}
const tau=Math.PI*2

function paint(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  draw(ctx)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export function paintCard(card?: Card) {
  return paint(192, 272, ctx => {
    const border = (m: number, line: number, color: string) => {
      ctx.lineWidth = line; ctx.strokeStyle = color
      ctx.beginPath(); ctx.roundRect(m, m, 192-2*m, 272-2*m, 10); ctx.stroke()
    }
    if (card) {
      ctx.fillStyle = '#f9edcf'; ctx.fillRect(0, 0, 192, 272)
      border(5, 3, '#b69d70')
      const suit = ({S:'♠',H:'♥',D:'♦',C:'♣',J:'✦'} as Record<string,string>)[card.suit] || '✦'
      ctx.fillStyle = ['H','D'].includes(card.suit) || card.rank === 'BJ' ? '#aa3d32' : '#1b3936'
      const rank = card.rank === 'BJ' || card.rank === 'SJ' ? '★' : card.rank
      ctx.font = 'bold 50px Georgia,serif'; ctx.textAlign = 'left'; ctx.fillText(rank, 14, 54)
      ctx.font = '32px Georgia,serif'; ctx.fillText(suit, 17, 86)
      ctx.textAlign = 'center'; ctx.font = '95px Georgia,serif'; ctx.fillText(suit, 96, 167)
      ctx.translate(192, 272); ctx.rotate(Math.PI); ctx.textAlign = 'left'; ctx.font = 'bold 43px Georgia,serif'; ctx.fillText(rank, 14, 50)
      return
    }
    ctx.fillStyle = '#203a37'; ctx.fillRect(0, 0, 192, 272)
    border(5, 5, '#e6cca0'); border(13, 1.7, '#c19b58')
    ctx.strokeStyle = '#587168'; ctx.lineWidth = 1.8
    for (let j = -270; j < 480; j += 24) {
      ctx.beginPath(); ctx.moveTo(j, 18); ctx.lineTo(j+140, 254); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(j, 18); ctx.lineTo(j-140, 254); ctx.stroke()
    }
    ctx.save(); ctx.translate(96, 136); ctx.rotate(Math.PI / 4)
    ctx.fillStyle = '#293e34'; ctx.fillRect(-45, -45, 90, 90)
    ctx.strokeStyle = '#e0b875'; ctx.lineWidth = 2.8; ctx.strokeRect(-44,-44,88,88); ctx.restore()
    ctx.fillStyle = '#e3c388'
    ctx.beginPath(); ctx.moveTo(96, 90); ctx.quadraticCurveTo(101,129,127,136)
    ctx.quadraticCurveTo(101,142,96,179); ctx.quadraticCurveTo(90,144,64,136)
    ctx.quadraticCurveTo(90,129,96,90); ctx.fill()
    ctx.fillStyle='#3b5143'; ctx.beginPath(); ctx.arc(96,136,6,0,tau); ctx.fill()
    for(const [x,y] of [[26,27],[166,27],[26,245],[166,245]]) {
      ctx.fillStyle = '#eccf96'; ctx.beginPath(); ctx.arc(x,y,4,0,tau); ctx.fill()
    }
    border(5,4,'#dfc49a')
  })
}

