import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StatsService } from './stats.service';

function fresh(content?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'stats-'));
  const file = join(dir, 'sub', 'forms.log');
  if (content !== undefined) {
    process.env.STATS_FILE = join(dir, 'seed.log');
    writeFileSync(process.env.STATS_FILE, content);
  } else {
    process.env.STATS_FILE = file;
  }
  return { svc: new StatsService(), file: process.env.STATS_FILE };
}

afterEach(() => delete process.env.STATS_FILE);

describe('StatsService', () => {
  it('starts at zero when the file does not exist', async () => {
    expect(await fresh().svc.get()).toEqual({ total: 0, last7Days: 0, last30Days: 0 });
  });

  it('appends only a date per line and counts it', async () => {
    const { svc, file } = fresh();
    await svc.record(new Date('2026-10-06T12:00:00Z'));
    expect(readFileSync(file, 'utf8')).toBe('2026-10-06\n');
    expect(await svc.get(new Date('2026-10-06T20:00:00Z'))).toEqual({ total: 1, last7Days: 1, last30Days: 1 });
  });

  it('loads existing dates, ignores junk and windows by day', async () => {
    const { svc } = fresh('2026-09-01\nnot a date\n2026-09-20\n2026-10-01\n2026-10-06\n2026-10-06\n');
    expect(await svc.get(new Date('2026-10-06T10:00:00Z'))).toEqual({ total: 5, last7Days: 3, last30Days: 4 });
  });

  it('still counts in memory when the file cannot be written', async () => {
    const blocker = join(mkdtempSync(join(tmpdir(), 'stats-')), 'file');
    writeFileSync(blocker, 'x');
    process.env.STATS_FILE = join(blocker, 'forms.log'); // parent is a file -> ENOTDIR
    const svc = new StatsService();
    await expect(svc.record()).resolves.toBeUndefined();
    expect((await svc.get()).total).toBe(1);
  });
});
