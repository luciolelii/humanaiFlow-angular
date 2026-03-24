import { afterNextRender, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Authorization } from '@services/authorization/authorization';
import { BlocksService } from '@services/blocks/blocks';
import { ContainersService } from '@services/containers/containers';

@Component({
  selector: 'app-app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule, MatTabsModule, MatToolbarModule],
  templateUrl: './app-layout.html',
  styleUrl: './app-layout.css',
})
export class AppLayout {

  router = inject(Router);
  
  private authService = inject(Authorization);
  private blocksService = inject(BlocksService);
  private containersService = inject(ContainersService);

  loggedUser = this.authService.loggedInUser;

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
}
