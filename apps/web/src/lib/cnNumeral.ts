/**
 * 典籍室卡片编号：中文/罗马数字纯投影。零 provider、零随机。
 * 之前页面内那份只处理到 199，219 回响会写出「一百undefined」——这里把上界写清并测试。
 */
const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

function cnTwoDigit(n: number, afterHundred = false): string {
  if (n < 10) return CN_DIGITS[n] ?? '';
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  // 独立的 19 读「十九」，但 119 读「一百一十九」——百位后不能省那个「一」
  const tensChar = tens === 1 ? (afterHundred ? '一十' : '十') : `${CN_DIGITS[tens] ?? ''}十`;
  return ones === 0 ? tensChar : `${tensChar}${CN_DIGITS[ones] ?? ''}`;
}

/** 支持 0–999；三位数按「几百零几十几」写。>=1000 照实写阿拉伯数字，不编中文位。 */
export function cnNumber(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n < 100) return cnTwoDigit(n);
  if (n >= 1000) return String(n);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const prefix = hundreds === 1 ? '一百' : `${CN_DIGITS[hundreds]}百`;
  if (rest === 0) return prefix;
  const restText = rest < 10 ? `零${cnTwoDigit(rest)}` : cnTwoDigit(rest, true);
  return `${prefix}${restText}`;
}

const ROMAN_PAIRS: ReadonlyArray<readonly [number, string]> = [
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

export function romanNumber(n: number): string {
  let out = '';
  let remaining = n;
  for (const [value, symbol] of ROMAN_PAIRS) {
    while (remaining >= value) {
      out += symbol;
      remaining -= value;
    }
  }
  return out;
}
