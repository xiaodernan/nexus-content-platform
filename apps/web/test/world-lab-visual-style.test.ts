import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('apps/web/src/studio/WorldPanel.tsx', 'utf8');

describe('世界实验按钮接线（WorldPanel 静态门）', () => {
  it('按钮、runner、输出区都在同一个面板里', () => {
    expect(src).toContain('data-world-lab');
    expect(src).toContain('data-world-lab-output');
    expect(src).toContain('onClick={runWorldLab}');
    expect(src).toContain('const runWorldLab = () => {');
  });

  it('runner 只调确定性模块，不调 provider / 不写库', () => {
    const start = src.indexOf('const runWorldLab = () => {');
    const body = src.slice(start, start + 1200);
    for (const name of ['buildWorldInquiries', 'buildWorldWaypoints', 'buildWorldSeasons', 'buildWorldTraditions', 'buildWorldAnnals', 'buildPlaythrough']) {
      expect(body).toContain(name);
    }
    expect(body).not.toContain('chatWithCharacter');
    expect(body).not.toContain('edit(');
  });

  it('中英双语各有按钮标题与六条输出标签', () => {
    for (const key of ['lab:', 'labTitle:', 'labEmpty:', 'labInquiries:', 'labWaypoints:', 'labSeasons:', 'labTraditions:', 'labAnnals:', 'labPrep:']) {
      expect(src.split(key).length - 1).toBeGreaterThanOrEqual(2);
    }
  });
});
