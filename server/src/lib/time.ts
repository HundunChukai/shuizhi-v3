// 展示时间 ⇄ epoch 毫秒 互转，格式与前端 mock 完全一致：
//   同一天 → "今天 HH:MM"；前一天 → "昨天 HH:MM"；更早 → "MM-DD HH:MM"。
// seed 用 parseDisplayTime 把 mock 的展示时间转成可排序的 epoch；
// 模拟器/实时写入用 formatDisplayTime 由 epoch 生成展示时间。

const pad = (n: number): string => String(n).padStart(2, "0");

const dayStart = (d: Date): number =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function formatDisplayTime(epochMs: number, now = Date.now()): string {
  const d = new Date(epochMs);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const todayStart = dayStart(new Date(now));
  const thisDay = dayStart(d);
  if (thisDay === todayStart) return `今天 ${hm}`;
  if (thisDay === todayStart - 86_400_000) return `昨天 ${hm}`;
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`;
}

export function parseDisplayTime(text: string, now = Date.now()): number {
  const t = text.trim();
  const timeMatch = t.match(/(\d{1,2}):(\d{2})/);
  const hh = timeMatch ? Number(timeMatch[1]) : 0;
  const mm = timeMatch ? Number(timeMatch[2]) : 0;
  const base = new Date(now);
  if (t.startsWith("今天")) {
    base.setHours(hh, mm, 0, 0);
    return base.getTime();
  }
  if (t.startsWith("昨天")) {
    base.setDate(base.getDate() - 1);
    base.setHours(hh, mm, 0, 0);
    return base.getTime();
  }
  const md = t.match(/(\d{1,2})-(\d{1,2})/);
  if (md) {
    const d = new Date(base.getFullYear(), Number(md[1]) - 1, Number(md[2]), hh, mm, 0, 0);
    // 若解析出的日期明显在未来（跨年场景），回退一年，保证其早于「今天/昨天」。
    if (d.getTime() > now + 86_400_000) d.setFullYear(d.getFullYear() - 1);
    return d.getTime();
  }
  return now;
}

// "6小时" / "12小时" → 毫秒（用于监测收尾时间估算）。
export function durationToMs(text: string): number {
  const m = text.match(/(\d+)\s*小时/);
  return m ? Number(m[1]) * 3_600_000 : 0;
}
