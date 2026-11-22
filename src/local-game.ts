import { startMatch, type Match } from './match.ts'
import { defaultPartnerId, partners, type PartnerId } from './partner-roster.ts'
import { names, ranks, suits } from './rules.ts'

export const localGameKey = 'guandan.local-match.v1'
const legacyKey = 'guandan.battle.v2'
const autoPassKey = 'guandan.auto-pass-last.v1'
const temporaryAutoPassKey=autoPassKey+'.pending'
type RecordOnDisk = {version:1, id:string, revision:number, savedAt:number, game:Match, partnerId:PartnerId}
export type LocalGame = RecordOnDisk & {storage:'device'|'tab'|'memory'}
type Temporary = {save:RecordOnDisk, base:string|null}
let inMemory: Temporary|null = null
let memoryPreference: {base:string|null,enabled:boolean}|null=null

function object(value: unknown): value is Record<string,unknown> {
  return typeof value==='object' && value!==null && !Array.isArray(value)
}
function integer(value:unknown, min:number, max=Number.MAX_SAFE_INTEGER): value is number {
  return typeof value==='number' && Number.isSafeInteger(value) && value>=min && value<=max
}
const seat = (v:unknown) => integer(v,0,3)
const seatList = (v:unknown) => Array.isArray(v) && v.every(seat) && new Set(v).size===v.length
const rank = (v:unknown) => typeof v==='string' && ranks.includes(v)
function card(v:unknown) {
  return object(v) && typeof v.id==='string' && v.id.length>0 && typeof v.suit==='string' &&
    (v.suit==='J' ? v.rank==='BJ'||v.rank==='SJ' : suits.includes(v.suit)&&rank(v.rank))
}
function move(v:unknown) {
  return object(v) && typeof v.kind==='string' && Object.hasOwn(names,v.kind) && integer(v.value,0) &&
    typeof v.label==='string' && Array.isArray(v.cards) && v.cards.length>0 && v.cards.every(card) &&
    object(v.as) && Object.values(v.as).every(a=>typeof a==='string')
}
function event(v:unknown) {
  if (!object(v) || !integer(v.seat,-1,3) || !integer(v.trick,1) || typeof v.text!=='string') return false
  if (v.kind==='play') return seat(v.seat) && move(v.move)
  if (v.kind==='pass') return seat(v.seat)
  return v.kind==='system' && (v.reveal===undefined || (object(v.reveal) && card(v.reveal.card) &&
    seat(v.reveal.to) && (v.reveal.from===undefined || seat(v.reveal.from))))
}
function gift(v:unknown) {return object(v) && seat(v.from) && (v.to===undefined||seat(v.to)) && card(v.card)}
function match(v:unknown): v is Match {
  if (!object(v) || v.version!==2 || !rank(v.level) || !integer(v.turn,0,3) || !integer(v.holder,-1,3) ||
      !integer(v.owner,-1,1) || !integer(v.trick,1) || !integer(v.handNo,1) || !integer(v.gain,0,3) ||
      typeof v.won!=='boolean' || !Array.isArray(v.scores) || v.scores.length!==2 || !v.scores.every(rank) ||
      !Array.isArray(v.hands) || v.hands.length!==4 || !v.hands.every(hand=>Array.isArray(hand)&&hand.every(card)) ||
      !seatList(v.pending) || !seatList(v.finish) || !Array.isArray(v.events) || !v.events.every(event) ||
      (v.target!==null && (!move(v.target)||v.holder<0))) return false
  if (v.phase==='play') return v.exchange===null && v.hands[v.turn].length>0 &&
    (v.target===null || (Array.isArray(v.pending) && v.pending[0]===v.turn))
  if (v.phase==='result') return Array.isArray(v.finish) && v.finish.length>=2
  const x=v.exchange
  if ((v.phase!=='donate'&&v.phase!=='return') || !object(x) || !seatList(x.winners)||!seatList(x.donors) ||
      !Array.isArray(x.gifts)||!x.gifts.every(gift)||!Array.isArray(x.returned)||!x.returned.every(gift)||!seat(x.leader)) return false
  return Array.isArray(x.winners) && Array.isArray(x.donors) && x.winners.length>0 &&
    x.winners.length===x.donors.length && (v.phase==='donate' ? x.donors.includes(v.turn) :
    x.winners.includes(v.turn) && x.gifts.some(g=>g.to===v.turn))
}
function validRecord(v:unknown): v is RecordOnDisk {
  return object(v) && v.version===1 && typeof v.id==='string' && v.id.length>0 && integer(v.revision,1) &&
    integer(v.savedAt,0) && partners.some(p=>p.id===v.partnerId) && match(v.game)
}

