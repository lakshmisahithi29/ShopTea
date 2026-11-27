import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, CheckCircle, Globe, Loader2, Save, Settings as SettingsIcon, Store } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getShop } from '../../api/shop';

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
  .max(64, 'Timezone cannot exceed 64 characters')
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, 'Please provide a valid IANA timezone');

const shopSettingsSchema = z.object({
  name: z.string().trim().min(2, 'Shop name must be at least 2 characters').max(120, 'Shop name cannot exceed 120 characters'),
  ownerName: z.string().trim().min(2, 'Owner name must be at least 2 characters').max(120, 'Owner name cannot exceed 120 characters'),
  phone: phoneSchema,
  address: z.string().trim().max(500, 'Address cannot exceed 500 characters').optional(),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP', 'AED']),
  type: z.enum(['TEA_SHOP', 'CAFE', 'RESTAURANT', 'OTHER']),
  timezone: timezoneSchema,
  settings: z.object({
    lowStockAlerts: z.boolean(),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]),
    dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY']),
  }),
});

type ShopSettingsFormData = z.infer<typeof shopSettingsSchema>;

const inputClass = 'block w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white';

export const ShopSettingsPage: React.FC = () => {
  const { updateShop: saveShop } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ShopSettingsFormData>({ resolver: zodResolver(shopSettingsSchema) });

  const loadShop = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const shop = await getShop();
      reset({
        name: shop.name,
        ownerName: shop.ownerName,
        phone: shop.phone,
        address: shop.address ?? '',
        currency: shop.currency as ShopSettingsFormData['currency'],
        type: shop.type,
        timezone: shop.timezone,
        settings: shop.settings,
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load shop settings.');
    } finally {
      setIsLoading(false);
    }
  }, [reset]);

  useEffect(() => {
    loadShop();
  }, [loadShop]);

  const onSubmit = async (data: ShopSettingsFormData) => {
    setServerError(null);
    setSuccessMessage(null);
    try {
      const shop = await saveShop(data);
      reset({
        ...data,
        address: shop.address ?? '',
        currency: shop.currency as ShopSettingsFormData['currency'],
        type: shop.type,
        timezone: shop.timezone,
        settings: shop.settings,
      });
      setSuccessMessage('Shop settings saved successfully.');
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Failed to save shop settings.');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-medium">Loading shop settings...</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto mt-10 bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-slate-900">Unable to load settings</h1>
        <p className="mt-2 text-sm text-slate-600">{loadError}</p>
        <button
          type="button"
          onClick={loadShop}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-start gap-3">
        <div className="rounded-xl bg-amber-100 p-3 text-amber-700">
          <SettingsIcon className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Shop Settings</h1>
          <p className="mt-1 text-sm text-slate-600">Manage your shop profile, regional preferences, and inventory alert settings.</p>
        </div>
      </div>

      {successMessage && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle className="h-5 w-5 flex-shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {serverError && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="font-medium">{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-4">
            <Store className="h-5 w-5 text-amber-600" />
            <h2 className="font-semibold text-slate-900">Shop Profile</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="settings-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">Shop Name</label>
              <input id="settings-name" {...register('name')} className={`${inputClass} ${errors.name ? 'border-red-300' : ''}`} />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
            </div>
            <div>
              <label htmlFor="settings-owner" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">Owner / Manager</label>
              <input id="settings-owner" {...register('ownerName')} className={`${inputClass} ${errors.ownerName ? 'border-red-300' : ''}`} />
              {errors.ownerName && <p className="mt-1 text-xs text-red-600">{errors.ownerName.message}</p>}
            </div>
            <div>
              <label htmlFor="settings-phone" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">Contact Phone</label>
              <input id="settings-phone" type="tel" {...register('phone')} className={`${inputClass} ${errors.phone ? 'border-red-300' : ''}`} />
              {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
            </div>
            <div>
              <label htmlFor="settings-type" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">Shop Type</label>
              <select id="settings-type" {...register('type')} className={inputClass}>
                <option value="TEA_SHOP">Tea Shop</option>
                <option value="CAFE">Cafe</option>
                <option value="RESTAURANT">Restaurant</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="settings-address" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">Address</label>
              <input id="settings-address" {...register('address')} className={`${inputClass} ${errors.address ? 'border-red-300' : ''}`} />
              {errors.address && <p className="mt-1 text-xs text-red-600">{errors.address.message}</p>}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-4">
            <Globe className="h-5 w-5 text-amber-600" />
            <h2 className="font-semibold text-slate-900">Regional Preferences</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="settings-currency" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">Currency</label>
              <select id="settings-currency" {...register('currency')} className={inputClass}>
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="AED">AED (د.إ)</option>
              </select>
            </div>
            <div>
              <label htmlFor="settings-timezone" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">Timezone</label>
              <input id="settings-timezone" {...register('timezone')} className={`${inputClass} ${errors.timezone ? 'border-red-300' : ''}`} />
              {errors.timezone && <p className="mt-1 text-xs text-red-600">{errors.timezone.message}</p>}
            </div>
            <div>
              <label htmlFor="settings-date-format" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">Date Format</label>
              <select id="settings-date-format" {...register('settings.dateFormat')} className={inputClass}>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              </select>
            </div>
            <div>
              <label htmlFor="settings-week-start" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">Week Starts On</label>
              <select id="settings-week-start" {...register('settings.weekStartsOn', { valueAsNumber: true })} className={inputClass}>
                <option value={1}>Monday</option>
                <option value={0}>Sunday</option>
              </select>
            </div>
          </div>
          <label className="mt-5 flex items-start gap-3 rounded-lg bg-slate-50 p-4">
            <input type="checkbox" {...register('settings.lowStockAlerts')} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Low-stock alerts</span>
              <span className="mt-0.5 block text-xs text-slate-500">Include items at or below their configured reorder level in alert views.</span>
            </span>
          </label>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSubmitting ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};
