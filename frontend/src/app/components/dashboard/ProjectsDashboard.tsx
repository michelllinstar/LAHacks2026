'use client';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
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
    navigate(`/workspace/${hash}`);
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
        <div className="max-w-7xl mx-auto px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-5">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
                  <Folder className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">Repositories</h1>
                  <p className="text-base text-gray-400">Cartographer Indexes</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <button className="px-5 py-2 text-gray-300 hover:text-white transition-colors">
                Help
              </button>
              <div className="w-px h-6 bg-gray-700" />
              <button
                onClick={() => navigate('/profile')}
                className="flex items-center gap-5 hover:bg-[#3a3a3a] rounded-lg px-3 py-2 transition-colors"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center">
                  <span className="text-white text-base font-semibold">
                    {user.name.charAt(0)}
                  </span>
                </div>
                <div className="hidden md:block">
                  <div className="text-base font-medium text-white">{user.name}</div>
                  <div className="text-xs text-gray-400">{user.email}</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-5 py-8">
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
            <div className="flex items-center gap-1 bg-[#2d2d2d] rounded-lg p-1 border border-gray-700">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded transition-colors ${viewMode === 'grid' ? 'bg-[#3a3a3a] text-white' : 'text-gray-400 hover:text-white'}`}
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded transition-colors ${viewMode === 'list' ? 'bg-[#3a3a3a] text-white' : 'text-gray-400 hover:text-white'}`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={onCreateProject}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium rounded-lg transition-all flex items-center gap-5"
            >
              <Plus className="h-4 w-4" />
              New Project
            </button>
          </div>
        </div>

        {/* Domain Toggle */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-1 p-1 bg-[#252526] rounded-lg border border-[#3e3e42]">
            <button
              onClick={() => setActiveDomain('personal')}
              className={`px-5 py-2 rounded-md text-base font-medium transition-all flex items-center gap-5 ${
                activeDomain === 'personal'
                  ? 'bg-[#007acc] text-white shadow-sm'
                  : 'text-gray-400 hover:text-white hover:bg-[#2a2d2e]'
              }`}
            >
              <User className="h-4 w-4" />
              Personal
            </button>
            <button
              onClick={() => setActiveDomain('work')}
              className={`px-5 py-2 rounded-md text-base font-medium transition-all flex items-center gap-5 ${
                activeDomain === 'work'
                  ? 'bg-[#007acc] text-white shadow-sm'
                  : 'text-gray-400 hover:text-white hover:bg-[#2a2d2e]'
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => handleProjectClick(project.id)}
                className="bg-[#2d2d2d] rounded-xl border border-gray-800 hover:border-gray-700 transition-all cursor-pointer group overflow-hidden"
              >
                {/* Thumbnail */}
                <div className="h-40 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity" style={{
                    backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.05) 20px)',
                  }} />
                  <Folder className="h-16 w-16 text-gray-600 group-hover:text-gray-500 transition-colors" />
                </div>

                {/* Content */}
                <div className="p-5">
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-5 mb-1">
                        <h3 className="font-semibold text-white truncate">{project.name}</h3>
                        {project.starred && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />}
                      </div>
                      <p className="text-base text-gray-400 line-clamp-2">{project.description}</p>
                    </div>
                    <button className="p-1 hover:bg-[#3a3a3a] rounded transition-colors ml-2">
                      <MoreVertical className="h-4 w-4 text-gray-400" />
                    </button>
                  </div>

                  <div className="flex items-center gap-5 text-xs text-gray-500 mb-5">
                    <div className="flex items-center gap-1">
                      {project.type === 'github' ? (
                        <GitBranch className="h-3.5 w-3.5" />
                      ) : (
                        <HardDrive className="h-3.5 w-3.5" />
                      )}
                      <span>{project.type === 'github' ? 'GitHub' : 'Local'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{project.lastModified.toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                    <div className="text-xs text-gray-400">
                      {project.diagramCount} symbol{project.diagramCount !== 1 ? 's' : ''} indexed
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
          <div className="text-center py-16">
            <Folder className="h-16 w-16 text-gray-600 mx-auto mb-5" />
            <h3 className="text-2xl font-semibold text-white mb-5">No projects found</h3>
            <p className="text-gray-400 mb-6">
              {searchQuery ? 'Try a different search term' : 'Create your first project to get started'}
            </p>
            {!searchQuery && (
              <button
                onClick={onCreateProject}
                className="px-5 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium rounded-lg transition-all inline-flex items-center gap-5"
              >
                <Plus className="h-5 w-5" />
                Create Project
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
