'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProjectsDashboard } from '../components/dashboard/ProjectsDashboard';
import { isAuthenticated } from '../../lib/api';
import { useCartographerStore } from '../../lib/store';

export default function DashboardRoute() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const storeUser = useCartographerStore((s) => s.user);

  useEffect(() => {
    let cancelled = false;
    isAuthenticated()
      .then((ok) => {
        if (cancelled) return;
        if (!ok) {
          router.replace('/login');
          return;
        }
        setAuthChecked(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setAuthError(err instanceof Error ? err.message : 'Authentication check failed');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (authError) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-red-400 text-center">
          <p className="text-lg font-semibold">Authentication Error</p>
          <p className="text-sm mt-1">{authError}</p>
        </div>
      </div>
    );
  }

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  const user = {
    name: '',
    email: storeUser?.email ?? '',
  };

  const handleOpenProject = (projectId: string) => {
    useCartographerStore.getState().setActiveRepoHash(projectId);
  };

  return (
    <ProjectsDashboard
      onOpenProject={handleOpenProject}
      user={user}
    />
  );
}
