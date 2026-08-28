import { schemaValidator } from './SchemaValidator';

describe('SchemaValidator', () => {
  it('accepts a minimal valid label payload', () => {
    const result = schemaValidator.validate('LabelRestView', {
      id: '1',
      name: 'qa-auto-label',
      color: 'charcoal',
      order: 1,
      is_favorite: false,
    });

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('reports the failing property path', () => {
    const result = schemaValidator.validate('LabelRestView', { id: 1 });

    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/\/id/);
  });

  it('throws a clear error for an unknown schema name', () => {
    expect(() => schemaValidator.validate('NoSuchSchema', {})).toThrow(/NoSuchSchema/);
  });

  it('compiles every schema the suite relies on', () => {
    const names = [
      'UserJSON',
      'ItemSyncView',
      'AnyProjectSyncViewResponse',
      'SectionSyncView',
      'NoteSyncView',
      'LabelRestView',
      'PaginatedList_ItemSyncView_',
      'PaginatedList_AnyProjectSyncViewResponse_',
      'PaginatedList_SectionSyncView_',
      'PaginatedList_NoteSyncView_',
      'PaginatedList_LabelRestView_',
    ];

    for (const name of names) {
      expect(() => schemaValidator.validate(name, {})).not.toThrow();
    }
  });
});
