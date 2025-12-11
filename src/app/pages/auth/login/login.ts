import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from "@angular/router";
import { FormUtility } from '@utilities/form-utility';
import { Authorization } from '@services/authorization/authorization';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login extends FormUtility {
  private authService = inject(Authorization);
  private router = inject(Router);
  
  error = signal<string | null>(null);
  
  
  onSubmit(form: NgForm) {
    console.log(form.value);
    this.authService.login(form.value.email, form.value.password).subscribe({
        error: (err) => this.error.set(err.message),
        complete: () => this.router.navigate(['/']),
      });;
  }
}
