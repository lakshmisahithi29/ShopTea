import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Coffee } from 'lucide-react';

export const ProtectedRoute: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="bg-amber-600 text-white p-4 rounded-2xl shadow-lg animate-pulse mb-4">
          <Coffee className="w-8 h-8" />
        </div>
        <p className="text-sm font-semibold text-gray-700">Loading ShopTea...</p>
        <p className="text-xs text-gray-400 mt-1">Verifying your secure session</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If user is logged in but hasn't completed shop setup yet
  const hasShop = !!user.shop || !!user.shopId;
  const isSetupRoute = location.pathname === '/setup-shop';

  if (!hasShop && !isSetupRoute) {
    return <Navigate to="/setup-shop" replace />;
  }

  if (hasShop && isSetupRoute) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
