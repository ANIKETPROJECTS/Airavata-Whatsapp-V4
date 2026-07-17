/**
 * useFacebookEmbeddedSignup
 *
 * Launches the WhatsApp Embedded Signup popup via the Facebook JS SDK.
 * On success the auth code is sent to the backend which exchanges it for
 * a system-user access token and stores it against the logged-in user.
 *
 * Config ID: 1057575420290304 (WhatsApp Embedded Signup With 60 Expiration Token)
 * App ID:    1324395306544610
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

const CONFIG_ID = '1057575420290304';

declare global {
  interface Window {
    FB: {
      init: (opts: Record<string, unknown>) => void;
      login: (
        cb: (response: FBLoginResponse) => void,
        opts: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

interface FBLoginResponse {
  status: 'connected' | 'not_authorized' | 'unknown';
  authResponse?: {
    code?: string;
    accessToken?: string;
    userID?: string;
  };
}

export function useFacebookEmbeddedSignup(onSuccess?: () => void) {
  const [isConnecting, setIsConnecting] = useState(false);

  const launch = useCallback(() => {
    if (typeof window.FB === 'undefined') {
      toast.error('Facebook SDK is still loading — please try again in a moment.');
      return;
    }

    setIsConnecting(true);

    window.FB.login(
      async (response: FBLoginResponse) => {
        if (response.status !== 'connected' || !response.authResponse?.code) {
          setIsConnecting(false);
          if (response.status !== 'connected') {
            toast.error('Facebook login was cancelled or failed.');
          }
          return;
        }

        try {
          await api.post('/integration/facebook/connect', {
            code: response.authResponse.code,
          });
          toast.success('WhatsApp Business Account connected successfully!');
          onSuccess?.();
        } catch (err: unknown) {
          const msg =
            err instanceof Error ? err.message : 'Failed to connect account';
          toast.error(msg);
        } finally {
          setIsConnecting(false);
        }
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          sessionInfoVersion: 2,
        },
      },
    );
  }, [onSuccess]);

  return { launch, isConnecting };
}
