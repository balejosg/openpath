import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './views/Dashboard';
import TeacherDashboard from './views/TeacherDashboard';
import Classrooms from './views/Classrooms';
import Groups from './views/Groups';
import UsersView from './views/Users';
import Login from './views/Login';
import Register from './views/Register';
import ForgotPassword from './views/ForgotPassword';
import ResetPassword from './views/ResetPassword';
import Settings from './views/Settings';
import DomainRequests from './views/DomainRequests';
import RulesManager from './views/RulesManager';
import { isAuthenticated, onAuthChange, isAdmin } from './lib/auth';

type AuthView = 'login' | 'register' | 'forgot-password' | 'reset-password';

interface SelectedGroup {
  id: string;
  name: string;
  readOnly?: boolean;
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed.length === 0 ? '/' : trimmed;
}

function getTabFromPathname(pathname: string): string {
  const normalized = normalizePathname(pathname);

  if (normalized === '/' || normalized.startsWith('/dashboard')) return 'dashboard';
  if (normalized.startsWith('/aulas')) return 'classrooms';
  if (normalized.startsWith('/politicas') || normalized.startsWith('/grupos')) return 'groups';
  if (normalized.startsWith('/reglas')) return 'rules';
  if (normalized.startsWith('/usuarios')) return 'users';
  if (normalized.startsWith('/dominios')) return 'domains';
  if (normalized.startsWith('/configuracion') || normalized.startsWith('/settings'))
    return 'settings';

  return 'dashboard';
}

function getAuthViewFromPathname(pathname: string): AuthView {
  const normalized = normalizePathname(pathname);

  if (normalized.startsWith('/register')) return 'register';
  if (normalized.startsWith('/forgot-password')) return 'forgot-password';
  if (normalized.startsWith('/reset-password')) return 'reset-password';
  if (normalized.startsWith('/login') || normalized === '/') return 'login';

  // Unknown path while unauthenticated: show login but keep URL (deep-link intent).
  return 'login';
}

function isAuthPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return (
    normalized === '/' ||
    normalized.startsWith('/login') ||
    normalized.startsWith('/register') ||
    normalized.startsWith('/forgot-password') ||
    normalized.startsWith('/reset-password')
  );
}

function getPathForTab(tab: string): string {
  switch (tab) {
    case 'dashboard':
      return '/';
    case 'classrooms':
      return '/aulas';
    case 'groups':
      return '/politicas';
    case 'rules':
      return '/reglas';
    case 'users':
      return '/usuarios';
    case 'domains':
      return '/dominios';
    case 'settings':
      return '/configuracion';
    default:
      return '/';
  }
}

function getPathForAuthView(view: AuthView): string {
  switch (view) {
    case 'register':
      return '/register';
    case 'forgot-password':
      return '/forgot-password';
    case 'reset-password':
      return '/reset-password';
    case 'login':
    default:
      return '/login';
  }
}

