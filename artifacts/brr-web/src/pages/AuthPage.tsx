import brrLogo from "@assets/brr_solution_logo_1776622112650.jpeg";
import bgImage from "@assets/Liquor-store-inventory-homepage_1_1777047159851.png";
import { useAuth } from "@/hooks/use-auth";
import { ApiError } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

function formatRemaining(totalSec: number): string {
  if (totalSec <= 0) return "0 seconds";
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes <= 0) {
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  if (seconds === 0) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${minutes} min ${seconds} sec`;
}

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export default function AuthPage() {
  const { user, loginMutation } = useAuth();
  const [, setLocation] = useLocation();
  const [showForgot, setShowForgot] = useState(false);
  // Wall-clock time (ms) at which the lockout expires, or null if not locked.
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  // Re-render every second while the countdown is active.
  const [now, setNow] = useState<number>(() => Date.now());
  // Generic non-lockout error message (e.g. "Invalid username or password")
  // to render inline above the button. The destructive toast still fires
  // for these via use-auth, but this gives an additional clear inline cue.
  const [inlineError, setInlineError] = useState<string | null>(null);
  // How many login attempts the server says we have left before the
  // lockout kicks in. Populated from the 401 response body and only
  // used to render the "X attempts remaining" warning when the count
  // gets uncomfortably low. Cleared on submit so the warning can't
  // linger after a successful retry.
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(
    null,
  );

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  useEffect(() => {
    if (user) {
      // After login, only force the reset screen when the password is
      // older than 90 days (server-computed `passwordExpired`). Otherwise
      // go straight to the dashboard, even if a temp password was issued
      // -- the user can change it later from the sidebar button.
      if (user.passwordExpired) {
        setLocation("/reset-password");
      } else if (user.role === "admin") {
        setLocation("/");
      } else {
        setLocation("/sales");
      }
    }
  }, [user]);

  // Drive the countdown timer once a lockout is active. The interval is
  // only registered while we know we're locked, and it auto-clears when
  // the deadline passes so the submit button re-enables itself.
  useEffect(() => {
    if (lockoutUntil === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lockoutUntil) {
        setLockoutUntil(null);
        window.clearInterval(id);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [lockoutUntil]);

  if (user) return null;

  const remainingSec =
    lockoutUntil !== null
      ? Math.max(0, Math.ceil((lockoutUntil - now) / 1000))
      : 0;
  const isLocked = remainingSec > 0;

  const onSubmit = (data: z.infer<typeof loginSchema>) => {
    if (isLocked) return;
    setInlineError(null);
    setAttemptsRemaining(null);
    loginMutation.mutate(data, {
      onError: (error) => {
        if (error instanceof ApiError && error.status === 429) {
          // Server tells us how many seconds to wait. Prefer the
          // structured `retryAfterSec` field (sent in the JSON body),
          // and fall back to a sensible default if it's missing.
          const body = (error.body ?? {}) as { retryAfterSec?: unknown };
          const sec =
            typeof body.retryAfterSec === "number" && body.retryAfterSec > 0
              ? Math.ceil(body.retryAfterSec)
              : 60;
          setLockoutUntil(Date.now() + sec * 1000);
          setInlineError(null);
        } else {
          setInlineError(
            error instanceof ApiError && error.status === 401
              ? "Invalid username or password."
              : error.message,
          );
          // 401 carries `attemptsRemaining` so we can warn the user
          // before the next miss locks them out for 15 minutes.
          if (error instanceof ApiError && error.status === 401) {
            const body = (error.body ?? {}) as { attemptsRemaining?: unknown };
            if (typeof body.attemptsRemaining === "number") {
              setAttemptsRemaining(Math.max(0, body.attemptsRemaining));
            }
          }
        }
      },
    });
  };

  return (
    <div className="auth-root">
      {/* Background image layer — separate element avoids iOS fixed issues */}
      <div
        className="auth-bg"
        style={{ backgroundImage: `url(${bgImage})` }}
        aria-hidden="true"
      />

      {/* Overlay for readability */}
      <div className="auth-overlay" aria-hidden="true" />

      {/* Login card */}
      <div className="auth-card-wrapper">
        <div className="auth-card">
          <div className="auth-card-inner">
            {/* Logo */}
            <div className="flex justify-center mb-4">
              <img
                src={brrLogo}
                alt="BRR IT Solutions"
                className="w-20 h-20 object-contain rounded-full border-2 border-gray-100 shadow-md"
              />
            </div>

            <h1 className="text-center text-2xl font-bold text-gray-800 mb-5 leading-tight">
              BRR Liquor Soft Login
            </h1>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700 font-medium">Username</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter username"
                          autoComplete="username"
                          className="border-gray-300 focus:border-red-400 focus:ring-red-400/20 rounded-md"
                          data-testid="input-username"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700 font-medium">Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter password"
                          autoComplete="current-password"
                          className="border-gray-300 focus:border-red-400 focus:ring-red-400/20 rounded-md"
                          data-testid="input-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {isLocked && (
                  <div
                    role="alert"
                    data-testid="login-lockout"
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                  >
                    <div className="font-semibold">
                      Too many failed attempts
                    </div>
                    <div>
                      For security, login is paused. Try again in{" "}
                      <span data-testid="login-lockout-remaining">
                        {formatRemaining(remainingSec)}
                      </span>
                      .
                    </div>
                  </div>
                )}
                {!isLocked && inlineError && (
                  <div
                    role="alert"
                    data-testid="login-error"
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                  >
                    <div>{inlineError}</div>
                    {attemptsRemaining !== null &&
                      attemptsRemaining <= 2 && (
                        <div
                          className="mt-1 font-semibold"
                          data-testid="login-attempts-warning"
                        >
                          {attemptsRemaining === 0
                            ? "No attempts remaining — this account is now temporarily locked."
                            : attemptsRemaining === 1
                              ? "1 attempt remaining before this account is temporarily locked."
                              : `${attemptsRemaining} attempts remaining before this account is temporarily locked.`}
                        </div>
                      )}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loginMutation.isPending || isLocked}
                  data-testid="button-login"
                  className="w-full h-11 rounded-md text-white font-semibold text-base transition-opacity disabled:opacity-70 disabled:cursor-not-allowed mt-1"
                  style={{ backgroundColor: "#e03a2f" }}
                >
                  {isLocked
                    ? `Locked — wait ${formatRemaining(remainingSec)}`
                    : loginMutation.isPending
                      ? "Logging in..."
                      : "Login"}
                </button>
              </form>
            </Form>

            <div className="mt-5 text-center">
              <button
                onClick={() => setShowForgot(true)}
                className="text-sm font-medium hover:underline"
                style={{ color: "#e03a2f" }}
              >
                Forgot Password? (Admin Only)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot password info modal — self-service reset has been removed
          to prevent anyone from generating a temp password for an admin
          account. An authenticated admin must now issue a temporary
          password via the API and hand it off to the locked-out user. */}
      {showForgot && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-sm shadow-2xl">
            <CardHeader>
              <CardTitle>Forgot Password</CardTitle>
              <CardDescription>
                For security, password resets are no longer self-service.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Please contact your system administrator. They can issue you
                a temporary password, which you can use to log in and then
                set a new password.
              </p>
              <div className="flex">
                <Button
                  onClick={() => setShowForgot(false)}
                  className="flex-1"
                  style={{ backgroundColor: "#e03a2f" }}
                >
                  OK
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <style>{`
        /* Auth layout — cross-browser, all devices */
        .auth-root {
          position: relative;
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          overflow: hidden;
        }

        /* Background image using absolute positioning instead of
           background-attachment:fixed which breaks on iOS Safari */
        .auth-bg {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center center;
          background-repeat: no-repeat;
          /* Slight zoom so edges are never white on any ratio */
          transform: scale(1.04);
          transform-origin: center;
          will-change: transform;
        }

        /* Subtle dark overlay so text on card reads clearly */
        .auth-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.30);
        }

        /* Centred card wrapper sits above bg + overlay */
        .auth-card-wrapper {
          position: relative;
          z-index: 10;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .auth-card {
          width: 100%;
          max-width: 22rem;   /* 352 px — comfortable on all phones */
          background: rgba(255, 255, 255, 0.97);
          border-radius: 1.25rem;
          box-shadow: 0 20px 60px rgba(0,0,0,0.35), 0 4px 16px rgba(0,0,0,0.15);
          overflow: hidden;
          /* Backdrop blur for browsers that support it */
          -webkit-backdrop-filter: blur(8px);
          backdrop-filter: blur(8px);
        }

        .auth-card-inner {
          padding: 2rem 2rem 1.75rem;
        }

        /* Responsive adjustments */
        @media (max-width: 400px) {
          .auth-card-inner {
            padding: 1.5rem 1.25rem 1.5rem;
          }
        }

        @media (min-width: 640px) {
          .auth-card {
            max-width: 24rem;   /* 384 px — tablet / desktop */
          }
        }
      `}</style>
    </div>
  );
}
