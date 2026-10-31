import { Injectable } from '@nestjs/common';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { resolve } from 'path';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

@Injectable()
export class DslValidatorService {
  private readonly ajv: Ajv;
  private readonly validate: ReturnType<Ajv['compile']>;

  constructor() {
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
    // Load schema at runtime so TypeScript rootDir constraints don't apply
    const schemaPath = resolve(__dirname, '../../../dsl/schema/form.v1.schema.json');
    const schema = require(schemaPath) as object;
    this.validate = this.ajv.compile(schema);
  }

  validateForm(data: unknown): ValidationResult {
    const valid = this.validate(data) as boolean;
    if (valid) {
      return { valid: true, errors: [] };
    }
    const errors = (this.validate.errors ?? []).map((e) => {
      const path = e.instancePath || '(root)';
      if (e.keyword === 'pattern' && e.schemaPath.startsWith('#/definitions/singleLine')) {
        return `${path}: must not contain newlines`;
      }
      return `${path}: ${e.message}`;
    });
    return { valid: false, errors };
  }
}