type Store='localStorage'|'sessionStorage'
function read(store:Store,key:string) {
  try {return window[store].getItem(key)} catch {return null}
}
function parse(store:Store,key:string):unknown {
  try {return JSON.parse(read(store,key)??'null')} catch {return null}
}
function write(store:Store,key:string,value:string) {
  try {window[store].setItem(key,value);return true} catch {return false}
}
function remove(store:Store,key:string) {
  try {window[store].removeItem(key)} catch { /* Storage can be disabled mid-game. */ }
}
function checkpoint(save:RecordOnDisk) {return save.id+'/'+save.revision+'/'+save.savedAt}
function diskRecord() {
  const value=parse('localStorage',localGameKey)
  return validRecord(value)?value:null
}
function currentRecord(disk:RecordOnDisk|null):LocalGame|null {
  const base=disk?checkpoint(disk):null
  // A quota-limited tab may have newer moves than its last durable checkpoint.
  const tab=parse('sessionStorage',localGameKey)
  if (inMemory && (!disk || inMemory.base===base)) return {...inMemory.save,storage:'memory'}
  if (object(tab) && validRecord(tab.save) && (!disk||tab.base===base)) return {...tab.save,storage:'tab'}
  return disk && {...disk,storage:'device'}
}
function persist(save:RecordOnDisk, disk:RecordOnDisk|null): LocalGame {
  if (write('localStorage',localGameKey,JSON.stringify(save))) {
    inMemory=null
    remove('sessionStorage',localGameKey)
    remove('sessionStorage',legacyKey)
    return {...save,storage:'device'}
  }
  const fallback={save,base:disk?checkpoint(disk):null}
  if (write('sessionStorage',localGameKey,JSON.stringify(fallback))) {
    inMemory=null
    remove('sessionStorage',legacyKey)
    return {...save,storage:'tab'}
  }
  inMemory=fallback
  return {...save,storage:'memory'}
}
function newRecord(game:Match,partnerId:PartnerId):RecordOnDisk {
  const id=globalThis.crypto?.randomUUID?.()??(Date.now().toString(36)+'-'+Math.random().toString(36).slice(2))
  return {version:1,id,revision:1,savedAt:Date.now(),partnerId,game}
}
export function readLocalGame():LocalGame|null {
  const disk=diskRecord()
  const current=currentRecord(disk)
  if (current) return current
  const legacy=parse('sessionStorage',legacyKey)
  if (!match(legacy)) return null
  const storedPartner=read('sessionStorage','guandan.partner')
  const partner=partners.find(p=>p.id===storedPartner)?.id??defaultPartnerId
  return persist(newRecord(legacy,partner),disk)
}
/** Start only after the player has confirmed replacing any saved game. */
export function startLocalGame(partnerId:PartnerId):LocalGame {
  return persist(newRecord(startMatch(),partnerId),diskRecord())
}
export function updateLocalGame(current:LocalGame, game:Match, partnerId=current.partnerId):LocalGame|null {
  const disk=diskRecord()
  const latest=currentRecord(disk)
  if (latest && checkpoint(latest)!==checkpoint(current)) return null
  return persist({version:1,id:current.id,revision:current.revision+1,savedAt:Date.now(),partnerId,game},disk)
}
export function readAutoPass():boolean {
  const value=read('localStorage',autoPassKey)
  const temporary=memoryPreference??parse('sessionStorage',temporaryAutoPassKey)
  if (object(temporary) && temporary.base===value && typeof temporary.enabled==='boolean') return temporary.enabled
  if (value!==null) return value!=='false'
  const legacy=read('sessionStorage',autoPassKey)
  if (legacy!==null) {
    const enabled=legacy!=='false'
    saveAutoPass(enabled)
    return enabled
  }
  return true
}
export function saveAutoPass(enabled:boolean):void {
  if (write('localStorage',autoPassKey,String(enabled))) {
    memoryPreference=null
    remove('sessionStorage',temporaryAutoPassKey)
    remove('sessionStorage',autoPassKey)
  } else {
    memoryPreference={base:read('localStorage',autoPassKey),enabled}
    write('sessionStorage',temporaryAutoPassKey,JSON.stringify(memoryPreference))
  }
}
