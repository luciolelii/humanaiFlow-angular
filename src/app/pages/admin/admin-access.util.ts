import { Router } from '@angular/router';

/**
 * Admin API calls fail with this exact message when the caller's session
 * lost admin privileges mid-flow (e.g. role changed in another tab).
 */
const ADMIN_ACCESS_REQUIRED_MESSAGE = 'Admin access required.';

/**
 * Detects the "admin access required" failure from an admin API call and, if
 * matched, resets whatever busy-state `onRedirect` clears and navigates away.
 * Returns whether the error was handled, so callers can bail out of their own
 * error handling with `if (redirectOnAdminAccessDenied(...)) return;`.
 */
export function redirectOnAdminAccessDenied(error: unknown, router: Router, onRedirect: () => void): boolean {
  const message = error instanceof Error ? error.message : '';
  if (message !== ADMIN_ACCESS_REQUIRED_MESSAGE) return false;

  onRedirect();
  router.navigateByUrl('/editor');
  return true;
}
