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
