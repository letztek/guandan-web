import { controlCost, preferredFullHouses } from './control-cost.ts'

export const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']
export const suits = ['S','H','C','D']
export const symbols: Record<string,string> = {S:'♠', H:'♥', D:'♦', C:'♣', J:'★'}
export const suitNames: Record<string,string> = {S:'黑桃', H:'紅心', D:'方塊', C:'梅花', J:''}
export const names: Record<string,string> = {single:'單張', pair:'對子', triple:'三張', full:'三帶對', straight:'順子', pairs:'三連對', steel:'鋼板', bomb:'炸彈', flush:'同花順', kings:'四王'}
export type Card = {id:string, rank:string, suit:string}
export type Move = {kind:string, value:number, cards:Card[], as:Record<string,string>, label:string}
export type Advice = {move:Move, reason:string}
export function deck():Card[] {
  return [0,1].flatMap(copy=>[...suits.flatMap(suit=>ranks.map(rank=>({suit,rank,id:suit+rank+'-'+copy}))),...['SJ','BJ'].map(rank=>({suit:'J',rank,id:'J'+rank+'-'+copy}))])
}
export function deal():Card[] {
  const cards=deck()
  for(let i=cards.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]]}
  return cards.slice(0,27)
}
export const exampleIds=['S7-0','H7-0','C8-0','D8-0','S9-0','C9-0','HJ-0','SJ-0']
// Joker identifiers have a separate prefix from an ordinary spade jack.
export function uid(card:Card){return card.suit+':'+card.id}
export function initialHand(){return exampleIds.map(id=>deck().find(c=>c.suit!=='J' && c.id===id)!)}
export function initialTarget(){return deck().filter(c=>c.rank==='6'&&['H','S'].includes(c.suit)&&c.id.endsWith('-0'))}
export function power(rank:string,level:string){return rank==='BJ'?18:rank==='SJ'?17:rank===level?16:ranks.indexOf(rank)+2}
export function wild(c:Card,level:string){return c.suit==='H' && c.rank===level}
export function face(c:Card){return c.rank==='SJ'?'小王':c.rank==='BJ'?'大王':c.rank}
export function describe(cards:Card[]){return cards.map(c=>c.suit==='J'?face(c):symbols[c.suit]+c.rank).join(' ')}
function order(move:Move){if(move.kind==='kings')return 99;if(move.kind==='flush')return 5.5;return move.kind==='bomb'?move.cards.length:0}
export function beats(move:Move,target:Move|null){if(!target)return true
  const a=order(move), b=order(target)
  return a!==b?a>b:move.kind===target.kind && move.value>target.value
}
export function allMoves(hand:Card[],level:string,exact=false):Move[] {
  const found:Move[]=[]
  const wilds=hand.filter(c=>wild(c,level))
  const normal=new Map<string,Card[]>()
  for(const c of hand)if(!wild(c,level)){const a=normal.get(c.rank)||[];a.push(c);normal.set(c.rank,a)}
  const keys=new Set<string>()
  function add(kind:string,value:number,cards:Card[],as:Record<string,string>,label:string){
    if(exact&&cards.length!==hand.length)return
    const key=[kind,value,label,cards.map(uid).sort().join(',')].join('/')
    if(!keys.has(key)){keys.add(key);found.push({kind,value,cards,as,label})}
  }
  function build(kind:string,value:number,requirements:[string,number][],label:string,suit?:string){
    const count=requirements.reduce((n,r)=>n+r[1],0)
    if(count>hand.length || (exact&&hand.length!==count))return
    const picked:Card[]=[],as:Record<string,string>={}
    let used=0
    for(const [rank,n] of requirements){
      const pool=normal.get(rank)||[]
      const natural=(suit?pool.filter(c=>c.suit===suit):pool).slice(0,n)
      picked.push(...natural)
      for(let i=natural.length;i<n;i++){
        if(used===wilds.length || rank==='SJ' || rank==='BJ')return
        const c=wilds[used++];picked.push(c)
        if(rank!==level || (suit && suit!=='H'))as[uid(c)]=(suit?symbols[suit]:'')+rank
      }
    }
    if(used===count && requirements[0][0]!==level)return
    if(kind==='straight' && !used && picked.every(c=>c.suit===picked[0].suit)){
      const index=picked.findIndex(c=>(normal.get(c.rank)||[]).some(other=>other.suit!==c.suit))
      if(index<0)return
      picked[index]=normal.get(picked[index].rank)!.find(c=>c.suit!==picked[index].suit)!
    }
    add(kind,value,picked,as,label)
  }
  const allRanks=[...ranks,'SJ','BJ']
  for(const rank of allRanks){
    const rankName=rank==='BJ'?'大王':rank==='SJ'?'小王':rank
    const pool=normal.get(rank)||[]
    const single=pool[0] || (rank===level?wilds[0]:undefined)
    if(single)add('single',power(rank,level),[single],{},rankName)
    for(let n=2;n<=Math.min(10,pool.length+wilds.length);n++)build(n===2?'pair':n===3?'triple':'bomb',power(rank,level),[[rank,n]],rankName+' × '+n)
  }
  for(const r of ranks){
    if((normal.get(r)?.length||0)+wilds.length<3)continue
    for(const p of allRanks)if(p!==r)build('full',power(r,level),[[r,3],[p,2]],r+' 帶 '+(p==='SJ'?'小王':p==='BJ'?'大王':p))
  }
  const chain=['A',...ranks]
  for(const [kind,length,n] of [['straight',5,1],['pairs',3,2],['steel',2,3]] as const){
    for(let i=0;i<=chain.length-length;i++){
      const run=chain.slice(i,i+length), needs=run.map(r=>[r,n] as [string,number])
      const label=run.join('·')
      build(kind,i,needs,label)
      if(kind==='straight')for(const s of suits)build('flush',i,needs,symbols[s]+' '+label,s)
    }
  }
  const jokers=hand.filter(c=>c.suit==='J')
  if(jokers.length===4)add('kings',20,jokers,{},'四王')
  return found
}
export function interpret(cards:Card[],level:string,target:Move|null){
  if(new Set(cards.map(uid)).size!==cards.length)return null
  return allMoves(cards,level,true).filter(m=>beats(m,target)).sort((a,b)=>order(b)-order(a)||b.value-a.value)[0]||null
}
export function remaining(hand:Card[],m:Move){const used=new Set(m.cards.map(uid));return hand.filter(c=>!used.has(uid(c)))}
function richness(m:Move){return m.cards.length*2+(m.kind==='bomb'||m.kind==='flush'?6:0)+(m.kind==='kings'?10:0)}
export function coach(hand:Card[],level:string,target:Move|null,options:Move[]):Advice[] {
  const legal=options.filter(m=>beats(m,target))
  const candidates=preferredFullHouses(legal,hand,level)
  // Analyze the most promising representatives and protect whole bombs and long groups.
  function quick(m:Move){
    if(m.cards.length===hand.length)return 1500
    const taken=new Set(m.cards.map(uid))
    const disrupted=options.filter(o=>['bomb','flush','pairs','steel','straight'].includes(o.kind)&&o.cards.some(c=>taken.has(uid(c)))&&!o.cards.every(c=>taken.has(uid(c))))
    return m.cards.length*4 - (target?order(m)*9:0) - m.value*.08 - Object.keys(m.as).length*2 - controlCost(m,level) - disrupted.reduce((n,o)=>Math.max(n,richness(o)),0)
  }
  const shortlist=candidates.map(move=>({move,score:quick(move)})).sort((a,b)=>b.score-a.score).slice(0,24)
  const ranked=shortlist.map(({move,score})=>{
    const rest=remaining(hand,move)
    let reason:string
    if(!rest.length){reason='這手可以打完全部餘牌。'}
    else{
      const future=allMoves(rest,level).sort((a,b)=>
        (richness(b)-controlCost(b,level))-(richness(a)-controlCost(a,level)))
      const best=future[0], finish=future.find(m=>m.cards.length===rest.length)
      if(finish){score+=150;reason='保留'+names[finish.kind]+' '+finish.label+'，下次領出時可一手走完。'}
      else if(best&&best.cards.length>=3){score+=richness(best)*.38;reason='餘牌仍有'+names[best.kind]+'（'+best.label+'），保留下一輪的組合。'}
      else reason=target?'能壓過桌面的'+names[target.kind]+'，出完還剩 '+rest.length+' 張。':'可以領出這組牌，出完還剩 '+rest.length+' 張。'
      if ((move.kind==='triple'||move.kind==='full') && !controlCost(move,level) && rest.filter(c=>c.rank===level).length>=2 &&
          legal.some(m=>m.kind==='full' && m.value===move.value && m.cards.slice(3).every(c=>c.rank===level))) {
        const kept='留下兩張級牌 '+level+'，以後可以用對子接牌。'
        if (move.kind==='full') reason='三帶對比較三張的點數，帶 '+describe(move.cards.slice(3))+' 就能'+(target?'壓過這手。':'打出同樣大小的葫蘆。')+kept
        else reason='這圈可以單出三張（'+move.label+'）。'+kept
      }
    }
    return {move,reason,score}
  }).sort((a,b)=>b.score-a.score)
  // Changing just the pair does not change which full houses this can beat.
  // Keep the best-scoring attachment in coaching; all declarations stay in the hand browser.
  return ranked.filter((entry,i)=>entry.move.kind!=='full' ||
    ranked.findIndex(other=>other.move.kind==='full' && other.move.value===entry.move.value)===i).slice(0,3)
}
