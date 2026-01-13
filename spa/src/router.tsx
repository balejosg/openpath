import { createBrowserRouter, Navigate } from 'react-router-dom';

import App from './App';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import LoginView from '@/views/auth/LoginView';
import SetupView from '@/views/auth/SetupView';
import DashboardOverviewView from '@/views/dashboard/DashboardOverviewView';
import ClassroomsView from '@/views/dashboard/ClassroomsView';
import GroupsListView from '@/views/dashboard/GroupsListView';
import GroupDetailView from '@/views/dashboard/GroupDetailView';
import RequestsView from '@/views/dashboard/RequestsView';
import UsersView from '@/views/dashboard/UsersView';

export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/login" replace /> },
      { path: 'login', element: <LoginView /> },
      { path: 'setup', element: <SetupView /> },
      {
        path: 'dashboard',
        element: (
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <DashboardOverviewView /> },
          { path: 'classrooms', element: <ClassroomsView /> },
          { path: 'groups', element: <GroupsListView /> },
          { path: 'groups/:name', element: <GroupDetailView /> },
          { path: 'users', element: <UsersView /> },
          { path: 'requests', element: <RequestsView /> },
        ],
      },
    ],
  },
]);
