/** 產生穩定的 id。不依賴 crypto.randomUUID，舊瀏覽器也能跑。 */
export function makeId(prefix = 'kb'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}${rand}`;
}

/** 現在時間的 ISO 字串。抽成函式方便測試時替換。 */
export function now(): string {
  return new Date().toISOString();
}
