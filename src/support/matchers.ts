import { schemaValidator } from '../core/SchemaValidator';
import type { ApiResponse } from '../core/types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toHaveStatus(expected: number): R;
      toMatchApiSchema(schemaName: string): R;
    }
  }
}

expect.extend({
  toHaveStatus(received: ApiResponse, expected: number) {
    const pass = received.status === expected;
    const body = received.raw.length > 800 ? `${received.raw.slice(0, 800)}...` : received.raw;

    return {
      pass,
      message: () =>
        pass
          ? `Expected status not to be ${expected}.`
          : `Expected status ${expected} but received ${received.status}.\nResponse body: ${body}`,
    };
  },

  toMatchApiSchema(received: unknown, schemaName: string) {
    const result = schemaValidator.validate(schemaName, received);

    return {
      pass: result.valid,
      message: () =>
        result.valid
          ? `Expected the payload not to match schema ${schemaName}.`
          : `Payload does not match schema ${schemaName}:\n${result.errors.map((e) => `  - ${e}`).join('\n')}`,
    };
  },
});

export {};
