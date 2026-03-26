import { Routes } from '@angular/router';
import { Login } from '@pages/auth/login/login';
import { Signup } from '@pages/auth/signup/signup';
import { AppLayout } from '@layouts/app-layout/app-layout';
import { authGuard } from '@guards/auth-guard';
import { adminGuard } from '@guards/admin-guard';
import { AdminLayout } from '@layouts/admin-layout/admin-layout';
import { FlowEditor } from '@layouts/flow-editor/flow-editor';
import { TasksExecutor } from '@layouts/tasks-executor/tasks-executor';
import { AdminCreateUserPage } from '@pages/admin/admin-create-user/admin-create-user';
import { AdminStatsPage } from '@pages/admin/admin-stats/admin-stats';
import { AdminUsersListPage } from '@pages/admin/admin-users-list/admin-users-list';

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
      },
      {
        path: 'admin',
        component: AdminLayout,
        canActivate: [adminGuard],
        children: [
          {
            path: '',
            redirectTo: 'users',
            pathMatch: 'full'
          },
          {
            path: 'users',
            component: AdminUsersListPage
          },
          {
            path: 'create-user',
            component: AdminCreateUserPage
          },
          {
            path: 'stats',
            component: AdminStatsPage
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
