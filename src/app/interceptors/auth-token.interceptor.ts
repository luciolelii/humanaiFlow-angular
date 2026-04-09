import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

let lastSessionExpiredNotificationAt = 0;
let lastServiceErrorNotificationAt = 0;

export const withCredentialsInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req.clone({ withCredentials: true }));
};

export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const requestPath = req.url.split('?')[0];
  const isAuthEndpoint =
    requestPath.endsWith('/auth/login') ||
    requestPath.endsWith('/auth/register');

  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        !isAuthEndpoint &&
        error instanceof HttpErrorResponse &&
        error.status === 401
      ) {
        notifySessionExpired();
        redirectToLogin(router);
      }

      if (
        error instanceof HttpErrorResponse &&
        (error.status === 0 || error.status >= 500)
      ) {
        notifyServiceContactError();
      }

      return throwError(() => error);
    })
  );
};

function notifySessionExpired() {
  const now = Date.now();
  if (now - lastSessionExpiredNotificationAt < 1200) return;
  lastSessionExpiredNotificationAt = now;
  console.warn('Session expired. Redirecting to login.');
}

function notifyServiceContactError() {
  const now = Date.now();
  if (now - lastServiceErrorNotificationAt < 1200) return;
  lastServiceErrorNotificationAt = now;
  console.error('Error contacting service, please retry later.');
}

function redirectToLogin(router: Router) {
  if (router.url === '/login') return;
  void router.navigateByUrl('/login');
}
