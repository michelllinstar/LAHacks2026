'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mail, Building, MapPin, Link as LinkIcon, Save, Camera, Briefcase, User, LogOut } from 'lucide-react';
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
      // TODO: Replace this placeholder with a real API call to persist profile changes.
      // Currently simulates a network request with a timeout.
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      toast.success('Profile updated successfully');
      setIsEditing(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to save profile: ${msg}`);
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
      {/* Header */}
      <nav className="bg-[#2d2d2d] border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-5 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-5 text-gray-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
              Back to Dashboard
            </button>

            <div className="flex items-center gap-5">
              {isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-5 py-2 text-gray-300 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-5 py-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 text-white rounded-lg transition-all flex items-center gap-5"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? 'Saving...' : 'Save changes'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-5 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] text-white rounded-lg transition-colors"
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
                <div className="w-full aspect-square bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-white text-6xl font-bold">
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

              {isEditing ? (
                <textarea
                  value={profile.bio}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 bg-[#1e1e1e] border border-gray-700 rounded-lg text-white text-base resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Tell us about yourself..."
                />
              ) : (
                <p className="text-gray-300 text-base mb-5">{profile.bio}</p>
              )}

              <div className="space-y-5 mt-6">
                <div className="flex items-start gap-5 text-base">
                  <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  {isEditing ? (
                    <input
                      type="text"
                      value={profile.location}
                      onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                      className="flex-1 px-3 py-1 bg-[#1e1e1e] border border-gray-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Location"
                    />
                  ) : (
                    <span className="text-gray-300">{profile.location}</span>
                  )}
                </div>

                <div className="flex items-start gap-5 text-base">
                  <Building className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  {isEditing ? (
                    <input
                      type="text"
                      value={profile.company}
                      onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                      className="flex-1 px-3 py-1 bg-[#1e1e1e] border border-gray-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Company"
                    />
                  ) : (
                    <span className="text-gray-300">{profile.company}</span>
                  )}
                </div>

                <div className="flex items-start gap-5 text-base">
                  <LinkIcon className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  {isEditing ? (
                    <input
                      type="url"
                      value={profile.website}
                      onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                      className="flex-1 px-3 py-1 bg-[#1e1e1e] border border-gray-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Website URL"
                    />
                  ) : (
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      {profile.website}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Content - Email & Details */}
          <div className="md:col-span-2 space-y-6">
            {/* Personal Information */}
            <div className="bg-[#2d2d2d] rounded-xl border border-gray-800 p-6">
              <div className="flex items-center gap-5 mb-6">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
                  <User className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-2xl font-semibold text-white">Personal Information</h3>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-base font-medium text-gray-400 mb-5">
                    Full Name
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      className="w-full px-5 py-2.5 bg-[#1e1e1e] border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Your full name"
                    />
                  ) : (
                    <div className="px-5 py-2.5 bg-[#1e1e1e] border border-gray-800 rounded-lg text-white">
                      {profile.name}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-base font-medium text-gray-400 mb-5">
                    Username
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={profile.username}
                      onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                      className="w-full px-5 py-2.5 bg-[#1e1e1e] border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="username"
                    />
                  ) : (
                    <div className="px-5 py-2.5 bg-[#1e1e1e] border border-gray-800 rounded-lg text-white">
                      @{profile.username}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-base font-medium text-gray-400 mb-5 flex items-center gap-5">
                    <Mail className="h-4 w-4" />
                    Personal Email
                  </label>
                  {isEditing ? (
                    <input
                      type="email"
                      value={profile.personalEmail}
                      onChange={(e) => setProfile({ ...profile, personalEmail: e.target.value })}
                      className="w-full px-5 py-2.5 bg-[#1e1e1e] border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="your.email@personal.com"
                    />
                  ) : (
                    <div className="px-5 py-2.5 bg-[#1e1e1e] border border-gray-800 rounded-lg text-white flex items-center gap-5">
                      {profile.personalEmail}
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">Personal</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Work Information */}
            <div className="bg-[#2d2d2d] rounded-xl border border-gray-800 p-6">
              <div className="flex items-center gap-5 mb-6">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg">
                  <Briefcase className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-2xl font-semibold text-white">Work Information</h3>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-base font-medium text-gray-400 mb-5 flex items-center gap-5">
                    <Mail className="h-4 w-4" />
                    Company Email
                  </label>
                  {isEditing ? (
                    <input
                      type="email"
                      value={profile.companyEmail}
                      onChange={(e) => setProfile({ ...profile, companyEmail: e.target.value })}
                      className="w-full px-5 py-2.5 bg-[#1e1e1e] border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="your.email@company.com"
                    />
                  ) : (
                    <div className="px-5 py-2.5 bg-[#1e1e1e] border border-gray-800 rounded-lg text-white flex items-center gap-5">
                      {profile.companyEmail}
                      <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded">Work</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-base font-medium text-gray-400 mb-5">
                    Company Name
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={profile.company}
                      onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                      className="w-full px-5 py-2.5 bg-[#1e1e1e] border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Your company name"
                    />
                  ) : (
                    <div className="px-5 py-2.5 bg-[#1e1e1e] border border-gray-800 rounded-lg text-white">
                      {profile.company}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* MongoDB Schema Info */}
            <div className="bg-[#2d2d2d] rounded-xl border border-gray-800 p-6">
              <h3 className="text-2xl font-semibold text-white mb-5">Backend Schema</h3>
              <div className="bg-[#1e1e1e] rounded-lg p-4 border border-gray-700">
                <pre className="text-xs text-gray-300 overflow-x-auto">
{`// MongoDB User Schema
{
  _id: ObjectId,
  name: String,
  username: String (unique),
  personalEmail: String,
  companyEmail: String,
  bio: String,
  location: String,
  company: String,
  website: String,
  avatar: String (URL),
  createdAt: Date,
  updatedAt: Date
}`}
                </pre>
              </div>
            </div>

            {/* Logout Section */}
            <div className="bg-[#2d2d2d] rounded-xl border border-red-900/30 p-6">
              <h3 className="text-2xl font-semibold text-white mb-5">Account Actions</h3>
              <p className="text-base text-gray-400 mb-5">Sign out of your account</p>
              <button
                onClick={handleLogout}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-5"
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
