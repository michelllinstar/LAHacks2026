'use client';
import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from './components/landing/LandingPage';
import { LoginPage } from './components/auth/LoginPage';
import { ProjectsDashboard } from './components/dashboard/ProjectsDashboard';
import { CreateProjectModal } from './components/dashboard/CreateProjectModal';
import { CartographerWorkspace } from './components/cartographer/CartographerWorkspace';
import { ShareModal } from './components/workspace/ShareModal';
import { ProfilePage } from './components/profile/ProfilePage';
import { Toaster, toast } from 'sonner';
import { useCartographerStore } from '../lib/store';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [currentProject, setCurrentProject] = useState<{
    id: string;
    name: string;
    type: 'github' | 'local';
  } | null>(null);

  // Mock user data
  const user = {
    name: 'Alex Rivera',
    email: 'alex@company.com',
  };

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentProject(null);
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
    const repo = useCartographerStore.getState().repos.find((r) => r.hash === projectId);
    setCurrentProject({
      id: projectId,
      name: repo?.name ?? 'Repository',
      type: repo?.git_url ? 'github' : 'local',
    });
  };

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Toaster position="top-right" theme="dark" />

        <Routes>
          {/* Landing Page */}
          <Route path="/" element={<LandingPage />} />

        {/* Login */}
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LoginPage onLogin={handleLogin} />
            )
          }
        />

        {/* Dashboard */}
        <Route
          path="/dashboard"
          element={
            isAuthenticated ? (
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
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Cartographer Workspace */}
        <Route
          path="/workspace/:projectId"
          element={
            isAuthenticated && currentProject ? (
              <>
                <CartographerWorkspace
                  projectId={currentProject.id}
                  projectName={currentProject.name}
                  onBack={() => window.history.back()}
                  onShare={() => setShowShareModal(true)}
                />

                {showShareModal && (
                  <ShareModal
                    projectName={currentProject.name}
                    onClose={() => setShowShareModal(false)}
                  />
                )}
              </>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Profile Page */}
        <Route
          path="/profile"
          element={
            isAuthenticated ? (
              <ProfilePage user={user} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Catch all - redirect to landing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </div>
    </BrowserRouter>
  );
}