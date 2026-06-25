import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Home,
  Trophy,
  Gamepad2,
  ShoppingBag,
  Users,
  BarChart3,
  Bell,
  User as UserIcon,
  Shield,
  LogOut,
  Menu,
  Images,
  Music2,
} from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DiceLogo } from "./Logo";
import { DiceBadge } from "./DiceBadge";
import { useAuth } from "@/hooks/use-auth";
import { useWallet, useMyRoles } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const items = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/challenges", label: "Challenges", icon: Trophy },
  { to: "/play", label: "Play", icon: Gamepad2 },
  { to: "/gallery", label: "Gallery", icon: Images },
  { to: "/dikdok", label: "DikDok", icon: Music2 },
  { to: "/marketplace", label: "Market", icon: ShoppingBag },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/leaderboard", label: "Ranks", icon: BarChart3 },
] as const;


export function TopNav() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const { data: roles } = useMyRoles(user?.id);
  const isStaff = roles?.some((r) => r === "admin" || r === "moderator");
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const initials =
    user?.user_metadata?.display_name?.[0]?.toUpperCase() ??
    user?.email?.[0]?.toUpperCase() ??
    "?";

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");

  return (
    <header className="sticky top-0 z-40 glass border-b border-border/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <Link to="/" className="flex items-center">
          <DiceLogo />
        </Link>
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {items.map((it) => {
            const active = isActive(it.to, "exact" in it ? it.exact : false);
            return (
              <Link
                key={it.to}
                to={it.to}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <it.icon className="size-4" /> {it.label}
              </Link>
            );
          })}
          {isStaff && (
            <Link
              to="/admin"
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                isActive("/admin")
                  ? "bg-neon/20 text-neon"
                  : "text-neon/80 hover:bg-neon/10"
              }`}
            >
              <Shield className="size-4" /> Admin
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {wallet && <DiceBadge amount={wallet.balance} />}
          <Link to="/notifications" className="grid size-9 place-items-center rounded-md hover:bg-white/5">
            <Bell className="size-4" />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="grid size-9 place-items-center">
                <Avatar className="size-8 ring-1 ring-border">
                  <AvatarImage src={user?.user_metadata?.avatar_url} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>{user?.email ?? "Account"}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link to="/profile"><UserIcon className="mr-2 size-4" />Profile</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/settings">Settings</Link></DropdownMenuItem>
              {isStaff && <DropdownMenuItem asChild><Link to="/admin"><Shield className="mr-2 size-4" />Admin</Link></DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive">
                <LogOut className="mr-2 size-4" />Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            className="grid size-9 place-items-center rounded-md hover:bg-white/5 md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </div>
      {open && (
        <nav className="md:hidden border-t border-border/60 px-4 py-2 grid grid-cols-2 gap-1">
          {items.map((it) => (
            <Link
              key={it.to}
              to={it.to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-white/5"
            >
              <it.icon className="size-4" /> {it.label}
            </Link>
          ))}
          {isStaff && (
            <Link to="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-neon hover:bg-neon/10">
              <Shield className="size-4" /> Admin
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  if (!loading && !user) {
    navigate({ to: "/auth" });
    return null;
  }
  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 pt-4 text-xs text-muted-foreground">
        DICE is a virtual-currency platform. DICE has no real-world or monetary value
        and cannot be purchased, exchanged, or cashed out. Play responsibly. 18+.
        <Link to="/settings" className="ml-2 underline">Take a break</Link>
      </footer>
    </div>
  );
}

export function _useButton() { return Button; }
