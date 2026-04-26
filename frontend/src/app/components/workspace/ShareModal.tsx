'use client';
import { useState, useEffect, useRef } from 'react';
import { X, Mail, Copy, Check, Globe, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface ShareModalProps {
  projectName: string;
  onClose: () => void;
}

type AccessLevel = 'view' | 'edit' | 'admin';

interface Invitee {
  email: string;
  access: AccessLevel;
}

const ACCESS_LABELS: Record<AccessLevel, string> = {
  view: 'View only',
  edit: 'Can edit',
  admin: 'Admin',
};

export function ShareModal({ projectName, onClose }: ShareModalProps) {
  const [email, setEmail] = useState('');
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('view');
  const [linkCopied, setLinkCopied] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleInvite = () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    // Basic email format validation: must contain @ and a dot after the @
    const atIndex = trimmed.indexOf('@');
    if (atIndex <= 0 || !trimmed.slice(atIndex + 1).includes('.')) {
      toast.error('Invalid email', {
        description: 'Enter a valid email address to send an invite.',
      });
      return;
    }
    if (invitees.some((i) => i.email === trimmed)) {
      toast.warning(`${trimmed} is already invited`, {
        description: 'Update their access level below or remove them first.',
      });
      return;
    }
    setInvitees((prev) => [...prev, { email: trimmed, access: accessLevel }]);
    toast.success(`Invitation sent to ${trimmed}`, {
      description: `Access level: ${ACCESS_LABELS[accessLevel]}`,
    });
    setEmail('');
  };

  const handleRemoveInvitee = (target: string) => {
    setInvitees((prev) => prev.filter((i) => i.email !== target));
    toast.info(`Removed ${target}`);
  };

  const handleChangeAccess = (target: string, level: AccessLevel) => {
    setInvitees((prev) => prev.map((i) => (i.email === target ? { ...i, access: level } : i)));
  };

  const handleCopyLink = () => {
    const link = `https://markcodepolo.com/projects/${projectName.toLowerCase().replace(/\s+/g, '-')}`;
    navigator.clipboard.writeText(link);
    setLinkCopied(true);
    toast.success('Link copied to clipboard');
    // Clear any pending timeout before setting a new one
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#2d2d2d] rounded-xl border border-gray-800 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div>
            <h2 className="text-xl font-bold text-white">Share Project</h2>
            <p className="text-sm text-gray-400 mt-1">{projectName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#252526] rounded-lg transition-colors"
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
                  value={`https://markcodepolo.com/projects/${projectName.toLowerCase().replace(/\s+/g, '-')}`}
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
                  className="w-full pl-9 pr-3 py-2 bg-[#1e1e1e] border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#2DD4BF] focus:border-transparent"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') handleInvite();
                  }}
                />
              </div>

              <div className="flex gap-2">
                <select
                  value={accessLevel}
                  onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}
                  className="flex-1 px-3 py-2 bg-[#1e1e1e] border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#2DD4BF]"
                >
                  <option value="view">View Only</option>
                  <option value="edit">Can Edit</option>
                  <option value="admin">Admin</option>
                </select>

                <button
                  onClick={handleInvite}
                  disabled={!email.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-[#34D399] to-[#F59E0B] hover:from-[#2DD4BF] hover:to-[#FBBF24] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-all"
                >
                  Invite
                </button>
              </div>
            </div>

            {/* Invited list — shows the people already invited so the user
                can confirm what was sent, change access, or remove. */}
            {invitees.length > 0 && (
              <div className="mt-4 border border-gray-700 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-[#252526] text-[11px] uppercase tracking-wide text-gray-400 font-semibold flex items-center justify-between">
                  <span>People with access</span>
                  <span className="text-gray-500 normal-case">
                    {invitees.length} invited
                  </span>
                </div>
                <ul className="divide-y divide-gray-800">
                  {invitees.map((i) => (
                    <li
                      key={i.email}
                      className="flex items-center gap-2 px-3 py-2 bg-[#1e1e1e]"
                    >
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#5EEAD4] to-[#FBBF24] flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
                        {i.email.charAt(0).toUpperCase()}
                      </div>
                      <span className="flex-1 text-sm text-gray-200 truncate" title={i.email}>
                        {i.email}
                      </span>
                      <select
                        value={i.access}
                        onChange={(e) => handleChangeAccess(i.email, e.target.value as AccessLevel)}
                        className="px-2 py-1 bg-[#2d2d2d] border border-gray-700 rounded text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-[#2DD4BF]"
                      >
                        <option value="view">View only</option>
                        <option value="edit">Can edit</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRemoveInvitee(i.email)}
                        className="p-1 text-gray-500 hover:text-red-400 hover:bg-white/[0.05] rounded transition-colors"
                        title={`Remove ${i.email}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#252526] hover:bg-[#424242] text-white text-sm rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
