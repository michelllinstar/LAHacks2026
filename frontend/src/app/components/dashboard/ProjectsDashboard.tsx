'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Grid, List, Clock, Users, Star, MoreVertical, Folder, GitBranch, HardDrive, Briefcase, User } from 'lucide-react';
import { toast } from 'sonner';
import { listRepos } from '../../../lib/api';
import { useCartographerStore } from '../../../lib/store';
import type { RepoSummary } from '../../../lib/types';

type DomainType = 'personal' | 'work';

interface Project {
  id: string;
  name: string;
  description: string;
  type: 'github' | 'local';
  domain: DomainType;
  lastModified: Date;
  diagramCount: number;
  collaborators: number;
  thumbnail?: string;
  starred: boolean;
}

interface ProjectsDashboardProps {
  onCreateProject: () => void;
  onOpenProject: (projectId: string) => void;
  user: {
    name: string;
    email: string;
    avatar?: string;
  };
}

function repoToProject(repo: RepoSummary): Project {
  const description = repo.local_path || repo.git_url || '';
  return {
    id: repo.hash,
    name: repo.name,
    description,
    type: repo.git_url ? 'github' : 'local',
    domain: 'personal',
    lastModified: new Date(),
    diagramCount: 0,
    collaborators: 1,
    starred: false,
  };
}

