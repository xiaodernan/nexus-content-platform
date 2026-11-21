// 由 scripts/gen-margins.mts 生成；请勿手改（重跑本脚本并逐字节比对）
// docs/world-bible/echoes/ 里以「> 页边：」开头的行是唯一真值

export interface BibleMargin {
  /** 这条页边所属的回响文件名（不含 .md） */
  readonly echo: string;
  /** 回响在典籍室里的地址 */
  readonly slug: string;
  readonly zh: string;
  readonly en: string;
}

/** 页边批注：逐字来自正典文件，顺序 = 回响编号升序。 */
export const BIBLE_MARGINS: readonly BibleMargin[] = [
  {
    "echo": "E210-潮候院抄本院抄本师们把那道浅痕抄成了第四十三道",
    "slug": "/bible/echo-210-forty-third",
    "zh": "这一道不是潮印，是回答。",
    "en": "this one is no tide mark, but an answer."
  },
  {
    "echo": "E211-潮候院抄本院抄本师们发现新痕不占第四十四道",
    "slug": "/bible/echo-211-not-the-forty-fourth",
    "zh": "数字是用来数的，这一道不是用来数的。",
    "en": "a number is for counting; this one is not to be counted."
  },
  {
    "echo": "E212-潮候院抄本院抄本师们给那道新痕起了个不是名字的名字",
    "slug": "/bible/echo-212-not-a-name",
    "zh": "名字是给愿意被数的东西用的；它不愿意，那就不给。",
    "en": "a name is for a thing willing to be counted; it is not willing, so it gets none."
  }
] as const;
