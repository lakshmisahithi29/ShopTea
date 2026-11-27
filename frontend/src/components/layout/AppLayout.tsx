import React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Coffee,
  LayoutDashboard,
  ArrowLeftRight,
  ShoppingCart,
  PackageMinus,
  Trash2,
  Truck,
  LogOut,
  Menu,
  X,
  ClipboardList,
  BookOpen,
  ReceiptText,
  Package,
  FileBarChart,
  Bell,
  Settings,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';

const navigation = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/inventory', label: 'Inventory', icon: Package },
  { to: '/reorder', label: 'Reorder list', icon: ClipboardList },
  { to: '/alerts', label: 'Stock alerts', icon: Bell, badge: true },
  { to: '/transactions', label: 'Stock Transactions', icon: ArrowLeftRight },
  { to: '/purchases', label: 'Purchases', icon: ShoppingCart },
  { to: '/menu', label: 'Menu & Recipes', icon: BookOpen },
  { to: '/sales', label: 'Sales', icon: ReceiptText },
  { to: '/usage', label: 'Daily Usage', icon: PackageMinus },
  { to: '/usage-history', label: 'Consumption History', icon: ClipboardList },
  { to: '/transactions/wastage', label: 'Wastage', icon: Trash2 },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/predictions', label: 'Stock predictions', icon: TrendingUp },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/profile', label: 'User profile', icon: UserRound },
];

export const AppLayout: React.FC = () => {
  const { shop, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = React.useState(false);
  const [alertCount, setAlertCount] = React.useState(0);
  const currentPage = navigation.find((item) => location.pathname === item.to || (item.to !== '/dashboard' && location.pathname.startsWith(`${item.to}/`)));
  const initials = (user?.name || user?.username || 'U').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  const loadAlerts = React.useCallback(async () => {
    try {
      const res = await api.get('/alerts/summary');
      setAlertCount(res.data.summary?.activeCount || 0);
    } catch {
      setAlertCount(0);
    }
  }, []);

  React.useEffect(() => {
    loadAlerts();
  }, [loadAlerts, location.pathname]);

  const signOut = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {open && (
        <button aria-label="Close menu" className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 flex items-center border-b border-slate-100">
          <div className="bg-amber-600 text-white p-2 rounded-xl">
            <Coffee className="w-5 h-5" />
          </div>
          <div className="ml-3">
            <p className="font-bold text-slate-900">ShopTea</p>
            <p className="text-xs text-slate-500 truncate max-w-[150px]">{shop?.name}</p>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="p-3 space-y-1 pb-20">
          {navigation.map(({ to, label, icon: Icon, badge }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                  isActive ? 'bg-amber-50 text-amber-800' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span className="flex-1">{label}</span>
              {badge && alertCount > 0 && (
                <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] flex items-center justify-center">
                  {alertCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-slate-100">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu className="w-6 h-6 text-slate-700" />
          </button>
          <div className="hidden lg:flex items-center gap-2 text-sm">
            <span className="text-slate-400">Workspace</span>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-700">{currentPage?.label || 'ShopTea'}</span>
          </div>
          <span className="ml-3 font-semibold lg:hidden">ShopTea</span>
          <nav className="hidden md:flex items-center gap-1 ml-6" aria-label="Quick navigation">
            {[{ to: '/dashboard', label: 'Dashboard' }, { to: '/reports', label: 'Reports' }, { to: '/predictions', label: 'Predictions' }].map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `px-3 py-1.5 rounded-lg text-sm ${isActive ? 'bg-amber-50 text-amber-800 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}>{item.label}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:block text-sm text-slate-500 max-w-40 truncate">{shop?.name}</span>
            {alertCount > 0 && (
              <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] flex items-center justify-center">
                {alertCount}
              </span>
            )}
            <NavLink to="/profile" className="h-9 w-9 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-xs font-bold" aria-label="Open user profile">
              {initials}
            </NavLink>
          </div>
        </header>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
