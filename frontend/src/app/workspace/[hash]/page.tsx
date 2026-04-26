'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { CartographerWorkspace } from '../../components/cartographer/CartographerWorkspace';
import { ShareModal } from '../../components/workspace/ShareModal';
import { isAuthenticated } from '../../../lib/api';
import { useCartographerStore } from '../../../lib/store';

export default function WorkspaceRoute() {
  const router = useRouter();
  const params = useParams<{ hash: string }>();
  const hash = params?.hash ?? '';

  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const projectName = useCartographerStore((s) =>
    s.repos.find((r) => r.hash === hash)?.name ?? 'Repository',
  );
  const setActiveRepoHash = useCartographerStore((s) => s.setActiveRepoHash);

  // Mirror the URL's hash into the store as the active repo. Without this,
  // arriving via refresh / deep-link / direct navigation leaves
  // ``activeRepoHash`` null, and components that gate on it (Agents panel
  // Run button, ChatAgent dispatch) think no project is open.
  useEffect(() => {
    if (hash) setActiveRepoHash(hash);
  }, [hash, setActiveRepoHash]);

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

  if (!authChecked || !hash) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <>
      <CartographerWorkspace
        projectId={hash}
        projectName={projectName}
        onBack={() => router.back()}
        onShare={() => setShowShareModal(true)}
      />

      {showShareModal && (
        <ShareModal
          projectName={projectName}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </>
  );
}
