import { afterNextRender, Component, inject } from '@angular/core';
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
  changePasswordOpen = false;
  changePasswordSaving = false;
  changePasswordError: string | null = null;

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
    this.changePasswordError = null;
    this.changePasswordOpen = true;
  }

  closeChangePasswordDialog() {
    if (this.changePasswordSaving) return;
    this.changePasswordOpen = false;
    this.changePasswordError = null;
  }

  submitPasswordChange(request: ChangePasswordRequest) {
    this.changePasswordSaving = true;
    this.changePasswordError = null;

    this.authService.changePassword(request).subscribe({
      next: () => {
        this.changePasswordSaving = false;
        this.changePasswordOpen = false;
        window.alert('Password changed successfully.');
      },
      error: (error) => {
        this.changePasswordSaving = false;
        this.changePasswordError = error instanceof Error ? error.message : 'Unable to change password.';
      }
    });
  }
}
