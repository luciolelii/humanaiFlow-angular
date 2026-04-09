import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NotificationService } from '@services/notifications/notification';

@Component({
  selector: 'app-global-notification',
  template: `
    @if (notification.current(); as n) {
      <div class="global-notification" [class]="'global-notification-' + n.type" (click)="notification.dismiss()">
        {{ n.message }}
      </div>
    }
  `,
  styles: `
    .global-notification {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      border-radius: 8px;
      color: white;
      font-size: 14px;
      z-index: 10000;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      animation: slideUp 0.3s ease-out;
    }
    .global-notification-error { background-color: #d32f2f; }
    .global-notification-success { background-color: #388e3c; }
    .global-notification-warning { background-color: #f57c00; }
    .global-notification-info { background-color: #1976d2; }
    @keyframes slideUp {
      from { opacity: 0; transform: translateX(-50%) translateY(16px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalNotificationComponent {
  protected notification = inject(NotificationService);
}
