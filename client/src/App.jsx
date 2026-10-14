import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LuLayoutDashboard, LuCreditCard, LuTriangleAlert, LuStore, LuSettings,
  LuPanelLeftClose, LuPanelLeftOpen,
} from 'react-icons/lu';
import logoWhite from './assets/promar-logo-white.png';
import Dashboard from './pages/Dashboard';
import Payments from './pages/Payments';
import Issues from './pages/Issues';
import Stores from './pages/Stores';
import StoreDetail from './pages/StoreDetail';
import Login from './pages/Login';
import Settings from './pages/Settings';
import { NotifyProvider } from './notify';
import { Toasts } from './components/Notify';
import { initTheme } from './theme';
import { initPWA } from './pwa';
import { registerSW } from './push';
import { AuthProvider, useAuth } from './auth';

initTheme();
initPWA();
registerSW(); // Service Worker (PWA quraşdırma + push bildirişləri)

const LINKS = [
  { to: '/', label: 'İdarəetmə', icon: LuLayoutDashboard, end: true, admin: false },
  { to: '/odenisler', label: 'Ödənişlər', icon: LuCreditCard, admin: false },
  { to: '/problemler', label: 'Problemlər', icon: LuTriangleAlert, admin: false },
  { to: '/magazalar', label: 'Mağazalar', icon: LuStore, admin: true },
  { to: '/parametrlər', label: 'Parametrlər', icon: LuSettings, admin: false },
];

function LoginRoute() {
  const { user, checking } = useAuth();
  // Uğurlu girişdən sonra panelə keç
  if (checking) return <div className="loading" style={{ paddingTop: 80 }}>Yüklənir…</div>;
  if (user) return <Navigate to="/" replace />;
  return <Login />;
}

function Shell() {
  const { user, checking, isAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('promar.sidebar') === 'collapsed');

  useEffect(() => {
    localStorage.setItem('promar.sidebar', collapsed ? 'collapsed' : 'full');
  }, [collapsed]);

  if (checking) return <div className="loading" style={{ paddingTop: 80 }}>Yüklənir…</div>;
  if (!user) return <Navigate to="/login" replace />;

  const links = LINKS.filter((l) => !l.admin || isAdmin);

  return (
    <div className={`layout${collapsed ? ' collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="logo">
            <img src={logoWhite} alt="PROMAR" />
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? 'Menyunu genişlət' : 'Menyunu daralt'}
            aria-label={collapsed ? 'Menyunu genişlət' : 'Menyunu daralt'}
          >
            {collapsed ? <LuPanelLeftOpen size={16} /> : <LuPanelLeftClose size={16} />}
          </button>
        </div>

        <div className="nav-list">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/odenisler" element={<Payments />} />
          <Route path="/problemler" element={<Issues />} />
          <Route path="/magazalar" element={isAdmin ? <Stores /> : <Navigate to="/" replace />} />
          <Route path="/magazalar/:id" element={<StoreDetail />} />
          <Route path="/parametrlər" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NotifyProvider>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/*" element={<Shell />} />
        </Routes>
      </NotifyProvider>
    </AuthProvider>
  );
}