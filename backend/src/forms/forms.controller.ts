import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DslValidatorService } from './dsl-validator.service';
import { GoogleFormsService } from './google-forms.service';
import { mapDslToGoogleRequests } from './mapper.service';
import type { Form } from './dsl-types';

@ApiTags('forms')
@Controller('forms')
export class FormsController {
  constructor(
    private readonly validator: DslValidatorService,
    private readonly googleForms: GoogleFormsService,
  ) {}

  @Post('validate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Validate a DSL form payload' })
  @ApiResponse({ status: 200, description: 'Validation result' })
  validate(@Body() body: unknown): { valid: boolean; errors: string[] } {
    return this.validator.validateForm(body);
  }

  @Post('create')
  @HttpCode(201)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Create a Google Form from a DSL payload' })
  @ApiHeader({ name: 'Authorization', description: 'Bearer <google_access_token>' })
  @ApiResponse({ status: 201, description: 'Form created successfully' })
  @ApiResponse({ status: 401, description: 'Missing or invalid Authorization header' })
  @ApiResponse({ status: 422, description: 'DSL validation failed' })
  async create(
    @Body() body: unknown,
    @Headers('authorization') authHeader: string,
  ): Promise<{ formUrl: string; formId: string }> {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization header with Bearer token is required');
    }
    const accessToken = authHeader.slice(7);

    const validation = this.validator.validateForm(body);
    if (!validation.valid) {
      throw new UnprocessableEntityException({ errors: validation.errors });
    }

    // Confirm the caller-supplied token was actually issued for this
    // application before spending a Google Forms API call on it.
    await this.googleForms.verifyTokenAudience(accessToken);

    const form = body as Form;
    const { formId, formUrl } = await this.googleForms.createForm(
      accessToken,
      form.title,
    );

    // Quiz mode must be enabled before adding items with grading
    await this.googleForms.patchFormSettings(accessToken, formId, form.settings, form.mode === 'quiz');

    const requests = mapDslToGoogleRequests(form);
    await this.googleForms.batchUpdate(accessToken, formId, requests);

    return { formId, formUrl };
  }
}
