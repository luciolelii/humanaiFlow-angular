import { Injectable, signal } from '@angular/core';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export type Notification = {
  message: string;
  type: NotificationType;
  timestamp: number;
};

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private static readonly THROTTLE_MS = 1200;

  private _current = signal<Notification | null>(null);
  readonly current = this._current.asReadonly();

  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private lastNotificationAt = 0;

  show(message: string, type: NotificationType = 'info', durationMs = 4000) {
    const now = Date.now();
    if (now - this.lastNotificationAt < NotificationService.THROTTLE_MS && type === this._current()?.type) {
      return;
    }
    this.lastNotificationAt = now;

    this.clearDismissTimer();
    this._current.set({ message, type, timestamp: now });

    if (durationMs > 0) {
      this.dismissTimer = setTimeout(() => this.dismiss(), durationMs);
    }
  }

  dismiss() {
    this.clearDismissTimer();
    this._current.set(null);
  }

  private clearDismissTimer() {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }
}
