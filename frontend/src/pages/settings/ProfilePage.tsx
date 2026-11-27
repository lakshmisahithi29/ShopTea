import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, CalendarDays, KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { updateUserProfile } from '../../api/auth';
import { Button, Card, ErrorState, PageHeader, StatusBadge } from '../../components/common/UI';
import { useAuth } from '../../context/AuthContext';

const inputClass = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100';

export const ProfilePage: React.FC = () => {
  const { user, shop, setUser } = useAuth();
  const [name, setName] = React.useState(user?.name || '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');

  React.useEffect(() => { setName(user?.name || ''); }, [user?.name]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!name.trim()) {
      setError('Enter a display name.');
      return;
    }
    setSaving(true);
    try {
      const result = await updateUserProfile(name.trim());
      if (result.user) setUser(result.user);
      setSuccess(result.message || 'Profile updated successfully.');
    } catch (err: any) {
      setError(err.message || 'Your profile could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;
  const initials = (user.name || user.username).split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <PageHeader title="User profile" description="Manage your display name and review the account connected to this shop." />

      {error ? <ErrorState message={error} /> : null}
      {success ? <div role="status" className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{success}</div> : null}

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-16 w-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center text-xl font-bold">{initials}</div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{user.name || user.username}</h2>
              <p className="text-sm text-slate-500">@{user.username}</p>
              <div className="mt-2"><StatusBadge tone="info">{user.role}</StatusBadge></div>
            </div>
          </div>

          <form onSubmit={submit}>
            <label htmlFor="profile-name" className="block text-sm font-semibold text-slate-700 mb-1">Display name</label>
            <input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required className={inputClass} />
            <p className="text-xs text-slate-500 mt-1 mb-5">This name appears in profile and audit details where available.</p>
            <Button type="submit" loading={saving} disabled={name.trim() === (user.name || '')}>Save profile</Button>
          </form>

          <div className="border-t border-slate-200 mt-6 pt-5 grid sm:grid-cols-2 gap-4 text-sm">
            <ProfileFact icon={UserRound} label="Username" value={user.username} />
            <ProfileFact icon={Mail} label="Email" value={user.email} />
            <ProfileFact icon={ShieldCheck} label="Role" value={user.role} />
            <ProfileFact icon={CalendarDays} label="Account created" value={user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} />
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-2 mb-3"><Building2 className="h-5 w-5 text-amber-700" /><h2 className="font-semibold text-slate-900">Connected shop</h2></div>
            {shop ? (
              <>
                <p className="font-semibold text-slate-900">{shop.name}</p>
                <p className="text-sm text-slate-500 mt-1">{shop.type.replace(/_/g, ' ')} · {shop.currency}</p>
                <p className="text-sm text-slate-500 mt-1">{shop.timezone}</p>
                <Link to="/settings" className="inline-block mt-4 text-sm font-semibold text-amber-700">Open shop settings</Link>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-500">No shop is connected yet.</p>
                <Link to="/setup-shop" className="inline-block mt-4 text-sm font-semibold text-amber-700">Complete shop setup</Link>
              </>
            )}
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3"><KeyRound className="h-5 w-5 text-slate-600" /><h2 className="font-semibold text-slate-900">Account security</h2></div>
            <p className="text-sm text-slate-600">Your password is stored as a secure hash and is never returned by the API. Email and username changes are not available from this screen.</p>
            <p className="text-xs text-slate-500 mt-3">Sessions use an HTTP-only authentication cookie.</p>
          </Card>
        </div>
      </div>
    </div>
  );
};

function ProfileFact({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
      <div><p className="text-xs text-slate-500">{label}</p><p className="font-medium text-slate-800 mt-0.5 break-all">{value}</p></div>
    </div>
  );
}
