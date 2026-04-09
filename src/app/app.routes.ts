import { Routes } from '@angular/router';
import { Login } from '@pages/auth/login/login';
import { Signup } from '@pages/auth/signup/signup';
import { AppLayout } from '@layouts/app-layout/app-layout';
import { authGuard } from '@guards/auth-guard';
import { adminGuard } from '@guards/admin-guard';

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
        loadComponent: () => import('@layouts/flow-editor/flow-editor').then(m => m.FlowEditor)
      },
      { 
        path: 'tasks',
        loadComponent: () => import('@layouts/tasks-executor/tasks-executor').then(m => m.TasksExecutor)
      },
      {
        path: 'admin',
        loadComponent: () => import('@layouts/admin-layout/admin-layout').then(m => m.AdminLayout),
        canActivate: [adminGuard],
        children: [
          {
            path: '',
            redirectTo: 'users',
            pathMatch: 'full'
          },
          {
            path: 'users',
            loadComponent: () => import('@pages/admin/admin-users-list/admin-users-list').then(m => m.AdminUsersListPage)
          },
          {
            path: 'create-user',
            loadComponent: () => import('@pages/admin/admin-create-user/admin-create-user').then(m => m.AdminCreateUserPage)
          },
          {
            path: 'stats',
            loadComponent: () => import('@pages/admin/admin-stats/admin-stats').then(m => m.AdminStatsPage)
          }
        ]
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
