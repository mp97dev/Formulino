import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface Stats {
  total: number;
  last7Days: number;
  last30Days: number;
}

@Injectable({ providedIn: 'root' })
export class StatsService {
  /** null until loaded, and stays null if the request fails: the UI then shows nothing. */
  readonly stats = signal<Stats | null>(null);

  constructor(private readonly http: HttpClient) {}

  load(): void {
    this.http.get<Stats>(`${environment.apiBaseUrl}/stats`).subscribe({
      next: (s) => this.stats.set(s),
      error: () => this.stats.set(null),
    });
  }
}
