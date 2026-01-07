import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Authorization } from '@services/authorization/authorization';

@Component({
  selector: 'app-app-layout',
  imports: [],
  templateUrl: './app-layout.html',
  styleUrl: './app-layout.css',
})
export class AppLayout {

  router = inject(Router);
  
  private authService = inject(Authorization);

  loggedUser = this.authService.loggedInUser;
  
logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
