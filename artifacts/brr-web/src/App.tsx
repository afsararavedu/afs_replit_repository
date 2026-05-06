import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Sales from "@/pages/Sales";
import Stock from "@/pages/Stock";
import Inventory from "@/pages/Inventory";
import Reports from "@/pages/Reports";
import Expenses from "@/pages/Expenses";
import AuthPage from "@/pages/AuthPage";
import ResetPassword from "@/pages/ResetPassword";
import AboutUs from "@/pages/AboutUs";
import ContactUs from "@/pages/ContactUs";

function ProtectedRoute({ component: Component, path, role }: { component: React.ComponentType, path: string, role?: string }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) return <Redirect to="/auth" />;
  if (role && user.role !== role) return <Redirect to="/sales" />;

  return <Component />;
}

function Router() {
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background font-sans">
      {user && (
        <Sidebar drawerOpen={drawerOpen} onDrawerClose={() => setDrawerOpen(false)} />
      )}
      <div className={`flex-1 min-w-0 ${user ? 'md:pl-64' : ''} flex flex-col min-h-screen transition-all`}>
        {user && (
          <Header onMenuClick={() => setDrawerOpen(true)} />
        )}
        <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-8 overflow-x-hidden">
          <div className="w-full min-w-0">
            <Switch>
              <Route path="/auth" component={AuthPage} />
              <Route path="/reset-password" component={ResetPassword} />
              
              <Route path="/">
                <ProtectedRoute component={Home} path="/" role="admin" />
              </Route>
              <Route path="/sales">
                <ProtectedRoute component={Sales} path="/sales" />
              </Route>
              <Route path="/stock">
                <ProtectedRoute component={Stock} path="/stock" role="admin" />
              </Route>
              <Route path="/inventory">
                <ProtectedRoute component={Inventory} path="/inventory" />
              </Route>
              <Route path="/expenses">
                <ProtectedRoute component={Expenses} path="/expenses" />
              </Route>
              <Route path="/reports">
                <ProtectedRoute component={Reports} path="/reports" role="admin" />
              </Route>
              
              <Route path="/credits" component={() => <div className="p-12 text-center text-muted-foreground">Credits Module Coming Soon</div>} />
              <Route path="/calendar" component={() => <div className="p-12 text-center text-muted-foreground">Calendar Module Coming Soon</div>} />
              
              <Route path="/about">
                <ProtectedRoute component={AboutUs} path="/about" />
              </Route>
              <Route path="/contact">
                <ProtectedRoute component={ContactUs} path="/contact" />
              </Route>
              
              <Route component={NotFound} />
            </Switch>
          </div>
        </main>
        <footer className="border-t py-3 px-8 text-center text-sm text-muted-foreground" data-testid="footer-copyright">
          <p>&copy; {new Date().getFullYear()} BRR IT Solutions . All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Toaster />
            <Router />
          </WouterRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
