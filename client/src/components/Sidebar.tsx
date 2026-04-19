import brrLogo from "@assets/brr_solution_logo_1776622112650.jpeg";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  ShoppingCart, 
  FileText, 
  Package, 
  BarChart3, 
  CreditCard, 
  Calendar,
  Receipt,
  LogOut,
  Phone,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: LayoutDashboard, role: "admin" },
  { label: "Sales", href: "/sales", icon: ShoppingCart },
  { label: "Inventory", href: "/inventory", icon: FileText },
  { label: "Stock", href: "/stock", icon: Package, role: "admin" },
  { label: "Expenses", href: "/expenses", icon: Receipt },
  { label: "Reports", href: "/reports", icon: BarChart3, role: "admin" },
  { label: "Credits", href: "/credits", icon: CreditCard, role: "admin" },
  { label: "Calendar", href: "/calendar", icon: Calendar, role: "admin" },
  { label: "About Us", href: "/about", icon: Info },
  { label: "Contact Us", href: "/contact", icon: Phone },
];

export function Sidebar() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();

  const filteredNavItems = NAV_ITEMS.filter(item => 
    !item.role || (user && user.role === item.role)
  );

  return (
    <div className="hidden md:flex flex-col w-64 h-screen bg-card border-r border-border fixed left-0 top-0 z-50 shadow-xl shadow-black/5 select-none">
      <div className="p-6 flex items-center gap-3">
        <img src={brrLogo} alt="BRR IT Solutions" className="w-10 h-10 object-contain rounded-lg" />
        <div>
          <h1 className="font-display font-bold text-lg text-foreground leading-none">BRR Liquor Soft</h1>
          <p className="text-xs text-muted-foreground font-medium mt-1">{user?.role === 'admin' ? 'Admin' : 'Employee'} Portal</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
        {filteredNavItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div 
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer group",
                  isActive 
                    ? "bg-primary/10 text-primary shadow-sm" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className={cn(
                  "w-5 h-5 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )} />
                <span className="font-medium text-sm">{item.label}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="p-4 mt-auto border-t border-border/50">
        <div className="px-4 py-3 mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</p>
          <p className="text-sm font-medium truncate">{user?.username}</p>
        </div>
        <button 
          onClick={() => logoutMutation.mutate()}
          className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium text-sm">Logout</span>
        </button>
      </div>
    </div>
  );
}
