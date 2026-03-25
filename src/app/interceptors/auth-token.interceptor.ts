import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Authorization } from '@services/authorization/authorization';
import { catchError, throwError } from 'rxjs';

let lastSessionExpiredNotificationAt = 0;
let lastServiceErrorNotificationAt = 0;

export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const token = getToken();
  const requestPath = req.url.split('?')[0];
  const isChangePasswordEndpoint = requestPath.endsWith('/auth/change-password');
  const isAuthEndpoint =
    requestPath.endsWith('/auth/login') ||
    requestPath.endsWith('/auth/register');
  const hasToken = !!token;

  if (token && !isAuthEndpoint && isTokenExpired(token)) {
    clearAuthStorage();
    notifySessionExpired();
    redirectToLogin();
    return throwError(() =>
      new HttpErrorResponse({
        status: 401,
        statusText: 'Session expired',
        error: { message: 'Session expired' }
      })
    );
  }

  let requestToSend = req;
  if (token && !isAuthEndpoint && !req.headers.has('Authorization')) {
    requestToSend = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(requestToSend).pipe(
    catchError((error: unknown) => {
      if (
        hasToken &&
        !isAuthEndpoint &&
        !isChangePasswordEndpoint &&
        error instanceof HttpErrorResponse &&
        error.status === 401
      ) {
        clearAuthStorage();
        notifySessionExpired();
        redirectToLogin();
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

function getToken(): string | null {
  const directToken = localStorage.getItem(Authorization.TOKEN_STORAGE_KEY);
  if (directToken) return directToken;

  const rawUser = localStorage.getItem(Authorization.USER_STORAGE_KEY);
  if (!rawUser) return null;

  try {
    const parsed = JSON.parse(rawUser) as { token?: unknown };
    return typeof parsed?.token === 'string' && parsed.token.length > 0 ? parsed.token : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  try {
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return false;

    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = atob(padded);
    const payload = JSON.parse(decoded) as { exp?: unknown };
    if (typeof payload.exp !== 'number') return false;

    const nowSeconds = Math.floor(Date.now() / 1000);
    return payload.exp <= nowSeconds;
  } catch {
    return false;
  }
}

function clearAuthStorage() {
  localStorage.removeItem(Authorization.USER_STORAGE_KEY);
  localStorage.removeItem(Authorization.TOKEN_STORAGE_KEY);
}

function notifySessionExpired() {
  const now = Date.now();
  if (now - lastSessionExpiredNotificationAt < 1200) return;
  lastSessionExpiredNotificationAt = now;
  window.alert('Sessione scaduta. Effettua di nuovo il login.');
}

function notifyServiceContactError() {
  const now = Date.now();
  if (now - lastServiceErrorNotificationAt < 1200) return;
  lastServiceErrorNotificationAt = now;
  window.alert('Error contacting service, please retry later.');
}

function redirectToLogin() {
  if (window.location.pathname === '/login') return;
  window.location.assign('/login');
}
