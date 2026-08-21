import { writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { coverPalette } from '@/lib/cover-theme';

export interface CoverRenderInput {
  title: string;
  styleTags: string[];
  outPath: string;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
}

export async function renderCoverPng(input: CoverRenderInput): Promise<string> {
  const [from, to] = coverPalette(`${input.title}|${(input.styleTags ?? []).join(',')}`);
  const title = escapeXml(input.title.length > 12 ? `${input.title.slice(0, 12)}…` : input.title);
  const tags = escapeXml((input.styleTags ?? []).slice(0, 4).join(' · ') || 'AI MUSIC');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <text x="512" y="488" text-anchor="middle" fill="#ffffff" font-size="72" font-weight="700">${title}</text>
  <text x="512" y="600" text-anchor="middle" fill="#ffffff" fill-opacity="0.75" font-size="36">${tags}</text>
</svg>`;
  const resvg = new Resvg(svg, {
    font: { loadSystemFonts: true, defaultFontFamily: 'Microsoft YaHei' },
    fitTo: { mode: 'width', value: 1024 },
  });
  await writeFile(input.outPath, resvg.render().asPng());
  return input.outPath;
}
