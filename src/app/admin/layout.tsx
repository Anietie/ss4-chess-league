'use client';

import { supabase } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  LayoutDashboard, Shuffle, CalendarDays, PlayCircle, 
  Users, Shield, Loader2, CalendarCheck2
} from 'lucide-react';


const NAV_ITEMS = [
  { href: '/admin', label: 'Overview', icon: <LayoutDashboard size={16} /> },
  { href: '/admin/registration', label: 'Registration', icon: <CalendarCheck2 size={16} /> },
  { href: '/admin/draft', label: 'Draft', icon: <Shuffle size={16} /> },
  { href: '/admin/fixtures', label: 'Fixtures & SCEL', icon: <CalendarDays size={16} /> },
  { href: '/admin/season', label: 'Season Controls', icon: <PlayCircle size={16} /> },
  { href: '/admin/players', label: 'Players', icon: <Users size={16} /> },
  { href: '/admin/anti-cheat', label: 'Anti-Cheat', icon: <Shield size={16} /> },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth/login?next=/admin');
      return;
    }

    const { data: player } = await supabase
      .from('players')
      .select('id, full_name, is_admin')
      .eq('auth_user_id', user.id)
      .single();

    if (!player?.is_admin) {
      router.push('/dashboard');
      return;
    }

    setAuthorized(true);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-orange-500" size={32} />
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-7xl mx-auto flex gap-6 px-4 py-6">
        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 hidden md:block">
          <nav className="space-y-0.5 sticky top-20">
            {NAV_ITEMS.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  pathname === item.href
                    ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                    : 'text-ink-300 hover:text-chalk hover:bg-ink-800'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Mobile nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-ink-900 border-t border-ink-700 z-50">
          <div className="flex overflow-x-auto no-scrollbar">
            {NAV_ITEMS.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-4 py-2.5 text-xs whitespace-nowrap transition-colors ${
                  pathname === item.href ? 'text-orange-400' : 'text-ink-400'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 min-w-0 pb-20 md:pb-0">
          {children}
        </main>
      </div>
    </div>
  );
}