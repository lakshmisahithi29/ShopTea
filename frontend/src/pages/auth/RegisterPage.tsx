import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import {
  Coffee,
  Mail,
  Lock,
  User,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(4, 'Username must be at least 4 characters')
      .max(20, 'Username cannot exceed 20 characters')
      .regex(
        /^[a-zA-Z0-9_]+$/,
        'Only letters, numbers, and underscores allowed'
      )
      .transform((val) => val.toLowerCase()),
    email: z
      .string()
      .trim()
      .email('Please enter a valid email address')
      .toLowerCase(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Za-z]/, 'Must contain at least one letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export const RegisterPage: React.FC = () => {
  const { register: registerAuth } = useAuth();
  const navigate = useNavigate();

  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const passwordValue = watch('password', '');
  const hasMinLength = passwordValue.length >= 8;
  const hasLetter = /[A-Za-z]/.test(passwordValue);
  const hasNumber = /[0-9]/.test(passwordValue);

  const onSubmit = async (data: RegisterFormData) => {
    try {
      setServerError(null);

      const res = await registerAuth({
        username: data.username,
        email: data.email,
        password: data.password,
      });

      if (res.success) {
        navigate('/login', {
          state: { message: 'Account created successfully. Please log in.' },
        });
      } else {
        setServerError('Registration failed. Please try again.');
      }
    } catch (err: any) {
      setServerError(
        err.message || 'Registration failed. Please try again.'
      );
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
          Create ShopTea Account
        </h2>

        <p className="mt-2 text-center text-sm text-gray-600">
          Sign up to manage your tea shop inventory and stock movements
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-xl shadow-gray-200/50 sm:rounded-2xl sm:px-10 border border-gray-100">
          {serverError && (
            <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700 font-medium">
                {serverError}
              </div>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
            {/* Username */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                Username / User ID
              </label>

              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <User className="h-4 w-4" />
                </div>

                <input
                  type="text"
                  placeholder="e.g. chaiking_pune"
                  {...register('username')}
                  className={`block w-full pl-10 pr-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors ${errors.username
                      ? 'border-red-300 bg-red-50/30'
                      : 'border-gray-300'
                    }`}
                />
              </div>

              {errors.username ? (
                <p className="mt-1 text-xs text-red-600">
                  {errors.username.message}
                </p>
              ) : (
                <p className="mt-1 text-xs text-gray-400">
                  4-20 chars: letters, numbers, or underscore
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                Email Address
              </label>

              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Mail className="h-4 w-4" />
                </div>

                <input
                  type="email"
                  placeholder="owner@chaishop.com"
                  {...register('email')}
                  className={`block w-full pl-10 pr-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors ${errors.email
                      ? 'border-red-300 bg-red-50/30'
                      : 'border-gray-300'
                    }`}
                />
              </div>

              {errors.email && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.email.message}
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

              {/* Password strength checklist */}
              <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] text-gray-500">
                <span
                  className={`inline-flex items-center gap-1 ${hasMinLength ? 'text-emerald-600 font-medium' : ''
                    }`}
                >
                  <CheckCircle2
                    className={`w-3 h-3 ${hasMinLength ? 'text-emerald-500' : 'text-gray-300'
                      }`}
                  />
                  8+ chars
                </span>

                <span
                  className={`inline-flex items-center gap-1 ${hasLetter ? 'text-emerald-600 font-medium' : ''
                    }`}
                >
                  <CheckCircle2
                    className={`w-3 h-3 ${hasLetter ? 'text-emerald-500' : 'text-gray-300'
                      }`}
                  />
                  1 letter
                </span>

                <span
                  className={`inline-flex items-center gap-1 ${hasNumber ? 'text-emerald-600 font-medium' : ''
                    }`}
                >
                  <CheckCircle2
                    className={`w-3 h-3 ${hasNumber ? 'text-emerald-500' : 'text-gray-300'
                      }`}
                  />
                  1 number
                </span>
              </div>

              {errors.password && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                Confirm Password
              </label>

              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock className="h-4 w-4" />
                </div>

                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...register('confirmPassword')}
                  className={`block w-full pl-10 pr-10 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors ${errors.confirmPassword
                      ? 'border-red-300 bg-red-50/30'
                      : 'border-gray-300'
                    }`}
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowConfirmPassword(!showConfirmPassword)
                  }
                  aria-label={
                    showConfirmPassword
                      ? 'Hide password'
                      : 'Show password'
                  }
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.confirmPassword.message}
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
                    Creating Account…
                  </span>
                ) : (
                  <>
                    <span>Create Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center text-xs text-gray-500">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-semibold text-amber-600 hover:text-amber-500 underline underline-offset-2"
            >
              Log in here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};