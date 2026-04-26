'use client';
import { useRouter } from 'next/navigation';
import { LoginPage } from '../components/auth/LoginPage';
import { useCartographerStore } from '../../lib/store';

export default function LoginRoute() {
  const router = useRouter();

  const handleLogin = () => {
    const existing = useCartographerStore.getState().user;
    useCartographerStore.getState().setUser({
      email: existing?.email ?? '',
      authenticated: true,
    });
    router.push('/dashboard');
  };

  return <LoginPage onLogin={handleLogin} />;
}
