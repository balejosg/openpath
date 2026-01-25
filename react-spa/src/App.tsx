import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './views/Dashboard';
import Classrooms from './views/Classrooms';
import Groups from './views/Groups';
import UsersView from './views/Users';
import Login from './views/Login';
import Register from './views/Register';
import { ShieldAlert, CheckCircle } from 'lucide-react';
import { isAuthenticated, onAuthChange } from './lib/auth';

type AuthView = 'login' | 'register';

const App: React.FC = () => {
  const [isAuth, setIsAuth] = useState(isAuthenticated());
  const [authView, setAuthView] = useState<AuthView>('login');
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    return onAuthChange(() => {
      setIsAuth(isAuthenticated());
    });
  }, []);

  const handleLogin = () => setIsAuth(true);
  const handleRegister = () => setIsAuth(true);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'classrooms': return <Classrooms />;
      case 'groups': return <Groups />;
      case 'users': return <UsersView />;
      case 'domains':
        return (
             <div className="flex flex-col items-center justify-center h-[60vh] bg-white rounded-lg border border-slate-200 shadow-sm text-slate-500">
                <div className="bg-green-50 p-4 rounded-full mb-4">
                    <CheckCircle size={48} className="text-green-500" />
                </div>
                <h2 className="text-xl font-semibold text-slate-800">Todo en orden</h2>
                <p className="mt-2 text-slate-500 text-sm">No hay solicitudes de dominio pendientes de revisión.</p>
             </div>
        );
      default: return <Dashboard />;
    }
  };

  const getTitle = () => {
     switch (activeTab) {
        case 'dashboard': return 'Vista General';
        case 'classrooms': return 'Gestión de Aulas';
        case 'groups': return 'Grupos y Políticas';
        case 'users': return 'Administración de Usuarios';
        case 'domains': return 'Solicitudes de Acceso';
        default: return 'OpenPath';
     }
  };

  if (!isAuth) {
    if (authView === 'register') {
        return <Register onRegister={handleRegister} onNavigateToLogin={() => setAuthView('login')} />;
    }
    return <Login onLogin={handleLogin} onNavigateToRegister={() => setAuthView('register')} />;
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
          <div className="max-w-7xl mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;