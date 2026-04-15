import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { OperationsStatistics, UserStatistics } from '@models/user';
import { AdminService } from '@services/admin/admin';
import { Authorization } from '@services/authorization/authorization';

@Component({
  selector: 'app-admin-stats-page',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule
  ],
  templateUrl: './admin-stats.html',
  styleUrl: './admin-stats.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminStatsPage {
  private adminService = inject(AdminService);
  private authorization = inject(Authorization);

  readonly users = signal<string[]>([]);
  readonly operationsStats = signal<OperationsStatistics | null>(null);
  readonly selectedUserStats = signal<UserStatistics | null>(null);
  readonly selectedUsername = signal('');
  readonly userSearch = signal('');
  readonly loadingUsers = signal(true);
  readonly loadingOverview = signal(true);
  readonly loadingUserStats = signal(false);
  readonly pageError = signal<string | null>(null);
  readonly statsError = signal<string | null>(null);
  readonly filteredUsers = computed(() => {
    const term = this.userSearch().trim().toLowerCase();
    const users = [...this.users()].sort((left, right) => left.localeCompare(right));
    if (!term) return users;
    return users.filter((user) => user.toLowerCase().includes(term));
  });
  readonly currentStats = computed(() =>
    this.selectedUsername() ? this.selectedUserStats() : this.operationsStats()
  );

  formatDuration(totalSeconds: number | null | undefined): string {
    const seconds = Math.max(0, Math.trunc(Number(totalSeconds ?? 0)));
    if (!seconds) return '0m';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  }

  ngOnInit() {
    this.loadUsers();
    this.loadOperationsStats();
  }

  loadUsers() {
    if (!this.authorization.isAdmin()) return;
    this.loadingUsers.set(true);
    this.pageError.set(null);
    this.adminService.listStatisticsUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loadingUsers.set(false);
      },
      error: (error) => {
        const message = error instanceof Error ? error.message : 'Unable to load users.';
        this.pageError.set(message);
        this.loadingUsers.set(false);
      }
    });
  }

  loadOperationsStats() {
    if (!this.authorization.isAdmin()) return;
    this.loadingOverview.set(true);
    this.statsError.set(null);
    this.adminService.getOperationsStatistics().subscribe({
      next: (stats) => {
        this.operationsStats.set(stats);
        this.loadingOverview.set(false);
      },
      error: (error) => {
        const message = error instanceof Error ? error.message : 'Unable to load statistics.';
        this.statsError.set(message);
        this.loadingOverview.set(false);
      }
    });
  }

  selectUser(username: string) {
    this.selectedUsername.set(username);
    this.selectedUserStats.set(null);
    this.loadSelectedUserStats();
  }

  clearSelectedUser() {
    this.selectedUsername.set('');
    this.selectedUserStats.set(null);
    this.statsError.set(null);
  }

  loadSelectedUserStats() {
    const username = this.selectedUsername().trim();
    if (!username || !this.authorization.isAdmin()) return;

    this.loadingUserStats.set(true);
    this.statsError.set(null);
    this.adminService.getUserStatistics(username).subscribe({
      next: (stats) => {
        this.selectedUserStats.set(stats);
        this.loadingUserStats.set(false);
      },
      error: (error) => {
        const message = error instanceof Error ? error.message : 'Unable to load statistics.';
        this.statsError.set(message);
        this.loadingUserStats.set(false);
      }
    });
  }
}
