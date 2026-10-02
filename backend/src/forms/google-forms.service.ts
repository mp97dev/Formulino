import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { forms } from '@googleapis/forms';
import { OAuth2Client } from 'google-auth-library';
import type { FormSettings } from './dsl-types';
import type { GoogleFormsRequest } from './mapper.service';

interface GoogleTokenInfo {
  aud?: string;
  error?: string;
  error_description?: string;
}

@Injectable()
export class GoogleFormsService {
  private readonly logger = new Logger(GoogleFormsService.name);
  private readonly tokenInfoUrl = 'https://oauth2.googleapis.com/tokeninfo';

  // FormsController.create() accepts a caller-supplied bearer token and
  // forwards it to Google as-is; nothing before this stopped a token minted
  // for a *different* Google OAuth client from being replayed here. Checking
  // `aud` against our own client id confirms the token was actually issued
  // for this application before we spend a Google API call on it.
  async verifyTokenAudience(accessToken: string): Promise<void> {
    let response: Response;
    try {
      response = await fetch(
        `${this.tokenInfoUrl}?access_token=${encodeURIComponent(accessToken)}`,
      );
    } catch {
      // Google's introspection endpoint being unreachable must not take form
      // creation down — fail open and let the downstream Forms API call be
      // the real authority on whether the token works.
      this.logger.warn('Token audience check skipped: tokeninfo endpoint unreachable');
      return;
    }

    // Never log the token itself or the raw tokeninfo body — it's a live
    // credential for the caller's Google account.
    if (!response.ok) {
      throw new UnauthorizedException('Access token is invalid or expired');
    }

    const tokenInfo = (await response.json()) as GoogleTokenInfo;
    if (tokenInfo.error) {
      throw new UnauthorizedException('Access token is invalid or expired');
    }
    if (tokenInfo.aud && tokenInfo.aud !== process.env.GOOGLE_CLIENT_ID) {
      throw new UnauthorizedException('Access token was not issued for this application');
    }
  }

  private buildOAuth2Client(accessToken: string) {
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
    client.setCredentials({ access_token: accessToken });
    return client;
  }

  async createForm(
    accessToken: string,
    title: string,
  ): Promise<{ formId: string; formUrl: string }> {
    const auth = this.buildOAuth2Client(accessToken);
    const formsClient = forms({ version: 'v1', auth });

    // Google Forms API v1 only accepts info.title on initial create.
    // All other settings must go through batchUpdate after creation.
    const response = await formsClient.forms.create({
      requestBody: { info: { title } },
    });

    const formId = response.data.formId;
    if (!formId) {
      throw new Error('Google Forms API did not return a formId');
    }

    const formUrl = `https://docs.google.com/forms/d/${formId}/viewform`;
    this.logger.log(`Created form ${formId}`);
    return { formId, formUrl };
  }

  async batchUpdate(
    accessToken: string,
    formId: string,
    requests: GoogleFormsRequest[],
  ): Promise<void> {
    if (requests.length === 0) return;

    const auth = this.buildOAuth2Client(accessToken);
    const formsClient = forms({ version: 'v1', auth });

    await formsClient.forms.batchUpdate({
      formId,
      requestBody: { requests },
    });

    this.logger.log(`BatchUpdate on form ${formId}: ${requests.length} items`);
  }

  async patchFormSettings(
    accessToken: string,
    formId: string,
    settings: FormSettings,
    isQuiz: boolean = false,
  ): Promise<void> {
    if (isQuiz) {
      const auth = this.buildOAuth2Client(accessToken);
      const formsClient = forms({ version: 'v1', auth });
      await formsClient.forms.batchUpdate({
        formId,
        requestBody: {
          requests: [{
            updateSettings: {
              settings: { quizSettings: { isQuiz: true } },
              updateMask: 'quizSettings.isQuiz',
            },
          }],
        },
      });
      this.logger.log(`Form ${formId}: quiz mode enabled`);
    }

    // These settings are not patchable via Forms API v1 REST.
    if (settings.collectEmails) {
      this.logger.warn(`Form ${formId}: collectEmails cannot be set via Forms API v1 REST — skipped.`);
    }
    if (settings.limitOneResponse) {
      this.logger.warn(`Form ${formId}: limitOneResponse cannot be set via Forms API v1 REST — skipped.`);
    }
    if (settings.shuffleQuestions) {
      this.logger.warn(`Form ${formId}: shuffleQuestions is per-page in Forms API v1 and not globally patchable — skipped.`);
    }
  }
}
