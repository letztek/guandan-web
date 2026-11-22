import type { PartnerId } from './partner-roster'
import type { Lesson } from './tutorial-lessons'

export type LessonTone = 'guide' | 'clue' | 'correct' | 'retry'
export type SpeechLine = {speaker:'left'|'right'; text:string}
export type LessonDialogue = {left:PartnerId; right:PartnerId; lines:SpeechLine[]}

// The guide keeps the left seat. The player can turn to the other character for a clue.
const cast = {
  入門: {left:'hanakomachi', right:'high-waitress'},
  組合: {left:'athena', right:'hanakomachi'},
  隊友: {left:'high-waitress', right:'athena'},
  換副: {left:'hanakomachi', right:'athena'},
} as const satisfies Record<Lesson['chapter'],{left:PartnerId;right:PartnerId}>

const questions: Record<string,string> = {
  lead:'哪三張能一起出？',
  pair:'要壓過對 8，你看中了哪一對？',
  wild:'這兩張 A 缺一張。哪個花色的 5 能補上？',
  full:'三張 10 有了。這回讓哪一對跟著走？',
  run:'從 6 接到 10，手上有哪張用不到？',
  pairs:'從哪三個點數開始配對？',
  steel:'這手要湊兩組三張，哪些點數夠用？',
  bomb:'對面是一對 A。我們手上的 6 有別的出法嗎？',
  flush:'要壓這五張炸彈，哪個花色能一路連起來？',
  team:'桌上是我的 Q，我只剩兩張。這時候該用 A 壓我嗎？',
  wind:'我這對 K 出完了。現在怎麼讓對家接風？',
  rank:'對手留了對 6。怎麼讓我隊友這一手就走完？',
  ace:'我已經拿了頭游，隊友只剩一張。哪張牌能壓過 K？',
  donate:'這兩張 5 裡，哪一張要留在手上？',
  return:'這副打 5。收下貢牌以後，可以還哪幾張？',
  resist:'一大一小也能抗貢嗎？幫我看看王的角標。',
}

export function lessonDialogue(lesson:Lesson, tone:LessonTone, message:string): LessonDialogue {
  let lines:SpeechLine[] = [{speaker:'left',text:message}]
  if (tone==='clue') {
    const question = lesson.id==='wind' && lesson.exercise.kind==='play'
      ? '已經接風了。現在還要跟剛才那對 K 嗎？'
      : questions[lesson.id]
    if (question) lines=[{speaker:'left',text:question},{speaker:'right',text:message}]
  }
  return {...cast[lesson.chapter],lines}
}
