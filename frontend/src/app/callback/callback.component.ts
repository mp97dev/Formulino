import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { saveToken } from '../services/google-session';

@Component({
  selector: 'app-callback',
  standalone: true,
  template: `
    <div style="display:grid;place-items:center;min-height:100vh;font-family:sans-serif;">
      <p>{{ message }}</p>
    </div>
  `,
})
export class CallbackComponent implements OnInit {
  message = 'Processing authentication…';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    // Token arrives in the URL fragment (#access_token=…) — never sent to servers or logged.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const token = hash.get('access_token');

    if (token) {
      saveToken(token);
      // Clear fragment so the token doesn't linger in browser history.
      history.replaceState(null, '', window.location.pathname + window.location.search);
      void this.router.navigate(['/']);
      return;
    }

    // Backend error codes arrive as query params (?error=…).
    this.route.queryParamMap.subscribe((params) => {
      const error = params.get('error');
      this.message = error
        ? `Authentication failed: ${error}`
        : 'Authentication failed. No token received.';
    });
  }
}
