'use client';
import { useState } from 'react';
import { X, Mail, Copy, Check, Globe } from 'lucide-react';
import { toast } from 'sonner';

interface ShareModalProps {
  projectName: string;
  onClose: () => void;
}

type AccessLevel = 'view' | 'edit' | 'admin';

export function ShareModal({ projectName, onClose }: ShareModalProps) {
  const [email, setEmail] = useState('');
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('view');
  const [linkCopied, setLinkCopied] = useState(false);
  const [isPublic, setIsPublic] = useState(false);

  const handleInvite = () => {
    if (email) {
      toast.success(`Invitation sent to ${email}`);
      setEmail('');
    }
  };

  const handleCopyLink = () => {
    const link = `https://codeviz.ai/projects/${projectName.toLowerCase().replace(/\s+/g, '-')}`;
    navigator.clipboard.writeText(link);
    setLinkCopied(true);
    toast.success('Link copied to clipboard');
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#2d2d2d] rounded-xl border border-gray-800 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div>
            <h2 className="text-xl font-bold text-white">Share Project</h2>
            <p className="text-sm text-gray-400 mt-1">{projectName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#3a3a3a] rounded-lg transition-colors"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Public Access Toggle */}
          <div className="p-3 bg-[#1e1e1e] border border-gray-700 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-white">Public Access</h3>
              </div>
              <button
                onClick={() => setIsPublic(!isPublic)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  isPublic ? 'bg-blue-500' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    isPublic ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {isPublic && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={`https://codeviz.ai/projects/${projectName.toLowerCase().replace(/\s+/g, '-')}`}
                  readOnly
                  className="flex-1 px-2 py-1.5 bg-[#2d2d2d] border border-gray-700 rounded text-xs text-gray-300 focus:outline-none"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors flex items-center gap-1.5"
                >
                  {linkCopied ? (
                    <>
                      <Check className="h-3 w-3" />
                      <span className="text-xs">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span className="text-xs">Copy</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Invite People */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Invite People</h3>
            <div className="space-y-2">
              <div className="relative">
                <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email address"
                  className="w-full pl-9 pr-3 py-2 bg-[#1e1e1e] border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') handleInvite();
                  }}
                />
              </div>

              <div className="flex gap-2">
                <select
                  value={accessLevel}
                  onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}
                  className="flex-1 px-3 py-2 bg-[#1e1e1e] border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="view">View Only</option>
                  <option value="edit">Can Edit</option>
                  <option value="admin">Admin</option>
                </select>

                <button
                  onClick={handleInvite}
                  disabled={!email}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-all"
                >
                  Invite
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#3a3a3a] hover:bg-[#424242] text-white text-sm rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
