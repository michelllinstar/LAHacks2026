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
  const [showShareModal, setShowShareModal] = useState(false);

  const projectName = useCartographerStore((s) =>
    s.repos.find((r) => r.hash === hash)?.name ?? 'Repository',
  );

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

  if (!authChecked || !hash) {
    return null;
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
