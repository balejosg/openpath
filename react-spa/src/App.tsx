import React, { useState, useEffect } from 'react';
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
}

const App: React.FC = () => {
  const [isAuth, setIsAuth] = useState(isAuthenticated());
  const [authView, setAuthView] = useState<AuthView>('login');

  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // State for rules manager navigation
  const [selectedGroup, setSelectedGroup] = useState<SelectedGroup | null>(null);

  useEffect(() => {
    return onAuthChange(() => {
      setIsAuth(isAuthenticated());
    });
  }, []);

  const handleLogin = () => setIsAuth(true);
  const handleRegister = () => setIsAuth(true);

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
