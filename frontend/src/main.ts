import { provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';

import { AppShellComponent } from './app/app-shell.component';
import { routes } from './app/app.routes';

bootstrapApplication(AppShellComponent, {
  providers: [
    // Angular 21 defaults to zoneless; this app relies on zone.js change detection.
    provideZoneChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withXhr()),
  ],
}).catch((error) => {
  console.error(error);
});
