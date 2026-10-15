import React, { useState } from 'react';
import { useAuth } from '@/auth/authContext';
import { Alert } from '@/components/ui/Alert';
import { ChangePasswordForm } from '@/components/profile/ChangePasswordForm';
import { SecurityCard } from '@/components/profile/SecurityCard';
import { ProfileHeaderCard } from '../components/ProfileHeaderCard';
import { PersonalInfoCard } from '../components/PersonalInfoCard';
import { ProgressOverviewCard, FinishedCoursesCard } from '../components/LearningWidgets';
import { useProfileOverview } from '../hooks/useProfileOverview';

/**
 * ProfilePage
 *
 *  ┌ User Header Card (avatar, name, email, member details, role, stats) ┐
 *  ├ Personal Information (2/3) ──────────┬ Progress Overview (1/3) ─────┤
 *  │                                       ├ Finished Courses ────────────┤
 *  └ Account security: Change Password + Security (logout all devices) ──┘
 *
 * The Edit Profile button in the header toggles edit mode of the Personal
 * Information form (Save → PUT /users/me, Cancel → revert).
 */
export function ProfilePage() {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const overview = useProfileOverview(user?.role);

  if (!user) return null;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <h2 className="text-[22px] font-bold text-[#111827]">My Profile</h2>

      {overview.error && (
        <Alert type="warning" title="Statistics unavailable" message={overview.error} />
      )}

      <ProfileHeaderCard
        user={user}
        stats={overview.stats}
        statsLoading={overview.loading}
        editing={editing}
        onEdit={() => setEditing(true)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <div className="lg:col-span-2">
          <PersonalInfoCard user={user} editing={editing} onEditingChange={setEditing} />
        </div>
        <div className="flex flex-col gap-6">
          <ProgressOverviewCard
            courses={overview.inProgress}
            loading={overview.loading}
            tracksLearning={overview.tracksLearning}
          />
          <FinishedCoursesCard
            courses={overview.finished}
            loading={overview.loading}
            tracksLearning={overview.tracksLearning}
          />
        </div>
      </div>

      {/* Not part of the profile wireframe — kept so password change and
          "log out from all devices" stay reachable. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <div className="card p-6 flex flex-col">
          <h4 className="text-[16px] font-semibold text-[#111827] mb-4">Change Password</h4>
          <ChangePasswordForm />
        </div>
        <SecurityCard />
      </div>
    </div>
  );
}
