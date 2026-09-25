import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/auth/authContext';
import { ROUTES } from '@/app/routes';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';

/**
 * SecurityCard
 *
 * "Security" section of the My Profile page. Offers "Logout from All
 * Devices" backed by POST /api/v1/auth/logout-all via AuthContext
 * logoutAll() (reuses the shared session cleanup — no duplicated logout
 * logic, no hardcoded URLs or headers).
 *
 * Flow: confirm via Modal → logoutAll() → on success the AuthContext is
 * reset and routing reacts (redirect to /login); a success toast is shown
 * (survives the redirect because ToastHost is mounted above the router).
 * On failure the user stays logged in and the backend error message is
 * displayed.
 */
export function SecurityCard() {
  const { logoutAll } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    if (loading) return; // prevent duplicate requests
    setLoading(true);
    setError('');
    try {
      await logoutAll();
      setConfirmOpen(false);
      // Context is already cleared; routing has switched to the auth branch.
      navigate(ROUTES.login, { replace: true });
      toast.success('You have been signed out from all devices.');
    } catch (err: unknown) {
      // API failed → user stays logged in. Show backend message if present.
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Unable to log out from all devices. Please try again.';
      setError(message);
      setConfirmOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-6">
      <h4 className="text-[16px] font-semibold text-foreground">Security</h4>
      <p className="text-[13px] text-muted-foreground mt-0.5">
        Manage your active sessions and account security.
      </p>

      {error && (
        <div className="mt-4">
          <Alert type="error" title="Action failed" message={error} />
        </div>
      )}

      <div className="mt-5 pt-5 border-t border-line flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-foreground">
            Logout from All Devices
          </p>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Sign out this account from every device where it is currently
            logged in.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          loading={loading}
          disabled={loading}
          onClick={() => setConfirmOpen(true)}
          className="text-warning border-warning/40 hover:bg-warning-light hover:text-warning flex-shrink-0"
        >
          <Icon.LogOut className="w-4 h-4" />
          Logout All Devices
        </Button>
      </div>

      {/* Confirmation dialog */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Logout from All Devices"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={loading}
              disabled={loading}
              onClick={handleConfirm}
            >
              Logout All Devices
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          This will immediately sign you out from every device where you are
          currently logged in, including this one.
        </p>
      </Modal>
    </div>
  );
}
