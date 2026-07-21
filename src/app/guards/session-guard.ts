import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Authorization } from '@services/authorization/authorization';
import { User } from '@models/user';
import { map } from 'rxjs';

/**
 * Builds a route guard that validates the session and redirects when `predicate`
 * rejects the logged-in user (or there is none). Shared by authGuard/adminGuard
 * so the two only differ in who is allowed through and where they land otherwise.
 */
export function createSessionGuard(
  predicate: (user: User | null) => boolean,
  redirectUrl: string,
  logLabel: string,
  denialReason: string
): CanActivateFn {
  return (_route, state) => {
    const authorization = inject(Authorization);
    const router = inject(Router);

    return authorization.validateSession().pipe(
      map((user) => {
        if (predicate(user)) {
          return true;
        }

        console.warn(`[${logLabel}] Access denied to ${state.url} — ${denialReason}, redirecting to ${redirectUrl}`);
        return router.parseUrl(redirectUrl);
      })
    );
  };
}
