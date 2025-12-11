import { Routes } from '@angular/router';
import { Login } from '@pages/auth/login/login';
import { Signup } from '@pages/auth/signup/signup';
import { AppLayout } from '@layouts/app-layout/app-layout';
import { authGuard } from '@guards/auth-guard';

export const routes: Routes = [
 {
    path: '',
    component: AppLayout,
    canActivate: [authGuard]
 },  
{
    path: 'login',
    component: Login,
  },
  {
    path: 'sign-up',
    component: Signup,
  },
  {
    path: '**',
    redirectTo: '/',
  },
];
