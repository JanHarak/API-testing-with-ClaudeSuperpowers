import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import openApiSpec from '../../data/openapi/todoist-openapi.json';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const SPEC_ID = 'openapi.json';

export class SchemaValidator {
  private readonly ajv: Ajv2020;
  private readonly cache = new Map<string, ValidateFunction>();
  private readonly available: Set<string>;

  constructor(spec: Record<string, unknown> = openApiSpec as Record<string, unknown>) {
    this.ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
    addFormats(this.ajv);
    this.ajv.addSchema({ ...spec, $id: SPEC_ID });

    const components = spec.components as { schemas?: Record<string, unknown> } | undefined;
    this.available = new Set(Object.keys(components?.schemas ?? {}));
  }

  validate(schemaName: string, data: unknown): ValidationResult {
    const validateFn = this.compile(schemaName);
    const valid = validateFn(data) as boolean;

    if (valid) {
      return { valid: true, errors: [] };
    }

    const errors = (validateFn.errors ?? []).map(
      (error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
    );

    return { valid: false, errors };
  }

  private compile(schemaName: string): ValidateFunction {
    const cached = this.cache.get(schemaName);
    if (cached) {
      return cached;
    }

    if (!this.available.has(schemaName)) {
      throw new Error(
        `Unknown OpenAPI schema "${schemaName}". Check data/openapi/todoist-openapi.json ` +
          'or refresh it with npm run spec:update.',
      );
    }

    const validateFn = this.ajv.compile({ $ref: `${SPEC_ID}#/components/schemas/${schemaName}` });
    this.cache.set(schemaName, validateFn);
    return validateFn;
  }
}

export const schemaValidator = new SchemaValidator();
