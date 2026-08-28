import './matchers';
import type { ApiResponse } from '../core/types';

function response(status: number, data: unknown = null): ApiResponse {
  return { status, statusText: '', headers: {}, data, raw: JSON.stringify(data ?? ''), durationMs: 1 };
}

describe('custom matchers', () => {
  it('toHaveStatus passes on a matching status', () => {
    expect(response(200)).toHaveStatus(200);
  });

  it('toHaveStatus reports the body when the status differs', () => {
    expect(() => expect(response(400, { error: 'nope' })).toHaveStatus(200)).toThrow(/400.*nope/s);
  });

  it('toMatchApiSchema passes for a valid payload', () => {
    expect({ id: '1', name: 'qa-auto', color: 'charcoal', order: 1, is_favorite: false }).toMatchApiSchema(
      'LabelRestView',
    );
  });

  it('toMatchApiSchema lists the failing paths', () => {
    expect(() => expect({ id: 1 }).toMatchApiSchema('LabelRestView')).toThrow(/\/id/);
  });
});
