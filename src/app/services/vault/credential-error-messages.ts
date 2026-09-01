/**
 * Copy shared by every caller that talks to a credential endpoint, so the vault
 * and the assistant report the same statuses the same way.
 */
export const CREDENTIAL_ERROR_MESSAGES: Record<number, string> = {
  400: 'The credential is invalid, inactive, or not compatible with the selected provider.',
  401: 'You must sign in to use or manage credentials.',
  409: 'This provider does not support user credentials.'
};
