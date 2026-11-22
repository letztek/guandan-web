import { exchangeOptions } from './match.ts'
import { allMoves, beats, deck, names, uid, type Card, type Move } from './rules.ts'

type Exercise =
  | { kind: 'play'; pattern: string }
  | { kind: 'pass' | 'donate' | 'return' | 'resist' }

export type Lesson = {
  id: string
  chapter: '入門'|'組合'|'隊友'|'換副'
  title: string
  rule: string
  scene: string
  prompt: string
  hint: string
  success: string
  level: string
  hand: Card[]
  target?: Move
  exercise: Exercise
  afterPass?: Pick<Lesson, 'prompt'|'hint'|'success'|'exercise'>
}

const pack = new Map(deck().map(card => [card.id, card]))
function cards(faces: string): Card[] {
  return faces.split(' ').map(face => {
    const card = pack.get(face.includes('-') ? face : face + '-0')
    if (!card) throw new Error('Unknown tutorial card ' + face)
    return card
  })
}
function table(faces: string, kind: string, level = '5'): Move {
  const move = allMoves(cards(faces), level, true).find(option => option.kind === kind)
  if (!move) throw new Error('Invalid tutorial table ' + faces)
  return move
}

export const lessons: Lesson[] = [
  {
    id: 'lead', chapter: '入門', title: '用三張領出', level: '5',
    rule: '新的一圈由一人領出。三張相同點數的牌可以單獨當作一手。',
    scene: '輪到你領出，桌面是空的。',
    prompt: '你先出！把三張 7 點起來，再按「出牌」。',
    hint: '找出黑桃 7、紅心 7 和梅花 7，留下單張 9。',
    success: '對，就是這三張！想壓你的 7，下一家得出更大的三張，或動用炸彈類牌型。',
    hand: cards('S7 D9 H7 C7'), exercise: { kind: 'play', pattern: 'triple' },
  },
  {
    id: 'pair', chapter: '入門', title: '用對子跟牌', level: '5',
    rule: '一般跟牌要出相同牌型，點數也要比桌面大。',
    scene: '對手打出一對 8。', prompt: '桌上是一對 8。你手裡哪兩張能一起壓過它？',
    hint: '一張 K 湊不成對子；手上有兩張 9。',
    success: '一對 9 壓過一對 8。這圈再有人跟牌，就要壓過你的 9。',
    hand: cards('D9 SK C4 C9'), target: table('S8 D8','pair'), exercise: { kind: 'play', pattern: 'pair' },
  },
  {
    id: 'wild', chapter: '入門', title: '紅心級牌能代牌', level: '5',
    rule: '本副打 5，紅心 5 是「逢人配」。組牌時可以代替其他普通牌，大小王除外。',
    scene: '對手打出三張 K，你有兩張 A 和一張紅心 5。',
    prompt: '兩張 A 還差一位。讓紅心 5 補上，試著打出三張 A。',
    hint: '選兩張 A 和紅心 5。黑桃 5 在這一副也是級牌，但不能代替 A。',
    success: '紅心 5 在這手代表 A。兩張 A 加一張逢人配，正好組成三張 A。',
    hand: cards('DA S5 SA H5'), target: table('CK DK SK','triple'), exercise: { kind: 'play', pattern: 'triple' },
  },
  {
    id: 'full', chapter: '組合', title: '三帶對怎麼比', level: '5',
    rule: '三張加另一個點數的一對就是三帶對（葫蘆）。比大小只看三張的點數。',
    scene: '對手出了三張 9 帶一對 A。',
    prompt: '用三張 10 帶一對 6 跟牌。',
    hint: '把三張 10 和兩張 6 一起選起來，留下 K。',
    success: '雖然一對 6 比一對 A 小，三張 10 仍然壓過三張 9。',
    hand: cards('S6 H10 CK D10 C6 S10'), target: table('S9 C9 H9 HA DA','full'), exercise: { kind: 'play', pattern: 'full' },
  },
  {
    id: 'run', chapter: '組合', title: '五張順子', level: '5',
    rule: '順子固定五張，點數逐一相連。A 可以接在 2 前面，也可以接在 K 後面。',
    scene: '輪到你領出。', prompt: '組出從 6 到 10 的順子。',
    hint: '各選一張 6、7、8、9、10，留下 Q。',
    success: '6、7、8、9、10 正好連成五張順子。',
    hand: cards('D6 S7 HQ C8 H9 S10'), exercise: { kind: 'play', pattern: 'straight' },
  },
  {
    id: 'pairs', chapter: '組合', title: '連續三個對子', level: '5',
    rule: '三連對由三個點數連續的對子組成，剛好六張。',
    scene: '輪到你領出。', prompt: '用三對相連的牌領出。',
    hint: '選一對 7、一對 8 和一對 9。單張 J 先留下。',
    success: '一對 7、一對 8、一對 9 合成一手三連對。',
    hand: cards('S7 H7 CJ D8 C8 S9 D9'), exercise: { kind: 'play', pattern: 'pairs' },
  },
  {
    id: 'steel', chapter: '組合', title: '兩組三張成鋼板', level: '5',
    rule: '鋼板由兩組點數相連的三張組成，也是六張。',
    scene: '輪到你領出。', prompt: '把兩組相連的三張牌一起打出去。',
    hint: '選三張 8 和三張 9。單張 Q 先留下。',
    success: '三張 8 和三張 9 合成鋼板。下一家若用鋼板跟牌，要組出更高的相連點數。',
    hand: cards('S8 H8 D8 CQ C9 H9 D9'), exercise: { kind: 'play', pattern: 'steel' },
  },
  {
    id: 'bomb', chapter: '組合', title: '用炸彈壓普通牌型', level: '5',
    rule: '四張以上相同點數可組成炸彈，能壓過一般牌型。兩個炸彈先比張數，再比點數。',
    scene: '對手打出一對 A，手中只有 6 和一張 9。',
    prompt: '找出可以壓過這對 A 的炸彈。',
    hint: '四張 6 可以一起打出。',
    success: '四張 6 是炸彈，即使對手的點數是 A，你還是能接下這手。',
    hand: cards('S6 H6 D9 C6 D6'), target: table('SA DA','pair'), exercise: { kind: 'play', pattern: 'bomb' },
  },
  {
    id: 'flush', chapter: '組合', title: '同花順壓五張炸彈', level: '5',
    rule: '五張同花色且點數連續的牌是同花順。它能壓四張、五張炸彈，再往上是六張以上炸彈及四王。',
    scene: '對手打出五張 8 組成的炸彈。',
    prompt: '用黑桃同花順壓過這手。',
    hint: '找出黑桃 9、10、J、Q、K。',
    success: '五張黑桃連成同花順，壓過了五張 8 的炸彈。',
    hand: cards('S9 S10 SJ D4 SQ SK'), target: table('H8 C8 D8 S8 C8-1','bomb'), exercise: { kind: 'play', pattern: 'flush' },
  },
  {
    id: 'team', chapter: '隊友', title: '讓隊友保住牌權', level: '5',
    rule: '你和對面的隊友同隊。即使手上有更大的牌，也可以選擇過牌。',
    scene: '隊友出了單張 Q，手裡還有兩張。右家已出完，左家剛過牌。',
    prompt: '我的 Q 還在桌上，手裡只剩兩張。這圈能讓我收下嗎？',
    hint: '直接按「過牌」，把 A 留到之後。',
    success: '謝啦！這圈我收下，下一圈就能先出。我們還留著你的 A。',
    hand: cards('S4 DA'), target: table('CQ','single'), exercise: { kind: 'pass' },
  },
  {
    id: 'wind', chapter: '隊友', title: '替出完的隊友接風', level: '5',
    rule: '最後出牌的人已經出完，而其餘人都過牌時，下一圈改由他的隊友領出，稱為接風。',
    scene: '右家先出完，隊友再以最後一對 K 出完。左家過牌，現在只剩你決定。',
    prompt: '這對 K 已經是我最後兩張了。左家也過了，接下來怎麼把牌權留給你？',
    hint: '按「過牌」。隊友已經空手，下一圈由你領。',
    success: '接風了！現在換你領出，從手中的 3 或 8 選一張打出去。',
    hand: cards('D3 S8'), target: table('DK CK','pair'), exercise: { kind: 'pass' },
    afterPass: {
      prompt: '這圈由你領出。點選 3 或 8，再按「出牌」。',
      hint: '桌面已經清空，選一張牌就能領出。',
      success: '你替隊友接風，親手領出了新一圈的第一張牌。', exercise: { kind: 'play', pattern: 'single' },
    },
  },
  {
    id: 'rank', chapter: '隊友', title: '一起拿下前兩名', level: '5',
    rule: '第一個出完的人是頭游。隊友拿二游、三游或末游時，頭游這一隊分別升 3、2 或 1 級。',
    scene: '隊友已拿頭游，對手出了對 6，你只剩最後一對 9。',
    prompt: '我拿到頭游了。趁對手這對 6 還在桌上，把你最後兩張一起送出去！',
    hint: '把兩張 9 一起打出去。',
    success: '頭游、二游都是我們的！這副收工，一口氣從 5 升到 8。',
    hand: cards('C9 H9'), target: table('D6 H6','pair'), exercise: { kind: 'play', pattern: 'pair' },
  },
  {
    id: 'ace', chapter: '隊友', title: '主打 A 贏得整場', level: 'A',
    rule: '本桌採先過 A 制。我方主打 A 時，要取得頭游，而且另一位隊友至少拿到三游，才能贏得整場。',
    scene: '我方主打 A。隊友已是頭游，右家剛拿二游，最後領出一張 K。你只剩一張 A。',
    prompt: '用最後一張牌拿下三游。',
    hint: '點選黑桃 A 再按「出牌」。',
    success: '過 A 了！我拿頭游，你用最後的 A 壓過 K 拿下三游。這場我們贏了。',
    hand: cards('SA'), target: table('DK','single','A'), exercise: { kind: 'play', pattern: 'single' },
  },
  {
    id: 'donate', chapter: '換副', title: '選一張牌進貢', level: '5',
    rule: '新一副開始，末游要向頭游進貢。先保留逢人配，再從其餘手牌選牌力最高的一張。',
    scene: '你是上副末游，新一副打 5。手上最高的候選牌有 A、黑桃 5 和紅心 5。',
    prompt: '選一張合規的進貢牌。',
    hint: '紅心 5 留下來。黑桃 5 是級牌，牌力比 A 高。',
    success: '黑桃 5 交給上副頭游，紅心 5 留在手裡。收貢的人接著會還一張牌。',
    hand: cards('S5 H5 DA CK H6'), exercise: { kind: 'donate' },
  },
  {
    id: 'return', chapter: '換副', title: '收貢之後要還牌', level: '5',
    rule: '還貢可選牌力不高於 10 的牌。若全手都超過 10，就還牌力最低的一張。',
    scene: '你收到了上副末游的貢牌。本副打 5，需要從手裡還一張牌。',
    prompt: '選一張牌力不高於 10 的牌還回去。',
    hint: '7 和 10 都合規。黑桃 5 是本副級牌。',
    success: '還貢完成。單貢時，進貢的一方先領出。',
    hand: cards('D7 S5 C10 HQ'), exercise: { kind: 'return' },
  },
  {
    id: 'resist', chapter: '換副', title: '兩張大王能抗貢', level: '5',
    rule: '單貢時，末游一人拿到兩張大王就自動抗貢。雙貢時，兩位進貢者合持兩張大王也成立。',
    scene: '你是上副末游。從這手牌中找出觸發抗貢的兩張牌。',
    prompt: '點選兩張大王，按「亮牌抗貢」讓我看看。',
    hint: '看王的角標，選兩張「大」。小王留在手裡。',
    success: '兩張大王都在你手中，抗貢成立！它們都留下，由上副頭游先出。',
    hand: cards('JBJ-0 JSJ-0 D9 JBJ-1'), exercise: { kind: 'resist' },
  },
]

