import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { PublicOnlyRoute } from './components/common/PublicOnlyRoute';
import { LoadingState } from './components/common/UI';
import { AppLayout } from './components/layout/AppLayout';

const LoginPage = lazy(() => import('./pages/auth/LoginPage').then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage').then((module) => ({ default: module.RegisterPage })));
const SetupShopPage = lazy(() => import('./pages/auth/SetupShopPage').then((module) => ({ default: module.SetupShopPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const StockTransactionsPage = lazy(() => import('./pages/inventory/StockTransactionsPage').then((module) => ({ default: module.StockTransactionsPage })));
const SuppliersPage = lazy(() => import('./pages/inventory/SuppliersPage').then((module) => ({ default: module.SuppliersPage })));
const ReorderListPage = lazy(() => import('./pages/inventory/ReorderListPage').then((module) => ({ default: module.ReorderListPage })));
const InventoryItemsPage = lazy(() => import('./pages/inventory/InventoryItemsPage').then((module) => ({ default: module.InventoryItemsPage })));
const PurchasesPage = lazy(() => import('./pages/inventory/PurchasesPage').then((module) => ({ default: module.PurchasesPage })));
const MenuItemsPage = lazy(() => import('./pages/inventory/MenuItemsPage').then((module) => ({ default: module.MenuItemsPage })));
const SalesPage = lazy(() => import('./pages/inventory/SalesPage').then((module) => ({ default: module.SalesPage })));
const DailyUsagePage = lazy(() => import('./pages/inventory/DailyUsagePage').then((module) => ({ default: module.DailyUsagePage })));
const ConsumptionHistoryPage = lazy(() => import('./pages/inventory/ConsumptionHistoryPage').then((module) => ({ default: module.ConsumptionHistoryPage })));
const StockAlertsPage = lazy(() => import('./pages/inventory/StockAlertsPage').then((module) => ({ default: module.StockAlertsPage })));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage').then((module) => ({ default: module.ReportsPage })));
const StockPredictionsPage = lazy(() => import('./pages/forecasts/StockPredictionsPage').then((module) => ({ default: module.StockPredictionsPage })));
const ShopSettingsPage = lazy(() => import('./pages/settings/ShopSettingsPage').then((module) => ({ default: module.ShopSettingsPage })));
const ProfilePage = lazy(() => import('./pages/settings/ProfilePage').then((module) => ({ default: module.ProfilePage })));

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><LoadingState label="Loading page…" /></div>}>
          <Routes>
            {/* Public Authentication Routes */}
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>
            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/setup-shop" element={<SetupShopPage />} />
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/inventory" element={<InventoryItemsPage />} />
                <Route path="/reorder" element={<ReorderListPage />} />
                <Route path="/alerts" element={<StockAlertsPage />} />
                <Route path="/transactions" element={<StockTransactionsPage />} />
                <Route path="/transactions/:type" element={<StockTransactionsPage />} />
                <Route path="/purchases" element={<PurchasesPage />} />
                <Route path="/purchases/new" element={<PurchasesPage />} />
                <Route path="/menu" element={<MenuItemsPage />} />
                <Route path="/sales" element={<SalesPage />} />
                <Route path="/sales/new" element={<SalesPage />} />
                <Route path="/usage" element={<DailyUsagePage />} />
                <Route path="/usage/new" element={<DailyUsagePage />} />
                <Route path="/usage-history" element={<ConsumptionHistoryPage />} />
                <Route path="/suppliers" element={<SuppliersPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/predictions" element={<StockPredictionsPage />} />
                <Route path="/settings" element={<ShopSettingsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
