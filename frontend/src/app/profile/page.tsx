'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProfilePage } from '../components/profile/ProfilePage';
import { isAuthenticated } from '../../lib/api';
import { useCartographerStore } from '../../lib/store';

export default function ProfileRoute() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isAuthenticated().then((ok) => {
      if (cancelled) return;
      if (!ok) {
        router.replace('/login');
        return;
      }
      setAuthChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!authChecked) {
    return null;
  }

  const user = {
    name: 'Alex Rivera',
    email: 'alex@company.com',
  };

  const handleLogout = () => {
    useCartographerStore.getState().setUser(null);
  };

  return <ProfilePage user={user} onLogout={handleLogout} />;
}
