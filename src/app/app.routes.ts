import { Routes } from '@angular/router';
import { Login } from '@pages/auth/login/login';
import { Signup } from '@pages/auth/signup/signup';
import { AppLayout } from '@layouts/app-layout/app-layout';
import { authGuard } from '@guards/auth-guard';
import { FlowEditor } from '@layouts/flow-editor/flow-editor';
import { TasksExecutor } from '@layouts/tasks-executor/tasks-executor';

export const routes: Routes = [
 {
    path: '',
    component: AppLayout,
    children: [
      {
        path: '',
        redirectTo: 'editor',
        pathMatch: 'full'
      },
      {
        path: 'editor',
        component: FlowEditor
      },
      { 
        path: 'tasks',
        component: TasksExecutor
      }
    ],
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
