/**
 * useFacebookEmbeddedSignup
 *
 * Launches the WhatsApp Embedded Signup popup via the Facebook JS SDK.
 * On success the auth code is sent to the backend which exchanges it for
 * a WhatsApp Business access token and stores it against the logged-in user.
 *
 * Config ID: 2519748081877556
 * App ID:    1324395306544610
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const CONFIG_ID = "2519748081877556";

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
  const signupIdsRef = useRef<{ wabaId?: string; phoneNumberId?: string }>({});

  useEffect(() => {
    const handleSignupMessage = (event: MessageEvent) => {
      let originHost = "";
      try {
        originHost = new URL(event.origin).hostname;
      } catch {
        return;
      }

      if (originHost !== "facebook.com" && !originHost.endsWith(".facebook.com")) {
        return;
      }

      let message: unknown = event.data;
      if (typeof message === "string") {
        try {
          message = JSON.parse(message);
        } catch {
          return;
        }
      }

      if (!message || typeof message !== "object") return;
      const data = message as {
        type?: string;
        event?: string;
        data?: { waba_id?: string; phone_number_id?: string };
      };

      if (data.type !== "WA_EMBEDDED_SIGNUP") return;
      console.log("[WhatsApp Embedded Signup] postMessage received", {
        origin: event.origin,
        type: data.type,
        event: data.event,
        hasWabaId: Boolean(data.data?.waba_id),
        hasPhoneNumberId: Boolean(data.data?.phone_number_id),
      });

      if (data.event === "FINISH" && data.data) {
        signupIdsRef.current = {
          wabaId: data.data.waba_id,
          phoneNumberId: data.data.phone_number_id,
        };
        console.log("[WhatsApp Embedded Signup] FINISH IDs captured", {
          wabaId: data.data.waba_id,
          phoneNumberId: data.data.phone_number_id,
        });
      }
    };

    window.addEventListener("message", handleSignupMessage);
    return () => window.removeEventListener("message", handleSignupMessage);
  }, []);

  const launch = useCallback(() => {
    if (typeof window.FB === "undefined" || !window.fbSDKReady) {
      toast.error(
        "Facebook SDK is still loading — please try again in a moment.",
      );
      return;
    }

    setIsConnecting(true);
    signupIdsRef.current = {};
    console.group("[WhatsApp Embedded Signup] Starting OAuth dialog");
    console.log("Current page:", window.location.href);
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
            console.log("code present:", true);
            console.log("code length:", response.authResponse!.code!.length);
            console.log("captured postMessage IDs:", {
              wabaId: signupIdsRef.current.wabaId ?? null,
              phoneNumberId: signupIdsRef.current.phoneNumberId ?? null,
            });
            console.groupEnd();

            await api.post("/whatsapp/onboard", {
              code: response.authResponse!.code,
              waba_id: signupIdsRef.current.wabaId,
              phone_number_id: signupIdsRef.current.phoneNumberId,
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
        response_type: "code",
        override_default_response_type: true,

        extras: {
          version: "v4",
          sessionInfoVersion: 3,
          featureType: "whatsapp_business_app_onboarding",
        },
      },
    );
  }, [onSuccess]);

  return {
    launch,
    isConnecting,
  };
}
