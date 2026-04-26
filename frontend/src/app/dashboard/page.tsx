'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ProjectsDashboard } from '../components/dashboard/ProjectsDashboard';
import { CreateProjectModal } from '../components/dashboard/CreateProjectModal';
import { isAuthenticated } from '../../lib/api';
import { useCartographerStore } from '../../lib/store';

export default function DashboardRoute() {
  const router = useRouter();
  const [showCreateModal, setShowCreateModal] = useState(false);
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

  const handleCreateProject = (project: {
    name: string;
    description: string;
    type: 'github' | 'local';
    domain: 'personal' | 'work';
    repoUrl?: string;
    files?: FileList;
  }) => {
    toast.success(`${project.domain === 'work' ? 'Work' : 'Personal'} project created!`, {
      description: `${project.name} indexing started`,
    });
  };

  const handleOpenProject = (projectId: string) => {
    useCartographerStore.getState().setActiveRepoHash(projectId);
  };

  return (
    <>
      <ProjectsDashboard
        onCreateProject={() => setShowCreateModal(true)}
        onOpenProject={handleOpenProject}
        user={user}
      />

      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateProject}
          onCreated={(repo) => {
            const store = useCartographerStore.getState();
            store.setRepos([...store.repos, repo]);
            setShowCreateModal(false);
          }}
        />
      )}
    </>
  );
}
