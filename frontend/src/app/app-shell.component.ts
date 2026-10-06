import { Component, OnInit } from '@angular/core';
import { NgIf } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { I18nService } from './services/i18n.service';
import { StatsService } from './services/stats.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, NgIf],
  template: `
    <span class="blob blob-1" aria-hidden="true"></span>
    <span class="blob blob-2" aria-hidden="true"></span>
    <span class="blob blob-3" aria-hidden="true"></span>
    <header class="app-header">
      <a routerLink="/" class="app-name">
        <img src="assets/ginkgo.png" alt="Ginkgo logo" class="app-logo" />
        Formulino
      </a>
      <button type="button" class="lang-toggle" (click)="i18n.toggle()">
        {{ i18n.lang() === 'it' ? 'EN' : 'IT' }}
      </button>
    </header>
    <router-outlet />
    <p class="stats-line" *ngIf="statsService.stats() as s">
      {{ s.total > 0 ? i18n.tp('statsLine', { total: s.total, week: s.last7Days }) : '' }}
    </p>
    <footer class="app-footer">
      <a routerLink="/privacy">{{ i18n.lang() === 'it' ? 'Informativa sulla privacy' : 'Privacy Policy' }}</a>
      <span class="footer-sep">·</span>
      <a href="https://ko-fi.com/M4M61ZCX4J" target="_blank" rel="noopener">{{ i18n.lang() === 'it' ? 'Offrimi un caffè ☕' : 'Buy me a coffee ☕' }}</a>
      <span class="footer-sep">·</span>
      <span class="footer-version">v{{ version }}</span>
    </footer>
  `,
  styles: [`
    .app-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: .75rem 1.5rem;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .app-name {
      display: flex;
      align-items: center;
      gap: .5rem;
      font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: .95rem;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -.02em;
      text-decoration: none;
    }

    .app-logo {
      height: 1.6rem;
      width: auto;
      display: block;
    }

    .app-name:hover {
      color: var(--accent);
    }

    .lang-toggle {
      padding: .3rem .8rem;
      border-radius: 5px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text-secondary);
      font-size: .82rem;
      font-weight: 600;
      cursor: pointer;
      letter-spacing: .04em;
      transition: border-color 100ms, color 100ms;
    }

    .lang-toggle:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .app-footer {
      text-align: center;
      padding: 1.5rem 1rem 2rem;
      border-top: 1px solid var(--border);
      margin-top: 2rem;
    }

    .app-footer a {
      color: var(--text-secondary);
      font-size: .82rem;
      text-decoration: none;
    }

    .app-footer a:hover {
      color: var(--accent);
      text-decoration: underline;
    }

    .stats-line {
      text-align: center;
      margin: 1.5rem 0 0;
      font-size: .85rem;
      color: var(--text-secondary);
    }

    .footer-sep {
      color: var(--border);
      margin: 0 .5rem;
    }

    .footer-version {
      color: var(--text-secondary);
      font-size: .82rem;
    }
  `],
})
export class AppShellComponent implements OnInit {
  readonly version = environment.version;
  constructor(readonly i18n: I18nService, readonly statsService: StatsService) {}

  ngOnInit(): void {
    this.statsService.load();
  }
}
