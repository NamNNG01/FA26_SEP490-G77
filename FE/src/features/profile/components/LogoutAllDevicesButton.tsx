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
 * "Logout All Devices" button + confirmation dialog, backed by
 * POST /api/v1/auth/logout-all via AuthContext logoutAll().
 *
 * On success the AuthContext is reset, the user is sent to /login and a
 * toast is shown (ToastHost is mounted above the router). On failure the
 * user stays logged in and the backend message is shown in the dialog.
 */
export function LogoutAllDevicesButton({ className = '' }: { className?: string }) {
  const { logoutAll } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function openConfirm() {
    setError('');
    setConfirmOpen(true);
  }

  function closeConfirm() {
    if (!loading) setConfirmOpen(false);
  }

  async function handleConfirm() {
    if (loading) return; // prevent duplicate requests
    setLoading(true);
    setError('');
    try {
      await logoutAll();
      setConfirmOpen(false);
      navigate(ROUTES.login, { replace: true });
      toast.success('You have been signed out from all devices.');
    } catch (err: unknown) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Unable to log out from all devices. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        icon={<Icon.LogOut className="w-4 h-4" />}
        onClick={openConfirm}
        className={`text-warning border-warning/40 hover:bg-warning-light hover:text-warning ${className}`}
      >
        Logout All Devices
      </Button>

      <Modal
        open={confirmOpen}
        onClose={closeConfirm}
        title="Logout from All Devices"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={closeConfirm} disabled={loading}>
              Cancel
            </Button>
            <Button variant="danger" loading={loading} disabled={loading} onClick={handleConfirm}>
              Logout All Devices
            </Button>
          </>
        }
      >
        <p className="text-base text-muted-foreground leading-relaxed">
          This will immediately sign you out from every device where you are currently logged in,
          including this one.
        </p>
        {error && (
          <div className="mt-4">
            <Alert type="error" title="Action failed" message={error} />
          </div>
        )}
      </Modal>
    </>
  );
}