export type LessonAction = 'play' | 'pass' | 'donate' | 'return' | 'resist'
export type LessonResult = { ok: boolean; message: string; cards: Card[] }

const feedbackCopy = {
  beatTable: '這題要練習壓過桌面的牌。',
  mustLead: '這圈由你領出，必須先出一手牌。',
  pickCards: '請先從手牌點選這一手要用的牌。',
  invalidPattern: '這些牌還沒有組成合法牌型。',
  letPartnerLead: '這手可以壓牌。這題要把牌權交給隊友。',
  tooSmall: (kind: string) => '這手壓不過桌面的' + names[kind] + '。',
  tryPattern: (kind: string) => '這是合法出法。這一課請試試' + names[kind] + '。',
}
export type LessonFeedback = typeof feedbackCopy

export function checkLesson(lesson: Lesson, ids: readonly string[], action: LessonAction, feedback = feedbackCopy): LessonResult {
  const retry = (message: string): LessonResult => ({ok: false, message, cards: []})
  const success = (cards: Card[] = []): LessonResult => ({ok: true, message: lesson.success, cards})
  const { exercise, target, level, hand } = lesson
  if (exercise.kind === 'resist') {
    const shown = hand.filter(card => ids.includes(uid(card)))
    return action === 'resist' && ids.length === 2 && shown.length === 2 && shown.every(card => card.rank === 'BJ')
      ? success(shown) : retry(lesson.hint)
  }
  if (action === 'pass') {
    if (exercise.kind === 'pass') return success()
    return retry(target ? feedback.beatTable + lesson.hint : feedback.mustLead)
  }
  const chosen = hand.filter(card => ids.includes(uid(card)))
  if (!chosen.length || chosen.length !== ids.length) return retry(feedback.pickCards)
  if (exercise.kind === 'donate' || exercise.kind === 'return') {
    const allowed = exchangeOptions({hands:[hand], turn:0, phase:exercise.kind, level})
    return action === exercise.kind && chosen.length === 1 && allowed.some(card => uid(card) === uid(chosen[0]))
      ? success(chosen) : retry(lesson.hint)
  }
  if (action !== 'play') return retry(lesson.hint)
  const candidates = allMoves(chosen, level, true)
  if (!candidates.length) return retry(feedback.invalidPattern + lesson.hint)
  const legal = candidates.filter(move => beats(move, target ?? null))
  if (!legal.length) return retry(feedback.tooSmall(target!.kind) + lesson.hint)
  if (exercise.kind !== 'play') return retry(feedback.letPartnerLead + lesson.hint)
  const move = legal.find(option => option.kind === exercise.pattern)
  return move ? success(move.cards) : retry(feedback.tryPattern(exercise.pattern) + lesson.hint)
}
