import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Field, form, minLength, email, required, validate, maxLength, disabled } from '@angular/forms/signals'
import { Router, RouterLink } from '@angular/router';
import { UserRegistration } from '@models/user';
import { Authorization } from '@services/authorization/authorization';
import { FormUtility } from '@utilities/form-utility';


@Component({
  selector: 'app-signup',
  imports: [FormsModule, RouterLink, Field, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule],
  templateUrl: './signup.html',
  styleUrl: './signup.css',
})
export class Signup extends FormUtility {

  private authService = inject(Authorization);
  private router = inject(Router);
  
  error = signal<string | null>(null);
  isRegistering = signal(false);

  constructor() {
    super();
    effect(() => {
      if (this.error() != null) {
        setTimeout(() => {
          this.error.set(null);
        }, 3000);
      }    
    });
  }


  signupModel = signal<UserRegistration & { confirmPassword: string }>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    fullname: ''
  });

  signupForm = form(this.signupModel, (model) => {
    required(model.username, { message: 'Username is required' }),
    minLength(model.username, 4, { message: 'Username must be at least 4 characters long' }),
    maxLength(model.username, 20, { message: 'Username cannot exceed 20 characters' }),
    email(model.email, { message: 'Invalid email address' }),
    required(model.email, { message: 'Email is required' }),
    minLength(model.password, 8, { message: 'Password must be at least 8 characters long' })
    required(model.fullname, { message: 'Full name is required'}),
    validate(model.confirmPassword, ({value, valueOf}) => {
      const confirmPassword = value()
      const password = valueOf(model.password)
      if (confirmPassword !== password) {
        return {
          kind: 'passwordMismatch',
          message: 'Passwords do not match'
        }
      }
      return null
    }),
    disabled(model, this.isRegistering)
  });

  onSubmit() {
    this.isRegistering.set(true)
    console.log(this.signupModel());
    
    this.authService.signup(this.signupModel()).subscribe({
        error: (err) => {
          this.isRegistering.set(false);
          this.error.set(err.message);
        },
        complete: () => {
          this.isRegistering.set(false);
          this.router.navigate(['/login'], { state: { registered: this.signupModel().username } });
        }
      });
  }
}
