import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Coffee,
  Lock,
  User,
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Please enter your username or email'),
  password: z.string().min(1, 'Please enter your password'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const successMessage = (location.state as { message?: string } | null)?.message;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setServerError(null);

      const res = await login(data);

      if (res.success && res.user) {
        const hasShop = !!res.user.shop || !!res.user.shopId;

        if (!hasShop) {
          navigate('/setup-shop');
        } else {
          const from =
            (location.state as any)?.from?.pathname || '/dashboard';

          navigate(from, { replace: true });
        }
      } else {
        setServerError('Login failed. Please check your credentials.');
      }
    } catch (err: any) {
      setServerError(err.message || 'Invalid credentials');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/60 via-slate-50 to-orange-50/40 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="bg-amber-600 text-white p-3.5 rounded-2xl shadow-lg shadow-amber-600/20">
            <Coffee className="w-8 h-8" />
          </div>
        </div>

        <h2 className="mt-4 text-center text-3xl font-extrabold tracking-tight text-gray-900">
          Sign In to ShopTea
        </h2>

        <p className="mt-2 text-center text-sm text-gray-600">
          Daily inventory &amp; stock control for your tea shop
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-xl shadow-gray-200/50 sm:rounded-2xl sm:px-10 border border-gray-100">
          {successMessage && (
            <div className="mb-6 bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-lg">
              <p className="text-sm text-emerald-700 font-medium">{successMessage}</p>
            </div>
          )}

          {serverError && (
            <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-700 font-medium">
                  {serverError}
                </div>
              </div>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
            {/* Username or Email */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                Username or Email
              </label>

              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <User className="h-4 w-4" />
                </div>

                <input
                  type="text"
                  placeholder="e.g. chaiking_pune or owner@tea.com"
                  {...register('identifier')}
                  className={`block w-full pl-10 pr-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors ${errors.identifier
                      ? 'border-red-300 bg-red-50/30'
                      : 'border-gray-300'
                    }`}
                />
              </div>

              {errors.identifier && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.identifier.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                Password
              </label>

              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock className="h-4 w-4" />
                </div>

                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...register('password')}
                  className={`block w-full pl-10 pr-10 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors ${errors.password
                      ? 'border-red-300 bg-red-50/30'
                      : 'border-gray-300'
                    }`}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {errors.password && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Authenticating…
                  </span>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-4 text-center text-xs text-gray-500">
            Don&apos;t have an account yet?{' '}
            <Link
              to="/register"
              className="font-semibold text-amber-600 hover:text-amber-500 underline underline-offset-2"
            >
              Sign up here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};