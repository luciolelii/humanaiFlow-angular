import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Authorization } from '@services/authorization/authorization';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(Authorization);
  const router = inject(Router);
  if (authService.isLoggedIn()) {
      return true; // Allow access
    } else {
      router.navigate(['/login']); // Redirect to login
      return false; // Deny access
    }
};
