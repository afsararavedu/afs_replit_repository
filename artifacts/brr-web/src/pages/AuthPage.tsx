import brrLogo from "@assets/brr_solution_logo_1776622112650.jpeg";
import bgImage from "@assets/Liquor-store-inventory-homepage_1_1777047159851.png";
import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export default function AuthPage() {
  const { user, loginMutation } = useAuth();
  const [, setLocation] = useLocation();
  const [showForgot, setShowForgot] = useState(false);

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
      } else {
        setLocation("/");
      }
    }
  }, [user]);

  if (user) return null;

  const onSubmit = (data: z.infer<typeof loginSchema>) => {
    loginMutation.mutate(data);
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
                <button
                  type="submit"
                  disabled={loginMutation.isPending}
                  data-testid="button-login"
                  className="w-full h-11 rounded-md text-white font-semibold text-base transition-opacity disabled:opacity-70 mt-1"
                  style={{ backgroundColor: "#e03a2f" }}
                >
                  {loginMutation.isPending ? "Logging in..." : "Login"}
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
