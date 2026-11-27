import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Store, User, Phone, MapPin, IndianRupee, ArrowRight, AlertCircle, ShieldCheck, LogOut, Globe } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const phoneSchema = z
  .string()
  .trim()
  .min(10, 'Valid phone number required (min 10 digits)')
  .max(20, 'Phone number cannot exceed 20 characters')
  .regex(/^[+\d\s().-]+$/, 'Phone number contains invalid characters')
  .refine((value) => value.replace(/\D/g, '').length >= 10, 'Valid phone number required (min 10 digits)');

const timezoneSchema = z
  .string()
  .trim()
  .min(1, 'Timezone is required')
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, 'Please provide a valid IANA timezone');

const setupShopSchema = z.object({
  name: z.string().trim().min(2, 'Shop name must be at least 2 characters').max(120, 'Shop name cannot exceed 120 characters'),
  ownerName: z.string().trim().min(2, 'Owner name must be at least 2 characters').max(120, 'Owner name cannot exceed 120 characters'),
  phone: phoneSchema,
  address: z.string().trim().max(500, 'Address cannot exceed 500 characters').optional(),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP', 'AED']),
  type: z.enum(['TEA_SHOP', 'CAFE', 'RESTAURANT', 'OTHER']),
  timezone: timezoneSchema,
});

type SetupShopFormData = z.infer<typeof setupShopSchema>;

export const SetupShopPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, createShop, logout } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetupShopFormData>({
    resolver: zodResolver(setupShopSchema),
    defaultValues: {
      ownerName: user?.name || '',
      currency: 'INR',
      type: 'TEA_SHOP',
      timezone: 'Asia/Kolkata',
    },
  });

  const onSubmit = async (data: SetupShopFormData) => {
    try {
      setServerError(null);
      await createShop(data);
      navigate('/dashboard');
    } catch (err: any) {
      setServerError(err.message || 'Failed to complete shop profile. Please try again.');
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setServerError(null);
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (err: any) {
      setServerError(err.message || 'Failed to log out. Please try again.');
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative">
      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
      >
        <LogOut className="h-4 w-4" />
        {isLoggingOut ? 'Logging out...' : 'Log out'}
      </button>
      <div className="sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-amber-600 text-white shadow-lg shadow-amber-600/20 mb-3">
            <Store className="h-7 w-7" />
          </div>
          <span className="block text-xs font-semibold text-amber-700 uppercase tracking-widest mb-1">
            Step 2 of 2 &bull; Shop Configuration
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
            Set Up Your Tea Shop
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Link your shop profile to start managing ingredients, transactions, and inventory.
          </p>
        </div>

        <div className="bg-white py-8 px-6 shadow-xl shadow-gray-200/50 sm:rounded-2xl sm:px-10 border border-gray-100">
          {serverError && (
            <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700 font-medium">{serverError}</div>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
            {/* Shop Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                Tea Shop / Cafe Name *
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Store className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  placeholder="e.g. Chai Point MG Road"
                  {...register('name')}
                  className={`block w-full pl-10 pr-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors ${
                    errors.name ? 'border-red-300 bg-red-50/30' : 'border-gray-300'
                  }`}
                />
              </div>
              {errors.name && (
                <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
              )}
            </div>

            {/* Owner Full Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                Owner / Manager Full Name *
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <User className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  placeholder="e.g. Rajesh Sharma"
                  {...register('ownerName')}
                  className={`block w-full pl-10 pr-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors ${
                    errors.ownerName ? 'border-red-300 bg-red-50/30' : 'border-gray-300'
                  }`}
                />
              </div>
              {errors.ownerName && (
                <p className="mt-1 text-xs text-red-600">{errors.ownerName.message}</p>
              )}
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                Contact Phone Number *
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Phone className="h-4 w-4" />
                </div>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  {...register('phone')}
                  className={`block w-full pl-10 pr-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors ${
                    errors.phone ? 'border-red-300 bg-red-50/30' : 'border-gray-300'
                  }`}
                />
              </div>
              {errors.phone && (
                <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>
              )}
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                Shop Address (Optional)
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <MapPin className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  placeholder="Shop No. 4, MG Road Market, Pune"
                  {...register('address')}
                  className="block w-full pl-10 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Currency */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                Currency
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <IndianRupee className="h-4 w-4" />
                </div>
                <select
                  {...register('currency')}
                  className="block w-full pl-10 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                >
                  <option value="INR">INR (₹) - Indian Rupee</option>
                  <option value="USD">USD ($) - US Dollar</option>
                  <option value="EUR">EUR (€) - Euro</option>
                  <option value="GBP">GBP (£) - British Pound</option>
                  <option value="AED">AED (د.إ) - UAE Dirham</option>
                </select>
              </div>
            </div>

            {/* Shop Type */}
            <div>
              <label htmlFor="shop-type" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                Shop Type
              </label>
              <select
                id="shop-type"
                {...register('type')}
                className="block w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              >
                <option value="TEA_SHOP">Tea Shop</option>
                <option value="CAFE">Cafe</option>
                <option value="RESTAURANT">Restaurant</option>
                <option value="OTHER">Other</option>
              </select>
              {errors.type && <p className="mt-1 text-xs text-red-600">{errors.type.message}</p>}
            </div>

            {/* Timezone */}
            <div>
              <label htmlFor="timezone" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                Timezone
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Globe className="h-4 w-4" />
                </div>
                <input
                  id="timezone"
                  type="text"
                  placeholder="Asia/Kolkata"
                  {...register('timezone')}
                  className={`block w-full pl-10 pr-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                    errors.timezone ? 'border-red-300 bg-red-50/30' : 'border-gray-300'
                  }`}
                />
              </div>
              {errors.timezone && <p className="mt-1 text-xs text-red-600">{errors.timezone.message}</p>}
            </div>

            {/* Multi-Tenant Notice */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-2.5 text-xs text-gray-600">
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>
                All inventory items, purchases, usage, and reports will be strictly isolated to your shop.
              </span>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Setting Up Shop...
                </span>
              ) : (
                <>
                  <span>Save Profile & Enter Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
