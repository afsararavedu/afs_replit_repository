import brrLogo from "@assets/brr_solution_logo_1776622112650.jpeg";
import bgImage from "@assets/Liquor-store-inventory-homepage_1776678987599.png";
import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export default function AuthPage() {
  const { user, loginMutation } = useAuth();
  const [, setLocation] = useLocation();
  const [showForgot, setShowForgot] = useState(false);
  const { toast } = useToast();
  const [forgotUsername, setForgotUsername] = useState("");

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  useEffect(() => {
    if (user) {
      if (user.mustResetPassword) {
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

  const handleForgot = async () => {
    try {
      const res = await apiRequest("POST", "/api/forgot-password", { username: forgotUsername });
      const data = await res.json();
      toast({
        title: "Temp Password Generated",
        description: `Your temporary password is: ${data.tempPassword}. Please use it to login and reset.`,
      });
      setShowForgot(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div
      className="min-h-screen flex items-end justify-center pb-10 p-4"
      style={{
        backgroundImage: `url(${bgImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-8 pt-6 pb-6">
          <div className="flex justify-center mb-3">
            <img
              src={brrLogo}
              alt="BRR IT Solutions"
              className="w-20 h-20 object-contain rounded-full border-2 border-gray-200 shadow"
            />
          </div>
          <h1 className="text-center text-2xl font-bold text-gray-800 mb-4">BRR Liquor Soft Login</h1>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700 font-medium">Username</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter username"
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
                className="w-full h-11 rounded-md text-white font-semibold text-base transition-opacity disabled:opacity-70"
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

      {showForgot && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-sm shadow-2xl">
            <CardHeader>
              <CardTitle>Forgot Password</CardTitle>
              <CardDescription>Enter admin username to get a temporary password</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Admin Username"
                value={forgotUsername}
                onChange={(e) => setForgotUsername(e.target.value)}
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowForgot(false)} className="flex-1">Cancel</Button>
                <Button onClick={handleForgot} className="flex-1" style={{ backgroundColor: "#e03a2f" }}>Generate</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
