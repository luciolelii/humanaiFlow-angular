import { CanActivateFn } from '@angular/router';
import { createSessionGuard } from './session-guard';

export const adminGuard: CanActivateFn = createSessionGuard(
  (user) => user?.role === 'ADMIN',
  '/',
  'adminGuard',
  'user is not admin'
);
