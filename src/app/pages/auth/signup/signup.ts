import { AfterViewInit, ChangeDetectionStrategy, Component, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Field, form, minLength, email, required, validate, maxLength, disabled } from '@angular/forms/signals'
import { Router, RouterLink } from '@angular/router';
import { environment } from '@environment';
import { UserRegistration } from '@models/user';
import { Authorization } from '@services/authorization/authorization';
import { FormUtility } from '@utilities/form-utility';

function hasValidPasswordComplexity(value: string): boolean {
  return /^\S+$/.test(value)
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}

declare global {
  interface Window {
    __runtimeConfig?: {
      apiUrl?: string;
      assistantEnabled?: boolean;
      tourModeAlwaysOn?: boolean;
      turnstileEnabled?: boolean;
      turnstileSiteKey?: string;
    };
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

@Component({
  selector: 'app-signup',
  imports: [FormsModule, RouterLink, Field, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule],
  templateUrl: './signup.html',
  styleUrl: './signup.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Signup extends FormUtility implements AfterViewInit, OnDestroy {

  private authService = inject(Authorization);
  private router = inject(Router);
  private captchaContainer = viewChild<ElementRef<HTMLDivElement>>('captchaContainer');
  
  error = signal<string | null>(null);
  emailError = signal<string | null>(null);
  passwordError = signal<string | null>(null);
  captchaError = signal<string | null>(null);
  isRegistering = signal(false);
  captchaToken = signal<string | null>(null);
  captchaLoading = signal(false);
  captchaEnabled = environment.turnstileEnabled;
  private captchaWidgetId: string | null = null;

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

  async ngAfterViewInit() {
    if (!this.captchaEnabled) return;
    await this.mountCaptcha();
  }

  ngOnDestroy() {
    if (this.captchaWidgetId && window.turnstile) {
      window.turnstile.remove(this.captchaWidgetId);
      this.captchaWidgetId = null;
    }
  }


  signupModel = signal<UserRegistration & { confirmPassword: string }>({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  signupForm = form(this.signupModel, (model) => {
    required(model.username, { message: 'Username is required' }),
    minLength(model.username, 4, { message: 'Username must be at least 4 characters long' }),
    maxLength(model.username, 20, { message: 'Username cannot exceed 20 characters' }),
    email(model.email, { message: 'Invalid email address' }),
    required(model.email, { message: 'Email is required' }),
    minLength(model.password, 8, { message: 'Password must be at least 8 characters long' }),
    validate(model.password, ({ value }) => {
      const password = value();
      if (!password || hasValidPasswordComplexity(password)) {
        return null;
      }

      return {
        kind: 'passwordComplexity',
        message: 'Password must include uppercase, lowercase, number and special character, with no spaces.'
      };
    }),
    required(model.password, { message: 'Password is required' }),
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

  async onSubmit() {
    this.isRegistering.set(true)
    this.error.set(null);
    this.emailError.set(null);
    this.passwordError.set(null);
    this.captchaError.set(null);
    
    if (this.captchaEnabled && !this.captchaToken()) {
      this.isRegistering.set(false);
      this.captchaError.set('Please complete the captcha verification.');
      return;
    }

    const { username, email, password } = this.signupModel();
    const captchaToken = this.captchaToken();

    this.authService.signup({ username, email, password, ...(captchaToken ? { captchaToken } : {}) }).subscribe({
        error: (err) => {
          this.isRegistering.set(false);
          const message = err instanceof Error ? err.message : 'Unable to register user.';
          if (message === 'INVALID_EMAIL') {
            this.emailError.set('Invalid email address');
            return;
          }
          if (message === 'INVALID_PASSWORD') {
            this.passwordError.set('Password does not satisfy the required policy.');
            return;
          }
          if (this.captchaEnabled) {
            this.resetCaptcha();
          }
          this.error.set(message);
        },
        complete: () => {
          this.isRegistering.set(false);
          this.router.navigate(['/login'], { state: { registered: this.signupModel().username } });
        }
      });
  }

  private async mountCaptcha() {
    const siteKey = this.turnstileSiteKey();
    const container = this.captchaContainer()?.nativeElement;
    if (!siteKey || !container) return;

    this.captchaLoading.set(true);
    this.captchaError.set(null);

    try {
      await this.ensureTurnstileScript();
      if (!window.turnstile) {
        throw new Error('Turnstile is unavailable.');
      }
      this.captchaWidgetId = window.turnstile.render(container, {
        sitekey: siteKey,
        theme: 'light',
        callback: (token: string) => {
          this.captchaToken.set(token);
          this.captchaError.set(null);
        },
        'expired-callback': () => {
          this.captchaToken.set(null);
        },
        'error-callback': () => {
          this.captchaToken.set(null);
          this.captchaError.set('Captcha could not be verified. Please try again.');
        }
      });
    } catch (error) {
      this.captchaError.set(error instanceof Error ? error.message : 'Unable to load captcha.');
    } finally {
      this.captchaLoading.set(false);
    }
  }

  private ensureTurnstileScript(): Promise<void> {
    if (window.turnstile) {
      return Promise.resolve();
    }
    if (turnstileScriptPromise) {
      return turnstileScriptPromise;
    }

    turnstileScriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile-script="true"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Unable to load Turnstile script.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset['turnstileScript'] = 'true';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Unable to load Turnstile script.'));
      document.head.appendChild(script);
    });

    return turnstileScriptPromise;
  }

  private resetCaptcha() {
    this.captchaToken.set(null);
    if (this.captchaWidgetId && window.turnstile) {
      window.turnstile.reset(this.captchaWidgetId);
    }
  }

  private turnstileSiteKey(): string {
    return String(window.__runtimeConfig?.turnstileSiteKey ?? '').trim();
  }
}
