import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Coffee } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const PublicOnlyRoute: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="bg-amber-600 text-white p-4 rounded-2xl shadow-lg animate-pulse mb-4">
          <Coffee className="w-8 h-8" />
        </div>
        <p className="text-sm font-semibold text-gray-700">Loading ShopTea...</p>
      </div>
    );
  }

  if (isAuthenticated && user) {
    const hasShop = !!user.shop || !!user.shopId;
    const requestedPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
    const destination = hasShop
      ? requestedPath && !['/login', '/register'].includes(requestedPath)
        ? requestedPath
        : '/dashboard'
      : '/setup-shop';

    return <Navigate to={destination} replace />;
  }

  return <Outlet />;
};
