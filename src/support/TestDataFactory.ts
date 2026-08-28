let counter = 0;

/** Labels are account-wide rather than project-scoped, so cleanup matches on this. */
export const LABEL_PREFIX = 'qa-auto-';

/**
 * A well-formed ID that no resource uses.
 *
 * Verified against the live API: tasks and labels answer 404, but `GET /projects/{id}`
 * answers 400 INVALID_ARGUMENT_VALUE, because project IDs carry a checksum the API
 * validates before it looks anything up. Any negative case built on this constant must
 * therefore expect a per-resource status, not one shared value.
 */
export const NON_EXISTENT_ID = '6X4rfFVWjhSj9Vc9';

/** An ID that is not valid in any resource's encoding. */
export const MALFORMED_ID = '!!!not-an-id!!!';

/**
 * A name unique within the run. The counter keeps two names apart even when they are
 * generated inside the same millisecond.
 */
export function uniqueName(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

/** Name for a label, carrying the prefix the teardown sweep looks for. */
export function uniqueLabelName(): string {
  return uniqueName(`${LABEL_PREFIX}label`);
}
