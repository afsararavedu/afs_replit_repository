import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
    defaultValues: {
      username: "",
      password: "",
    },
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
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-xl border-border/40">
        <CardHeader className="space-y-1 text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-primary/20 mx-auto mb-4">
            B
          </div>
          <CardTitle className="text-2xl font-bold">BRR Liquor Soft Login</CardTitle>
          <CardDescription>Enter your credentials to access your dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter username" {...field} />
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
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Enter password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full h-11 text-base font-medium" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? "Logging in..." : "Login"}
              </Button>
            </form>
          </Form>
          
          <div className="mt-6 text-center">
            <button 
              onClick={() => setShowForgot(true)}
              className="text-sm font-medium text-primary hover:underline"
            >
              Forgot Password? (Admin Only)
            </button>
          </div>
        </CardContent>
      </Card>

      {showForgot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-sm">
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
                <Button onClick={handleForgot} className="flex-1">Generate</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
