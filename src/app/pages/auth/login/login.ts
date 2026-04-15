import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from "@angular/router";
import { FormUtility } from '@utilities/form-utility';
import { Authorization } from '@services/authorization/authorization';
import { Field, form, required } from '@angular/forms/signals';


@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, Field, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Login extends FormUtility {

  private authService = inject(Authorization);
  private router = inject(Router);

  error = signal<string | null>(null);
  registeredUser = signal<string | null>(null);
  
  loginFormModel = signal({
    username: '',
    password: ''
  });

  loginForm = form(this.loginFormModel, (model) => {
    required(model.username, { message: 'Username is required' }),
    required(model.password, { message: 'Password is required' })
  });

  constructor() {
    super();
    effect(() => {
      if (this.error() != null) {
        setTimeout(() => this.error.set(null), 3000);
      }
    });
    effect(() => {
      if (this.registeredUser() != null) {
        setTimeout(() => this.registeredUser.set(null), 5000);
      }
    });
  }

  ngOnInit(): void {
      this.authService.validateSession().subscribe({
        next: (user) => {
          if (user) {
            void this.router.navigate(['/']);
          }
        }
      });
      const registered = history.state?.registered;
      if (registered) {
        this.registeredUser.set(registered);
         this.loginFormModel.set({
          username: registered,
          password: ''
        });
      }
  }

  onSubmit() {
    console.log(this.loginFormModel());
    this.authService.login(this.loginFormModel().username, this.loginFormModel().password).subscribe({
      error: (err) => this.error.set(err.message),
      complete: () => this.router.navigate(['/']),
    });
  }
}