const App: React.FC = () => {
  const initialPathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const initialIsAuth = isAuthenticated();

  const [isAuth, setIsAuth] = useState(initialIsAuth);
  const [authView, setAuthView] = useState<AuthView>(() =>
    getAuthViewFromPathname(initialPathname)
  );

  const [activeTab, setActiveTab] = useState(() => getTabFromPathname(initialPathname));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isAuthRef = useRef(isAuth);

  useEffect(() => {
    isAuthRef.current = isAuth;
  }, [isAuth]);

  // State for rules manager navigation
  const [selectedGroup, setSelectedGroup] = useState<SelectedGroup | null>(null);

  useEffect(() => {
    return onAuthChange(() => {
      const authed = isAuthenticated();
      setIsAuth(authed);

      if (typeof window !== 'undefined') {
        const pathname = window.location.pathname;
        if (authed) {
          setActiveTab(getTabFromPathname(pathname));
        } else {
          setAuthView(getAuthViewFromPathname(pathname));
        }
      }
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      const pathname = window.location.pathname;
      if (isAuthRef.current) {
        setActiveTab(getTabFromPathname(pathname));
      } else {
        setAuthView(getAuthViewFromPathname(pathname));
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (isAuth) {
      const nextPath = getPathForTab(activeTab);
      if (window.location.pathname !== nextPath) {
        window.history.pushState(null, '', nextPath);
      }
      return;
    }

    // If the user deep-linked to a non-auth URL while logged out, preserve the URL.
    // Only update the URL for explicit auth routes (or when user navigates within auth views).
    if (authView !== 'login' || isAuthPath(window.location.pathname)) {
      const nextPath = getPathForAuthView(authView);
      if (window.location.pathname !== nextPath) {
        window.history.pushState(null, '', nextPath);
      }
    }
  }, [isAuth, activeTab, authView]);

  const handleLogin = () => {
    setIsAuth(true);
    if (typeof window !== 'undefined') {
      setActiveTab(getTabFromPathname(window.location.pathname));
    }
  };
  const handleRegister = () => {
    setIsAuth(true);
    if (typeof window !== 'undefined') {
      setActiveTab(getTabFromPathname(window.location.pathname));
    }
  };

  // Handle navigation to rules manager
  const handleNavigateToRules = (group: SelectedGroup) => {
    setSelectedGroup(group);
    setActiveTab('rules');
  };

  // Handle back from rules manager
  const handleBackFromRules = () => {
    setSelectedGroup(null);
    setActiveTab('groups');
  };

  const admin = isAdmin();

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return admin ? (
          <Dashboard onNavigateToRules={handleNavigateToRules} />
        ) : (
          <TeacherDashboard onNavigateToRules={handleNavigateToRules} />
        );
      case 'classrooms':
        return <Classrooms />;
      case 'groups':
        return <Groups onNavigateToRules={handleNavigateToRules} />;
      case 'rules':
        return selectedGroup ? (
          <RulesManager
            groupId={selectedGroup.id}
            groupName={selectedGroup.name}
            readOnly={selectedGroup.readOnly}
            onBack={handleBackFromRules}
          />
        ) : (
          <Groups onNavigateToRules={handleNavigateToRules} />
        );
      case 'users':
        return admin ? (
          <UsersView />
        ) : (
          <TeacherDashboard onNavigateToRules={handleNavigateToRules} />
        );
      case 'settings':
        return <Settings />;
      case 'domains':
        return admin ? (
          <DomainRequests />
        ) : (
          <TeacherDashboard onNavigateToRules={handleNavigateToRules} />
        );
      default:
        return admin ? (
          <Dashboard onNavigateToRules={handleNavigateToRules} />
        ) : (
          <TeacherDashboard onNavigateToRules={handleNavigateToRules} />
        );
    }
  };

  const getTitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return admin ? 'Vista General' : 'Mi Panel';
      case 'classrooms':
        return admin ? 'Gestión de Aulas' : 'Aulas';
      case 'groups':
        return admin ? 'Grupos y Políticas' : 'Mis Políticas';
      case 'rules':
        return selectedGroup ? `Reglas: ${selectedGroup.name}` : 'Gestión de Reglas';
      case 'users':
        return admin ? 'Administración de Usuarios' : 'Mi Panel';
      case 'domains':
        return admin ? 'Solicitudes de Acceso' : 'Mi Panel';
      case 'settings':
        return 'Configuración';
      default:
        return 'OpenPath';
    }
  };

  if (!isAuth) {
    switch (authView) {
      case 'register':
        return (
          <Register onRegister={handleRegister} onNavigateToLogin={() => setAuthView('login')} />
        );
      case 'forgot-password':
        return (
          <ForgotPassword
            onNavigateToLogin={() => setAuthView('login')}
            onNavigateToReset={() => setAuthView('reset-password')}
          />
        );
      case 'reset-password':
        return (
          <ResetPassword
            onNavigateToLogin={() => setAuthView('login')}
            onNavigateToForgot={() => setAuthView('forgot-password')}
          />
        );
      default:
        return (
          <Login
            onLogin={handleLogin}
            onNavigateToRegister={() => setAuthView('register')}
            onNavigateToForgot={() => setAuthView('forgot-password')}
          />
        );
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setSidebarOpen(false);
        }}
        isOpen={sidebarOpen}
      />

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
        <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} title={getTitle()} />

        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">{renderContent()}</div>
        </main>
      </div>
    </div>
  );
};

export default App;
