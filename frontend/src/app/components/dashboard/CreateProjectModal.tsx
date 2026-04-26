'use client';
import { useState, useRef, useEffect } from 'react';
import { X, GitBranch, HardDrive, FolderPlus, ArrowRight, Upload, Folder, FileCode, User, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { createRepo, triggerIndex, uploadRepo } from '../../../lib/api';
import { GlassBubble } from '../ui/glass-bubble';
import type { RepoSummary } from '../../../lib/types';

type DomainType = 'personal' | 'work';

interface CreateProjectModalProps {
  onClose: () => void;
  onCreate: (project: {
    name: string;
    description: string;
    type: 'github' | 'local';
    domain: DomainType;
    repoUrl?: string;
    files?: FileList;
  }) => void;
  onCreated?: (repo: RepoSummary) => void;
}

interface FolderStructure {
  [folderName: string]: File[];
}

export function CreateProjectModal({ onClose, onCreate, onCreated }: CreateProjectModalProps) {
  const [step, setStep] = useState<'type' | 'details'>('type');
  const [projectType, setProjectType] = useState<'github' | 'local' | null>(null);
  const [domain, setDomain] = useState<DomainType>('personal');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<FileList | null>(null);
  const [folderStructure, setFolderStructure] = useState<FolderStructure>({});
  const [validationError, setValidationError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleTypeSelect = (type: 'github' | 'local') => {
    setProjectType(type);
    setStep('details');
  };

  // Folder picker (webkitdirectory) cannot expose the absolute path the user
  // selected — browsers strip it for security. So we capture the FileList,
  // upload it as multipart on submit, and the backend materializes the tree
  // under the workspace jail. ``webkitRelativePath`` carries the per-file
  // path inside the picked folder, which the backend uses to reconstruct it.
  const handleFolderPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const first = files[0] as File & { webkitRelativePath?: string };
    const rel = first.webkitRelativePath || '';
    const folderName = rel.split('/')[0] || first.name;
    setUploadedFiles(files);
    if (!name && folderName) setName(folderName);
    // Clear the manually-typed path — the upload flow takes precedence.
    setLocalPath('');
    // Reset the input so picking the same folder again still triggers change.
    event.target.value = '';
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadedFiles(files);

    // Parse folder structure
    const structure: FolderStructure = {};
    const fileArray = Array.from(files);

    // Try to detect common folder name or use default
    let projectNameCandidate = 'My Project';

    // Check if files have paths (folder upload)
    const firstFile = fileArray[0];
    if (firstFile.webkitRelativePath) {
      const parts = firstFile.webkitRelativePath.split('/');
      if (parts.length > 1) {
        projectNameCandidate = parts[0];
      }
    } else {
      // Individual files - try to extract common prefix
      const fileNames = fileArray.map(f => f.name);
      if (fileNames.length === 1) {
        projectNameCandidate = fileNames[0].split('.')[0];
      } else {
        projectNameCandidate = 'Code Project';
      }
    }

    // Auto-set project name if empty
    if (!name) {
      setName(projectNameCandidate);
    }

    // Group files by extension/type for better organization
    fileArray.forEach(file => {
      const path = file.webkitRelativePath || file.name;
      const parts = path.split('/');

      let folderName = 'root';

      if (parts.length > 1) {
        // Get immediate parent folder
        folderName = parts[parts.length - 2];
      } else {
        // Group by file extension if no folder structure
        const ext = file.name.split('.').pop()?.toLowerCase() || 'other';
        folderName = `${ext} files`;
      }

      if (!structure[folderName]) {
        structure[folderName] = [];
      }
      structure[folderName].push(file);
    });

    setFolderStructure(structure);

    const folderCount = Object.keys(structure).length;
    setDescription(
      folderCount > 1
        ? `${fileArray.length} files across ${folderCount} folders`
        : `${fileArray.length} code files`
    );
  };

  const handleCreate = async () => {
    if (!projectType || !name) {
      const msg = !name ? 'Project name is required.' : 'Please select a project type.';
      setValidationError(msg);
      toast.error('Missing required fields', { description: msg });
      return;
    }

    if (projectType === 'github' && !repoUrl) {
      const msg = 'Repository URL is required.';
      setValidationError(msg);
      toast.error('Missing required fields', { description: msg });
      return;
    }
    if (projectType === 'local' && !uploadedFiles) {
      const msg = 'Choose a folder to upload.';
      setValidationError(msg);
      toast.error('Missing required fields', { description: msg });
      return;
    }

    setValidationError('');
    setSubmitting(true);
    try {
      let repo;
      if (projectType === 'local' && uploadedFiles) {
        // Upload everything in the folder, but skip the obvious dependency /
        // build / VCS directories that are never useful to the indexer and
        // would blow past the upload size cap on most projects.
        const skipDirs = new Set([
          '.git', 'node_modules', '__pycache__', '.next', '.venv', 'venv',
          'dist', 'build', 'target', '.cache', '.idea', '.vscode',
        ]);
        const filtered = Array.from(uploadedFiles).filter((f) => {
          const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || '';
          // Drop the leading picked-folder segment, then check each ancestor.
          const parts = rel.split('/').slice(1);
          return !parts.some((seg) => skipDirs.has(seg));
        });
        if (filtered.length === 0) {
          toast.error('Nothing to upload', {
            description: 'All files were skipped as dependency or build artifacts.',
          });
          setSubmitting(false);
          return;
        }
        toast.info(`Uploading ${filtered.length} file${filtered.length === 1 ? '' : 's'}…`);
        repo = await uploadRepo(name, filtered);
      } else {
        // GitHub URL path.
        const body = {
          name,
          git_url: repoUrl,
        };
        repo = await createRepo(body);
      }
      await triggerIndex(repo.hash);

      onCreate({
        name,
        description,
        type: projectType,
        domain,
        repoUrl: projectType === 'github' ? repoUrl : undefined,
        files: uploadedFiles || undefined,
      });
      onCreated?.(repo);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Couldn\u2019t create repository', { description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-panel rounded-3xl w-full max-w-3xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden anim-fade-up aurora-bg">
        {/* Header */}
        <div className="flex items-center justify-between px-10 py-8 border-b border-gray-800">
          <h2 className="text-2xl font-bold text-white">Create New Project</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#252526] rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-10 py-8">
          {step === 'type' ? (
            <div>
              <p className="text-base text-gray-400 mb-6">Choose how you want to connect your codebase</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl mx-auto items-stretch">
                {/* GitHub Option */}
                <button
                  onClick={() => handleTypeSelect('github')}
                  className="glass-card px-10 py-12 rounded-2xl text-center group flex flex-col items-center gap-4 hover:border-[#2DD4BF]/40"
                >
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 bg-[#2d2d2d] rounded-xl flex items-center justify-center mb-6 group-hover:bg-[#252526] group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                      <GitBranch className="h-7 w-7 text-gray-400 group-hover:text-[#5EEAD4]" />
                    </div>
                    <h3 className="text-2xl font-semibold text-white mb-4 text-center">Version Control</h3>
                    <p className="text-base text-gray-400 text-center max-w-xs">
                      Connect your GitHub repository for automatic syncing and version tracking
                    </p>
                  </div>
                  <GlassBubble tone="blue">
                    <span>Get Started</span>
                    <ArrowRight className="h-4 w-4" />
                  </GlassBubble>
                </button>

                {/* Local Option */}
                <button
                  onClick={() => handleTypeSelect('local')}
                  className="glass-card px-10 py-12 rounded-2xl text-center group flex flex-col items-center gap-4 hover:border-purple-400/40"
                >
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 bg-[#2d2d2d] rounded-xl flex items-center justify-center mb-6 group-hover:bg-[#252526] group-hover:scale-110 group-hover:-rotate-3 transition-all duration-300">
                      <HardDrive className="h-7 w-7 text-gray-400 group-hover:text-purple-400" />
                    </div>
                    <h3 className="text-2xl font-semibold text-white mb-4 text-center">Local Files</h3>
                    <p className="text-base text-gray-400 text-center max-w-xs">
                      Upload code files directly from your computer for quick analysis
                    </p>
                  </div>
                  <GlassBubble tone="purple">
                    <span>Get Started</span>
                    <ArrowRight className="h-4 w-4" />
                  </GlassBubble>
                </button>
              </div>

              <div className="mt-8 p-4 bg-blue-500/10 border border-[#2DD4BF]/20 rounded-lg">
                <div className="flex gap-5">
                  <div className="w-1 h-auto bg-blue-500 rounded-full flex-shrink-0" />
                  <div>
                    <h4 className="text-base font-semibold text-[#5EEAD4] mb-1">Recommended: Version Control</h4>
                    <p className="text-base text-gray-400">
                      GitHub integration enables automatic updates, collaboration features, and full version history tracking.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-5 p-4 bg-[#1e1e1e] rounded-lg border border-gray-700">
                {projectType === 'github' ? (
                  <>
                    <GitBranch className="h-5 w-5 text-[#5EEAD4]" />
                    <span className="text-white font-medium">GitHub Repository</span>
                  </>
                ) : (
                  <>
                    <HardDrive className="h-5 w-5 text-purple-400" />
                    <span className="text-white font-medium">Local Files</span>
                  </>
                )}
                <button
                  onClick={() => setStep('type')}
                  className="ml-auto text-base text-[#5EEAD4] hover:text-[#5EEAD4]"
                >
                  Change
                </button>
              </div>

              <div>
                <label className="block text-base font-medium text-gray-300 mb-5">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., E-Commerce Platform"
                  className="w-full px-5 py-3 bg-[#1e1e1e] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2DD4BF] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-base font-medium text-gray-300 mb-5">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of your project..."
                  rows={3}
                  className="w-full px-5 py-3 bg-[#1e1e1e] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2DD4BF] focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-base font-medium text-gray-300 mb-5">
                  Domain *
                </label>
                <div className="flex gap-5">
                  <button
                    type="button"
                    onClick={() => setDomain('personal')}
                    className="flex-1 p-4 rounded-lg border transition-all"
                    style={
                      domain === 'personal'
                        ? {
                            borderColor: 'rgba(249,115,22,0.55)',
                            background:
                              'linear-gradient(135deg, rgba(249,115,22,0.18), rgba(249,115,22,0.06))',
                            boxShadow:
                              '0 0 18px rgba(249,115,22,0.45), 0 0 36px rgba(249,115,22,0.25), inset 0 1px 0 rgba(255,255,255,0.12)',
                          }
                        : {
                            borderColor: '#374151',
                            background: '#1e1e1e',
                          }
                    }
                  >
                    <div className="flex items-center justify-center gap-5 mb-5">
                      <User className={`h-5 w-5 ${domain === 'personal' ? 'text-[#FB923C]' : 'text-gray-400'}`} />
                    </div>
                    <div className={`text-base font-medium ${domain === 'personal' ? 'text-white' : 'text-gray-400'}`}>
                      Personal
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Side projects & personal work
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDomain('work')}
                    className="flex-1 p-4 rounded-lg border transition-all"
                    style={
                      domain === 'work'
                        ? {
                            borderColor: 'rgba(249,115,22,0.55)',
                            background:
                              'linear-gradient(135deg, rgba(249,115,22,0.18), rgba(249,115,22,0.06))',
                            boxShadow:
                              '0 0 18px rgba(249,115,22,0.45), 0 0 36px rgba(249,115,22,0.25), inset 0 1px 0 rgba(255,255,255,0.12)',
                          }
                        : {
                            borderColor: '#374151',
                            background: '#1e1e1e',
                          }
                    }
                  >
                    <div className="flex items-center justify-center gap-5 mb-5">
                      <Briefcase className={`h-5 w-5 ${domain === 'work' ? 'text-[#FB923C]' : 'text-gray-400'}`} />
                    </div>
                    <div className={`text-base font-medium ${domain === 'work' ? 'text-white' : 'text-gray-400'}`}>
                      Work
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Professional & team projects
                    </div>
                  </button>
                </div>
              </div>

              {projectType === 'github' && (
                <div>
                  <label className="block text-base font-medium text-gray-300 mb-5">
                    Repository URL *
                  </label>
                  <input
                    type="url"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/username/repository"
                    className="w-full px-5 py-3 bg-[#1e1e1e] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2DD4BF] focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-5">
                    We'll need access to clone and analyze your repository
                  </p>
                </div>
              )}

              {projectType === 'local' && (
                <div className="space-y-5">
                  {/* Hidden pickers — triggered by the buttons below. */}
                  <input
                    ref={folderInputRef}
                    type="file"
                    onChange={handleFolderPick}
                    className="hidden"
                    {...({ webkitdirectory: '', directory: '', mozdirectory: '' } as Record<string, string>)}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  {uploadedFiles && uploadedFiles.length > 0 ? (
                    <div className="flex items-center justify-between p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Folder className="h-5 w-5 text-green-400" />
                        <div>
                          <div className="text-white font-medium">{uploadedFiles.length} file{uploadedFiles.length === 1 ? '' : 's'} queued</div>
                          <div className="text-xs text-gray-400">Click "Create Project" to upload and index.</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => folderInputRef.current?.click()}
                          className="text-sm text-[#5EEAD4] hover:text-white"
                        >
                          Folder
                        </button>
                        <span className="text-gray-600">·</span>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-sm text-[#5EEAD4] hover:text-white"
                        >
                          Files
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => folderInputRef.current?.click()}
                        className="p-6 border-2 border-dashed border-gray-700 hover:border-purple-500 rounded-lg transition-all text-center group"
                      >
                        <Folder className="h-10 w-10 text-gray-600 group-hover:text-purple-400 mx-auto mb-3 transition-colors" />
                        <h4 className="text-white font-medium text-base mb-1">Choose Folder</h4>
                        <p className="text-xs text-gray-400">
                          Upload an entire project directory.
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-6 border-2 border-dashed border-gray-700 hover:border-purple-500 rounded-lg transition-all text-center group"
                      >
                        <FileCode className="h-10 w-10 text-gray-600 group-hover:text-purple-400 mx-auto mb-3 transition-colors" />
                        <h4 className="text-white font-medium text-base mb-1">Choose Files</h4>
                        <p className="text-xs text-gray-400">
                          Pick individual files to upload.
                        </p>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'details' && (
          <div className="flex items-center justify-between px-10 py-6 border-t border-gray-800">
            <button
              onClick={() => setStep('type')}
              className="px-5 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Back
            </button>
            <div className="flex items-center gap-3">
              {validationError && (
                <span className="text-sm text-red-400">{validationError}</span>
              )}
              <button
                onClick={handleCreate}
                disabled={submitting}
                className="px-5 py-2.5 bg-gradient-to-r from-[#34D399] to-[#F59E0B] hover:from-[#2DD4BF] hover:to-[#FBBF24] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all flex items-center gap-5"
              >
                <FolderPlus className="h-4 w-4" />
                Create Project
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