export function ProjectsDashboard({ onCreateProject, onOpenProject, user }: ProjectsDashboardProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDomain, setActiveDomain] = useState<DomainType>('personal');
  const [loading, setLoading] = useState(true);

  const repos = useCartographerStore((s) => s.repos);
  const setRepos = useCartographerStore((s) => s.setRepos);
  const setActiveRepoHash = useCartographerStore((s) => s.setActiveRepoHash);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listRepos()
      .then((data) => {
        if (!cancelled) setRepos(data);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        toast.error(`Failed to load repositories: ${msg}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setRepos]);

  const handleProjectClick = (hash: string) => {
    setActiveRepoHash(hash);
    onOpenProject(hash);
    router.push(`/workspace/${hash}`);
  };

  const projects: Project[] = repos.map(repoToProject);

  // Mock projects data - kept as a no-op fallback (unused; backed by real repos above)
  const _mockProjects: Project[] = ([
    {
      id: '1',
      name: 'E-Commerce Platform',
      description: '50K lines • Indexed with 4 layers • TypeScript',
      type: 'github',
      domain: 'work',
      lastModified: new Date('2026-04-24'),
      diagramCount: 142,
      collaborators: 5,
      starred: true,
    },
    {
      id: '2',
      name: 'Mobile App Backend',
      description: '32K lines • Python REST API • Fully indexed',
      type: 'github',
      domain: 'work',
      lastModified: new Date('2026-04-23'),
      diagramCount: 89,
      collaborators: 3,
      starred: false,
    },
    {
      id: '3',
      name: 'Analytics Dashboard',
      description: '18K lines • React + TypeScript • Local index',
      type: 'local',
      domain: 'work',
      lastModified: new Date('2026-04-20'),
      diagramCount: 56,
      collaborators: 1,
      starred: true,
    },
    {
      id: '4',
      name: 'Personal Portfolio',
      description: '8K lines • Next.js • Recently indexed',
      type: 'local',
      domain: 'personal',
      lastModified: new Date('2026-04-22'),
      diagramCount: 34,
      collaborators: 1,
      starred: true,
    },
    {
      id: '5',
      name: 'Side Project App',
      description: '12K lines • Python backend • Index in progress',
      type: 'github',
      domain: 'personal',
      lastModified: new Date('2026-04-21'),
      diagramCount: 45,
      collaborators: 1,
      starred: false,
    },
  ] as Project[]);
  void _mockProjects;

  const filteredProjects = projects.filter(p =>
    (p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(searchQuery.toLowerCase())) &&
    p.domain === activeDomain
  );

  return (
    <div className="min-h-screen bg-[#1e1e1e]">
      {/* Top Navigation */}
      <nav className="bg-[#2d2d2d] border-b border-gray-800">
        <div className="px-[100px] py-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-md">
                  <Folder className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white leading-tight">Repositories</h1>
                  <p className="text-sm text-gray-400 leading-tight">Cartographer Indexes</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/profile')}
                className="flex items-center gap-3 hover:bg-[#3a3a3a] rounded-md px-3 py-1.5 transition-colors"
              >
                <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center">
                  <span className="text-white text-base font-semibold">
                    {user.name.charAt(0)}
                  </span>
                </div>
                <div className="hidden md:block leading-tight text-left">
                  <div className="text-base font-medium text-white">{user.name}</div>
                  <div className="text-xs text-gray-400">{user.email}</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="px-[100px] pt-10 pb-3">
        {/* Header Actions */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="w-full pl-11 pr-4 py-2.5 bg-[#2d2d2d] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div
              className="relative flex items-center p-1 rounded-lg border border-white/10"
              style={{
                background: 'rgba(255,255,255,0.04)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
              }}
            >
              <span
                aria-hidden
                className="absolute top-1 bottom-1 w-9 rounded-md border border-white/15 transition-transform duration-300 ease-out"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04))',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                  transform: viewMode === 'grid' ? 'translateX(0)' : 'translateX(100%)',
                  left: 4,
                }}
              />
              <button
                onClick={() => setViewMode('grid')}
                className={`relative z-10 w-9 h-9 flex items-center justify-center rounded transition-colors ${
                  viewMode === 'grid' ? 'text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`relative z-10 w-9 h-9 flex items-center justify-center rounded transition-colors ${
                  viewMode === 'list' ? 'text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={onCreateProject}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
                e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
              }}
              className="relative overflow-hidden px-5 py-2.5 rounded-lg text-white font-medium transition-all flex items-center gap-2 border border-white/20 group"
              style={{
                background:
                  'linear-gradient(135deg, rgba(99,102,241,0.35) 0%, rgba(168,85,247,0.25) 100%)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                boxShadow: '0 4px 20px rgba(99,102,241,0.25), inset 0 1px 0 rgba(255,255,255,0.18)',
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{
                  background:
                    'radial-gradient(220px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.18), transparent 60%)',
                }}
              />
              <Plus className="h-4 w-4 relative" />
              <span className="relative p-[5px]">New Project</span>
            </button>
          </div>
        </div>

        {/* Domain Toggle */}
        <div className="mb-6">
          <div
            className="relative inline-flex items-center gap-3 p-1.5 rounded-lg border border-white/10"
            style={{
              background: 'rgba(255,255,255,0.04)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            <span
              aria-hidden
              className="absolute top-1.5 bottom-1.5 rounded-md border border-white/15 transition-transform duration-300 ease-out"
              style={{
                width: 122,
                left: 10,
                background: 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.05))',
                boxShadow: '0 2px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.18)',
                transform: activeDomain === 'personal' ? 'translateX(0)' : 'translateX(142px)',
              }}
            />
            <button
              onClick={() => setActiveDomain('personal')}
              style={{ width: 130 }}
              className={`relative z-10 py-2.5 rounded-md text-base font-medium transition-colors flex items-center justify-center gap-2 ${
                activeDomain === 'personal' ? 'text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <User className="h-4 w-4" />
              Personal
            </button>
            <button
              onClick={() => setActiveDomain('work')}
              style={{ width: 130 }}
              className={`relative z-10 py-2.5 rounded-md text-base font-medium transition-colors flex items-center justify-center gap-2 ${
                activeDomain === 'work' ? 'text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Briefcase className="h-4 w-4" />
              Work
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'} in {activeDomain}
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="text-center py-8 text-gray-400">Loading repositories...</div>
        )}

        {/* Projects Grid/List */}
        {!loading && (viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => handleProjectClick(project.id)}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
                  e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
                }}
                className="glass-card relative rounded-xl cursor-pointer group overflow-hidden border border-white/10 hover:border-white/20 transition-all"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                  backdropFilter: 'blur(14px)',
                  WebkitBackdropFilter: 'blur(14px)',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
                }}
              >
                {/* Mouse-following spotlight */}
                <div
                  className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  style={{
                    background:
                      'radial-gradient(360px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.10), transparent 60%)',
                  }}
                />

                {/* Soft accent glow */}
                <div
                  className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-40 group-hover:opacity-60 transition-opacity"
                  style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 70%)' }}
                />

                <div className="relative p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="p-2 rounded-lg flex-shrink-0 border border-white/10"
                        style={{ background: 'rgba(255,255,255,0.05)' }}
                      >
                        {project.type === 'github' ? (
                          <GitBranch className="h-5 w-5 text-blue-300" />
                        ) : (
                          <HardDrive className="h-5 w-5 text-purple-300" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-white truncate">{project.name}</h3>
                          {project.starred && <Star className="h-4 w-4 text-yellow-400 fill-yellow-400 flex-shrink-0" />}
                        </div>
                        <p className="text-xs text-gray-400 truncate">{project.description}</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 hover:bg-white/5 rounded transition-colors ml-2"
                    >
                      <MoreVertical className="h-4 w-4 text-gray-400" />
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-gray-400 mb-4">
                    <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                      {project.type === 'github' ? 'GitHub' : 'Local'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {project.lastModified.toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-white/10">
                    <div className="text-xs text-gray-300">
                      <span className="text-white font-semibold">{project.diagramCount}</span>{' '}
                      symbol{project.diagramCount !== 1 ? 's' : ''} indexed
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Users className="h-3.5 w-3.5" />
                      <span>{project.collaborators}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => handleProjectClick(project.id)}
                className="bg-[#2d2d2d] rounded-lg border border-gray-800 hover:border-gray-700 transition-all cursor-pointer p-4"
              >
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Folder className="h-6 w-6 text-gray-600" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-5 mb-1">
                      <h3 className="font-semibold text-white truncate">{project.name}</h3>
                      {project.starred && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />}
                    </div>
                    <p className="text-base text-gray-400 truncate">{project.description}</p>
                  </div>

                  <div className="flex items-center gap-6 text-base text-gray-400">
                    <div className="flex items-center gap-5">
                      {project.type === 'github' ? (
                        <GitBranch className="h-4 w-4" />
                      ) : (
                        <HardDrive className="h-4 w-4" />
                      )}
                      <span>{project.type === 'github' ? 'GitHub' : 'Local'}</span>
                    </div>
                    <div>{project.diagramCount} symbols</div>
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      <span>{project.collaborators}</span>
                    </div>
                    <div className="text-xs">{project.lastModified.toLocaleDateString()}</div>
                  </div>

                  <button className="p-2 hover:bg-[#3a3a3a] rounded transition-colors">
                    <MoreVertical className="h-4 w-4 text-gray-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Empty State */}
        {!loading && filteredProjects.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-16 min-h-[50vh]">
            <Folder className="h-16 w-16 text-gray-600 mb-5" />
            <h3 className="text-2xl font-semibold text-white mb-5">No projects found</h3>
            <p className="text-gray-400 mb-6">
              {searchQuery ? 'Try a different search term' : 'Create your first project to get started'}
            </p>
            {!searchQuery && (
              <button
                onClick={onCreateProject}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
                  e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
                }}
                className="relative overflow-hidden px-6 py-3 rounded-lg text-white font-medium transition-all inline-flex items-center gap-2.5 border border-white/20 group"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(99,102,241,0.35) 0%, rgba(168,85,247,0.25) 100%)',
                  backdropFilter: 'blur(14px)',
                  WebkitBackdropFilter: 'blur(14px)',
                  boxShadow: '0 4px 20px rgba(99,102,241,0.25), inset 0 1px 0 rgba(255,255,255,0.18)',
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  style={{
                    background:
                      'radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.20), transparent 60%)',
                  }}
                />
                <Plus className="h-5 w-5 relative" />
                <span className="relative p-[5px]">Create Project</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
