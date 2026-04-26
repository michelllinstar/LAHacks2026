'use client';
import { useState, useRef, useEffect } from 'react';
import { X, GitBranch, HardDrive, FolderPlus, ArrowRight, Upload, Folder, FileCode, User, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { createRepo, triggerIndex } from '../../../lib/api';
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
      toast.error(msg);
      return;
    }

    // File-upload path is unsupported by the backend.
    if (projectType === 'local' && uploadedFiles && !localPath) {
      toast.info('File upload not yet supported — use a git URL or local path');
      return;
    }

    if (projectType === 'github' && !repoUrl) {
      const msg = 'Repository URL is required.';
      setValidationError(msg);
      toast.error(msg);
      return;
    }
    if (projectType === 'local' && !localPath) {
      const msg = 'Local path is required.';
      setValidationError(msg);
      toast.error(msg);
      return;
    }

    setValidationError('');
    setSubmitting(true);
    try {
      const body = {
        name,
        git_url: projectType === 'github' ? repoUrl : undefined,
        local_path: projectType === 'local' ? localPath : undefined,
      };
      const repo = await createRepo(body);
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
      toast.error(`Failed to create repository: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#2d2d2d] rounded-2xl border border-gray-800 w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-2xl font-bold text-white">Create New Project</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#3a3a3a] rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'type' ? (
            <div>
              <p className="text-gray-400 mb-6">Choose how you want to connect your codebase</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* GitHub Option */}
                <button
                  onClick={() => handleTypeSelect('github')}
                  className="p-6 bg-[#1e1e1e] border border-gray-700 hover:border-blue-500 rounded-xl transition-all text-left group"
                >
                  <div className="w-12 h-12 bg-[#2d2d2d] rounded-lg flex items-center justify-center mb-5 group-hover:bg-[#3a3a3a] transition-colors">
                    <GitBranch className="h-6 w-6 text-gray-400 group-hover:text-blue-400" />
                  </div>
                  <h3 className="text-2xl font-semibold text-white mb-5">Version Control</h3>
                  <p className="text-base text-gray-400 mb-5">
                    Connect your GitHub repository for automatic syncing and version tracking
                  </p>
                  <div className="flex items-center gap-5 text-base text-blue-400">
                    <span>Get Started</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </button>

                {/* Local Option */}
                <button
                  onClick={() => handleTypeSelect('local')}
                  className="p-6 bg-[#1e1e1e] border border-gray-700 hover:border-purple-500 rounded-xl transition-all text-left group"
                >
                  <div className="w-12 h-12 bg-[#2d2d2d] rounded-lg flex items-center justify-center mb-5 group-hover:bg-[#3a3a3a] transition-colors">
                    <HardDrive className="h-6 w-6 text-gray-400 group-hover:text-purple-400" />
                  </div>
                  <h3 className="text-2xl font-semibold text-white mb-5">Local Files</h3>
                  <p className="text-base text-gray-400 mb-5">
                    Upload code files directly from your computer for quick analysis
                  </p>
                  <div className="flex items-center gap-5 text-base text-purple-400">
                    <span>Get Started</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </button>
              </div>

              <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="flex gap-5">
                  <div className="w-1 h-auto bg-blue-500 rounded-full flex-shrink-0" />
                  <div>
                    <h4 className="text-base font-semibold text-blue-400 mb-1">Recommended: Version Control</h4>
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
                    <GitBranch className="h-5 w-5 text-blue-400" />
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
                  className="ml-auto text-base text-blue-400 hover:text-blue-300"
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
                  className="w-full px-5 py-3 bg-[#1e1e1e] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="w-full px-5 py-3 bg-[#1e1e1e] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
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
                    className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                      domain === 'personal'
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-700 bg-[#1e1e1e] hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-5 mb-5">
                      <User className={`h-5 w-5 ${domain === 'personal' ? 'text-blue-400' : 'text-gray-400'}`} />
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
                    className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                      domain === 'work'
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-gray-700 bg-[#1e1e1e] hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-5 mb-5">
                      <Briefcase className={`h-5 w-5 ${domain === 'work' ? 'text-purple-400' : 'text-gray-400'}`} />
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
                    className="w-full px-5 py-3 bg-[#1e1e1e] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-5">
                    We'll need access to clone and analyze your repository
                  </p>
                </div>
              )}

              {projectType === 'local' && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-base font-medium text-gray-300 mb-5">
                      Local Path *
                    </label>
                    <input
                      type="text"
                      value={localPath}
                      onChange={(e) => setLocalPath(e.target.value)}
                      placeholder="/absolute/path/to/repo"
                      className="w-full px-5 py-3 bg-[#1e1e1e] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-5">
                      Absolute path to a directory readable by the Cartographer backend
                    </p>
                  </div>

                  {/* Hidden file inputs */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                    multiple
                    accept=".js,.jsx,.ts,.tsx,.py,.java,.go,.cpp,.c,.cs,.rb,.php,.swift,.kt,.rs,.html,.css,.json,.xml,.yaml,.yml,.md"
                  />
                  <input
                    ref={folderInputRef}
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                    {...({ webkitdirectory: '', directory: '', mozdirectory: '' } as any)}
                  />

                  {uploadedFiles && uploadedFiles.length > 0 ? (
                    <div className="space-y-5">
                      <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                        <div className="flex items-center gap-5">
                          <Folder className="h-5 w-5 text-green-400" />
                          <span className="text-base text-white font-medium">
                            {uploadedFiles.length} files uploaded
                          </span>
                        </div>
                        <div className="flex items-center gap-5">
                          <button
                            onClick={() => folderInputRef.current?.click()}
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >
                            Upload Folder
                          </button>
                          <span className="text-gray-600">|</span>
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >
                            Add Files
                          </button>
                        </div>
                      </div>

                      {/* Folder Structure Preview */}
                      <div className="bg-[#1e1e1e] border border-gray-700 rounded-lg p-4 max-h-48 overflow-auto">
                        <h4 className="text-xs font-semibold text-gray-400 uppercase mb-5">Uploaded Files</h4>
                        <div className="space-y-1">
                          {Object.entries(folderStructure).map(([folder, files]) => (
                            <div key={folder} className="text-base">
                              <div className="flex items-center gap-5 text-gray-300 mb-1">
                                <Folder className="h-3.5 w-3.5 text-[#dcb67a]" />
                                <span className="font-medium">{folder}</span>
                                <span className="text-xs text-gray-500">({files.length} files)</span>
                              </div>
                              <div className="ml-6 space-y-0.5">
                                {files.slice(0, 3).map((file, idx) => (
                                  <div key={idx} className="flex items-center gap-5 text-xs text-gray-500">
                                    <FileCode className="h-3 w-3" />
                                    <span className="truncate">{file.name}</span>
                                  </div>
                                ))}
                                {files.length > 3 && (
                                  <div className="text-xs text-gray-600 ml-5">
                                    +{files.length - 3} more files
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="grid grid-cols-2 gap-5">
                        {/* Upload Folder */}
                        <button
                          type="button"
                          onClick={() => folderInputRef.current?.click()}
                          className="p-6 border-2 border-dashed border-gray-700 hover:border-purple-500 rounded-lg transition-all text-center group"
                        >
                          <Folder className="h-10 w-10 text-gray-600 group-hover:text-purple-400 mx-auto mb-5 transition-colors" />
                          <h4 className="text-white font-medium text-base mb-1">Upload Folder</h4>
                          <p className="text-xs text-gray-400">
                            Select entire project folder
                          </p>
                        </button>

                        {/* Upload Files */}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="p-6 border-2 border-dashed border-gray-700 hover:border-blue-500 rounded-lg transition-all text-center group"
                        >
                          <Upload className="h-10 w-10 text-gray-600 group-hover:text-blue-400 mx-auto mb-5 transition-colors" />
                          <h4 className="text-white font-medium text-base mb-1">Upload Files</h4>
                          <p className="text-xs text-gray-400">
                            Select individual files
                          </p>
                        </button>
                      </div>

                      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <p className="text-xs text-gray-400">
                          💡 <strong className="text-blue-400">Tip:</strong> Upload a folder to automatically organize by directory structure
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'details' && (
          <div className="flex items-center justify-between p-6 border-t border-gray-800">
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
                className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all flex items-center gap-5"
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
