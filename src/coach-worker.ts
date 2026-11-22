import { allMoves, coach, type Card, type Move } from './rules'
self.onmessage=({data}:{data:{hand:Card[],level:string,target:Move|null}})=>{
  const {hand,level,target}=data
  const moves=allMoves(hand,level)
  self.postMessage({moves,advice:coach(hand,level,target,moves)})
}
