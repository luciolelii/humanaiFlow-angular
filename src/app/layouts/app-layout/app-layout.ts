import { afterNextRender, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ChangePasswordRequest } from '@models/user';
import { Authorization } from '@services/authorization/authorization';
import { BlocksService } from '@services/blocks/blocks';
import { ContainersService } from '@services/containers/containers';
import { ChangePasswordDialogComponent } from '@shared/change-password-dialog/change-password-dialog';

@Component({
  selector: 'app-app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ChangePasswordDialogComponent, MatButtonModule, MatIconModule, MatMenuModule, MatTabsModule, MatToolbarModule],
  templateUrl: './app-layout.html',
  styleUrl: './app-layout.css',
})
export class AppLayout {

  router = inject(Router);
  
  private authService = inject(Authorization);
  private blocksService = inject(BlocksService);
  private containersService = inject(ContainersService);

  loggedUser = this.authService.loggedInUser;
  changePasswordOpen = signal(false);
  changePasswordSaving = signal(false);
  changePasswordError = signal<string | null>(null);
  changePasswordSuccess = signal<string | null>(null);

  constructor() {
    afterNextRender(() => {
      void this.blocksService.getAllBlocksTypes().catch((err) => {
        console.error('Blocks preload failed', err);
      });
      void this.containersService.getAllContainerTypes().catch((err) => {
        console.error('Containers preload failed', err);
      });
    });
  }
  
logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  openChangePasswordDialog() {
    if (!this.loggedUser()?.username?.trim()) return;
    this.changePasswordError.set(null);
    this.changePasswordOpen.set(true);
  }

  closeChangePasswordDialog() {
    if (this.changePasswordSaving()) return;
    this.changePasswordOpen.set(false);
    this.changePasswordError.set(null);
  }

  submitPasswordChange(request: ChangePasswordRequest) {
    this.changePasswordSaving.set(true);
    this.changePasswordError.set(null);

    this.authService.changePassword(request).subscribe({
      next: () => {
        this.changePasswordSaving.set(false);
        this.changePasswordOpen.set(false);
        this.changePasswordError.set(null);
        this.changePasswordSuccess.set('Password changed successfully.');
        setTimeout(() => {
          this.changePasswordSuccess.set(null);
        }, 3000);
      },
      error: (error) => {
        this.changePasswordSaving.set(false);
        this.changePasswordError.set(error instanceof Error ? error.message : 'Unable to change password.');
      }
    });
  }
}
