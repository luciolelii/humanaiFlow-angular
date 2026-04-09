import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Authorization } from '@services/authorization/authorization';

export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(Authorization);
  const router = inject(Router);
  if (authService.isLoggedIn()) {
      return true;
    } else {
      console.warn(`[authGuard] Access denied to ${state.url} — user not logged in, redirecting to /login`);
      router.navigate(['/login']);
      return false;
    }
};
