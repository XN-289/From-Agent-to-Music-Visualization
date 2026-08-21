// 客户端安全的封面主题模块：只包含配色函数，不引入 Node-only 渲染依赖。
export const COVER_GRADIENTS = [
  "from-emerald-500/70 to-teal-700/60",
  "from-amber-500/70 to-orange-700/60",
  "from-rose-500/70 to-red-700/60",
  "from-sky-500/70 to-blue-700/60",
  "from-lime-500/70 to-emerald-700/60",
  "from-cyan-500/70 to-sky-700/60",
] as const;

export function coverGradient(key: string): string {
  let h = 0;
  for (const c of key) h = (h * 31 + c.codePointAt(0)!) % 997;
  return COVER_GRADIENTS[h % COVER_GRADIENTS.length];
}

const COVER_PALETTE: Array<[string, string]> = [
  ['#059669', '#0f766e'],
  ['#d97706', '#c2410c'],
  ['#e11d48', '#b91c1c'],
  ['#0284c7', '#1d4ed8'],
  ['#65a30d', '#047857'],
  ['#0891b2', '#0369a1'],
];

function coverHash(key: string): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.codePointAt(0)!) % 997;
  return h;
}

export function coverPalette(key: string): [string, string] {
  return COVER_PALETTE[coverHash(key) % COVER_PALETTE.length];
}
