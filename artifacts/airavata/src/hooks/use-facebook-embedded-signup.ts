/**
 * useFacebookEmbeddedSignup
 *
 * Launches the WhatsApp Embedded Signup popup via the Facebook JS SDK.
 * On success the auth code is sent to the backend which exchanges it for
 * a WhatsApp Business access token and stores it against the logged-in user.
 *
 * Config ID: 1057575420290304
 * App ID:    1324395306544610
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const CONFIG_ID = "2110512133150292";
const FACEBOOK_SDK_REDIRECT_URI =
  "https://www.facebook.com/connect/login_success.html";

declare global {
  interface Window {
    fbSDKReady?: boolean;
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
  status: "connected" | "not_authorized" | "unknown";

  authResponse?: {
    code?: string;
    accessToken?: string;
    userID?: string;
  };
}

export function useFacebookEmbeddedSignup(onSuccess?: () => void) {
  const [isConnecting, setIsConnecting] = useState(false);

  const launch = useCallback(() => {
    if (typeof window.FB === "undefined" || !window.fbSDKReady) {
      toast.error(
        "Facebook SDK is still loading — please try again in a moment.",
      );
      return;
    }

    setIsConnecting(true);
    console.group("[WhatsApp Embedded Signup] Starting OAuth dialog");
    console.log("Current page:", window.location.href);
    console.log("redirect_uri:", FACEBOOK_SDK_REDIRECT_URI);
    console.log("config_id:", CONFIG_ID);
    console.log("response_type:", "code");
    console.groupEnd();

    window.FB.login(
      (response: FBLoginResponse) => {
        console.group("[WhatsApp Embedded Signup] Facebook SDK response");
        console.log("status:", response.status);
        console.log("has authResponse:", Boolean(response.authResponse));
        console.log("has authorization code:", Boolean(response.authResponse?.code));
        console.log(
          "authResponse keys:",
          response.authResponse ? Object.keys(response.authResponse) : [],
        );
        console.groupEnd();

        if (response.status !== "connected" || !response.authResponse?.code) {
          setIsConnecting(false);

          if (response.status !== "connected") {
            toast.error("Facebook login was cancelled or failed.");
          }

          return;
        }

        void (async () => {
          try {
            console.group("[WhatsApp Embedded Signup] Sending code to backend");
            console.log("POST /whatsapp/onboard");
            console.log("redirect_uri:", FACEBOOK_SDK_REDIRECT_URI);
            console.log("code present:", true);
            console.log("code length:", response.authResponse!.code!.length);
            console.groupEnd();

            await api.post("/whatsapp/onboard", {
              code: response.authResponse!.code,
              redirect_uri: FACEBOOK_SDK_REDIRECT_URI,
            });

            toast.success("WhatsApp Business Account connected successfully!");

            onSuccess?.();
          } catch (err: unknown) {
            const msg =
              err instanceof Error ? err.message : "Failed to connect account";

            toast.error(msg);
          } finally {
            setIsConnecting(false);
          }
        })();
      },
      {
        config_id: CONFIG_ID,
        redirect_uri: FACEBOOK_SDK_REDIRECT_URI,
        response_type: "code",
        override_default_response_type: true,

        extras: {
          sessionInfoVersion: 2,
        },
      },
    );
  }, [onSuccess]);

  return {
    launch,
    isConnecting,
  };
}
