import { Injectable, Logger } from '@nestjs/common';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface Stats {
  total: number;
  last7Days: number;
  last30Days: number;
}

const DAY_MS = 86_400_000;

/**
 * Anonymous counter of created forms: one UTC date (YYYY-MM-DD) per line in a
 * plain text file. No user, form or token data is ever written.
 * Persistence needs STATS_FILE on a mounted volume; without one the counter
 * simply restarts after each deploy. Write errors never break form creation.
 */
@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);
  private readonly file = process.env.STATS_FILE ?? './data/created-forms.log';
  /** UTC date -> forms created that day */
  private readonly perDay = new Map<string, number>();
  private loaded: Promise<void> | null = null;

  private load(): Promise<void> {
    this.loaded ??= readFile(this.file, 'utf8').then(
      (text) => {
        for (const line of text.split('\n')) {
          const day = line.trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(day)) this.perDay.set(day, (this.perDay.get(day) ?? 0) + 1);
        }
      },
      (err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') this.logger.warn(`Cannot read ${this.file}: ${err.message}`);
      },
    );
    return this.loaded;
  }

  async record(now: Date = new Date()): Promise<void> {
    await this.load();
    const day = now.toISOString().slice(0, 10);
    this.perDay.set(day, (this.perDay.get(day) ?? 0) + 1);
    try {
      await mkdir(dirname(this.file), { recursive: true });
      await appendFile(this.file, `${day}\n`, 'utf8');
    } catch (err) {
      this.logger.warn(`Cannot write ${this.file}: ${(err as Error).message}`);
    }
  }

  async get(now: Date = new Date()): Promise<Stats> {
    await this.load();
    const since = (days: number) => new Date(now.getTime() - (days - 1) * DAY_MS).toISOString().slice(0, 10);
    const from7 = since(7);
    const from30 = since(30);
    let total = 0;
    let last7Days = 0;
    let last30Days = 0;
    for (const [day, n] of this.perDay) {
      total += n;
      if (day >= from30) last30Days += n;
      if (day >= from7) last7Days += n;
    }
    return { total, last7Days, last30Days };
  }
}
