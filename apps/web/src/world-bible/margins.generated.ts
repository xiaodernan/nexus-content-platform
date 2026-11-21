// 由 scripts/gen-margins.mts 生成；请勿手改（重跑本脚本并逐字节比对）
// docs/world-bible/echoes/ 里以「> 页边：」开头的行是唯一真值

export interface BibleMargin {
  /** 这条页边所属的回响文件名（不含 .md） */
  readonly echo: string;
  /** 回响在典籍室里的地址 */
  readonly slug: string;
  /** 该回响的题名（中英各一，逐字来自文件首行） */
  readonly titleZh: string;
  readonly titleEn: string;
  readonly zh: string;
  readonly en: string;
}

/** 页边批注：逐字来自正典文件，顺序 = 回响编号升序。 */
export const BIBLE_MARGINS: readonly BibleMargin[] = [
  {
    "echo": "E210-潮候院抄本院抄本师们把那道浅痕抄成了第四十三道",
    "slug": "/bible/echo-210-forty-third",
    "titleZh": "潮候院抄本院抄本师们把那道浅痕抄成了第四十三道",
    "titleEn": "The Copyists Entered the Faint Mark as the Forty-Third",
    "zh": "这一道不是潮印，是回答。",
    "en": "this one is no tide mark, but an answer."
  },
  {
    "echo": "E211-潮候院抄本院抄本师们发现新痕不占第四十四道",
    "slug": "/bible/echo-211-not-the-forty-fourth",
    "titleZh": "潮候院抄本院抄本师们发现新痕不占第四十四道",
    "titleEn": "The Copyists Found the Fresh Mark Did Not Sit as the Forty-Fourth",
    "zh": "数字是用来数的，这一道不是用来数的。",
    "en": "a number is for counting; this one is not to be counted."
  },
  {
    "echo": "E212-潮候院抄本院抄本师们给那道新痕起了个不是名字的名字",
    "slug": "/bible/echo-212-not-a-name",
    "titleZh": "抄本师们给那道新痕起了个不是名字的名字",
    "titleEn": "The Copyists Gave the Fresh Mark a Word That Was Not a Name",
    "zh": "名字是给愿意被数的东西用的；它不愿意，那就不给。",
    "en": "a name is for a thing willing to be counted; it is not willing, so it gets none."
  },
  {
    "echo": "E213-潮候院抄本院有人开始数页边",
    "slug": "/bible/echo-213-counting-the-margin",
    "titleZh": "有人开始数页边",
    "titleEn": "Somebody Started Counting the Margin",
    "zh": "页边是唯一不数的地方；你数了，它就开始排队。",
    "en": "the margin is the one place nothing is counted; count it, and it starts to queue."
  }
] as const;
