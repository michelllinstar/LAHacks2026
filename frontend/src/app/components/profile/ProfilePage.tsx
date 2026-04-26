'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Building, MapPin, Link as LinkIcon, Save, Camera, Briefcase, User, LogOut } from 'lucide-react';
import { AnimatedLogo } from '../ui/AnimatedLogo';
import { toast } from 'sonner';

interface UserProfile {
  name: string;
  username: string;
  personalEmail: string;
  companyEmail: string;
  bio: string;
  location: string;
  company: string;
  website: string;
  avatar?: string;
}

interface ProfilePageProps {
  user: {
    name: string;
    email: string;
  };
  onLogout: () => void;
}

const FIELD_BASE =
  'w-full h-11 px-5 bg-[#1e1e1e] border border-gray-800 rounded-lg text-white text-base ' +
  'placeholder-gray-500 transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-[#2DD4BF] focus:border-transparent ' +
  'disabled:cursor-default disabled:opacity-100';

const COMPACT_FIELD =
  'flex-1 h-9 px-3 bg-[#1e1e1e] border border-gray-800 rounded text-white text-base ' +
  'placeholder-gray-500 transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-[#2DD4BF] focus:border-transparent ' +
  'disabled:cursor-default disabled:opacity-100';

export function ProfilePage({ user, onLogout }: ProfilePageProps) {
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile>({
    name: user.name,
    username: user.name.toLowerCase().replace(' ', ''),
    personalEmail: 'alex.rivera@personal.com',
    companyEmail: user.email,
    bio: 'Full-stack developer passionate about building developer tools and improving code visualization.',
    location: 'San Francisco, CA',
    company: 'Tech Corp',
    website: 'https://alexrivera.dev',
  });

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // TODO: Replace with a real API call once backend persistence exists.
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      toast.success('Profile updated successfully');
      setIsEditing(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Couldn\u2019t save profile', { description: msg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarClick = () => {
    toast.info('Avatar upload coming soon');
  };

  const handleLogout = () => {
    try {
      onLogout();
      router.push('/login');
      toast.success('Logged out successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Logout failed: ${msg}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e]">
      {/* Top Navigation — mirrors ProjectsDashboard exactly */}
      <nav className="bg-[#2d2d2d] border-b border-gray-800">
        <div className="px-[100px] py-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-4"
            >
              <AnimatedLogo size={40} />
              <div className="text-left">
                <h1 className="text-3xl font-bold text-white leading-tight">Repositories</h1>
                <p className="text-[10px] text-gray-400 leading-tight">markcodepolo</p>
              </div>
            </button>

            <div className="flex items-center gap-3">
              {isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-6 py-3 text-base text-gray-300 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-7 py-3 text-base font-medium text-white border-2 border-white/30 hover:border-white/60 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-all flex items-center gap-3 bg-transparent"
                  >
                    <Save className="h-5 w-5" />
                    {isSaving ? 'Saving...' : 'Save changes'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-7 py-3 text-base font-medium text-white border-2 border-white/30 hover:border-white/60 hover:bg-white/5 rounded-lg transition-all bg-transparent"
                >
                  Edit profile
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-5 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Sidebar - Avatar & Basic Info */}
          <div className="md:col-span-1">
            <div className="bg-[#2d2d2d] rounded-xl border border-gray-800 p-6">
              <div className="relative group mb-5">
                <div className="w-full aspect-square rounded-full flex items-center justify-center text-white text-6xl font-bold border border-white/10 bg-white/[0.03] hover-glow">
                  {profile.name.charAt(0)}
                </div>
                {isEditing && (
                  <button
                    onClick={handleAvatarClick}
                    className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Camera className="h-8 w-8 text-white" />
                  </button>
                )}
              </div>

              <h2 className="text-2xl font-bold text-white mb-1">{profile.name}</h2>
              <p className="text-gray-400 mb-5">@{profile.username}</p>

              <textarea
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                disabled={!isEditing}
                rows={4}
                className="w-full px-3 py-2 bg-[#1e1e1e] border border-gray-800 rounded-lg text-white text-base resize-none focus:outline-none focus:ring-2 focus:ring-[#2DD4BF] focus:border-transparent disabled:cursor-default disabled:opacity-100"
                placeholder="Tell us about yourself..."
              />

              <div className="space-y-3 mt-6">
                <div className="flex items-center gap-3 text-base">
                  <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={profile.location}
                    onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                    disabled={!isEditing}
                    className={COMPACT_FIELD}
                    placeholder="Location"
                  />
                </div>

                <div className="flex items-center gap-3 text-base">
                  <Building className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={profile.company}
                    onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                    disabled={!isEditing}
                    className={COMPACT_FIELD}
                    placeholder="Company"
                  />
                </div>

                <div className="flex items-center gap-3 text-base">
                  <LinkIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <input
                    type="url"
                    value={profile.website}
                    onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                    disabled={!isEditing}
                    className={COMPACT_FIELD}
                    placeholder="Website URL"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Content - Email & Details */}
          <div className="md:col-span-2 space-y-6">
            {/* Personal Information */}
            <div className="bg-[#2d2d2d] rounded-xl border border-gray-800 p-6">
              <div className="flex items-center gap-5 mb-6">
                <div className="p-2 rounded-lg border border-white/10 bg-white/[0.03] hover-glow">
                  <User className="h-5 w-5 text-[#B7553A]" />
                </div>
                <h3 className="text-2xl font-semibold text-white">Personal Information</h3>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-base font-medium text-gray-400 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    disabled={!isEditing}
                    className={FIELD_BASE}
                    placeholder="Your full name"
                  />
                </div>

                <div>
                  <label className="block text-base font-medium text-gray-400 mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={profile.username}
                    onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                    disabled={!isEditing}
                    className={FIELD_BASE}
                    placeholder="username"
                  />
                </div>

                <div>
                  <label className="text-base font-medium text-gray-400 mb-2 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Personal Email
                  </label>
                  <input
                    type="email"
                    value={profile.personalEmail}
                    onChange={(e) => setProfile({ ...profile, personalEmail: e.target.value })}
                    disabled={!isEditing}
                    className={FIELD_BASE}
                    placeholder="your.email@personal.com"
                  />
                </div>
              </div>
            </div>

            {/* Work Information */}
            <div className="bg-[#2d2d2d] rounded-xl border border-gray-800 p-6">
              <div className="flex items-center gap-5 mb-6">
                <div className="p-2 rounded-lg border border-white/10 bg-white/[0.03] hover-glow">
                  <Briefcase className="h-5 w-5 text-[#B7553A]" />
                </div>
                <h3 className="text-2xl font-semibold text-white">Work Information</h3>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="text-base font-medium text-gray-400 mb-2 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Company Email
                  </label>
                  <input
                    type="email"
                    value={profile.companyEmail}
                    onChange={(e) => setProfile({ ...profile, companyEmail: e.target.value })}
                    disabled={!isEditing}
                    className={FIELD_BASE}
                    placeholder="your.email@company.com"
                  />
                </div>

                <div>
                  <label className="block text-base font-medium text-gray-400 mb-2">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={profile.company}
                    onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                    disabled={!isEditing}
                    className={FIELD_BASE}
                    placeholder="Your company name"
                  />
                </div>
              </div>
            </div>

            {/* Account Actions — same neutral chrome as the other field cards */}
            <div className="bg-[#2d2d2d] rounded-xl border border-gray-800 p-6">
              <div className="flex items-center gap-5 mb-6">
                <div className="p-2 rounded-lg border border-white/10 bg-white/[0.03] hover-glow">
                  <LogOut className="h-5 w-5 text-[#B7553A]" />
                </div>
                <h3 className="text-2xl font-semibold text-white">Account Actions</h3>
              </div>
              <p className="text-base text-gray-400 mb-5">Sign out of your account</p>
              <button
                onClick={handleLogout}
                className="hover-glow px-5 py-2.5 bg-white/[0.04] border border-white/10 text-white rounded-lg transition-all flex items-center gap-3"
              >
                <LogOut className="h-4 w-4" />
                Log Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
