import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Home,
  Trophy,
  Gamepad2,
  ShoppingBag,
  Users,
  BarChart3,
  User as UserIcon,
  Shield,
  LogOut,
  Menu,
  Images,
  Music2,
  Sparkles,
  Settings as SettingsIcon,
  Crown,
  ArrowLeftRight,
} from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { DiceLogo } from "./Logo";
import { DiceBadge } from "./DiceBadge";
import { ChatPopover } from "./ChatPopover";
import { NotificationsPopover } from "./NotificationsPopover";
import { useAuth } from "@/hooks/use-auth";
import { useWallet, useMyRoles, useMyProfile } from "@/hooks/use-profile";
import { useIdleXp } from "@/hooks/use-idle-xp";
import { handle } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = { to: string; label: string; icon: typeof Home; exact?: boolean; group: "main" | "social" | "market" };

const items: NavItem[] = [
  { to: "/", label: "Home", icon: Home, exact: true, group: "main" },
  { to: "/play", label: "Play", icon: Gamepad2, group: "main" },
  { to: "/challenges", label: "Challenges", icon: Trophy, group: "main" },
  { to: "/club", label: "Club", icon: Crown, group: "main" },
  { to: "/marketplace", label: "Market", icon: ShoppingBag, group: "market" },
  { to: "/baddies", label: "Baddies", icon: Sparkles, group: "market" },
  { to: "/upgrader", label: "Upgrader", icon: Sparkles, group: "market" },
  { to: "/trades", label: "Trades", icon: ArrowLeftRight, group: "market" },
  { to: "/dikdok", label: "DikDok", icon: Music2, group: "social" },
  { to: "/gallery", label: "Gallery", icon: Images, group: "social" },
  { to: "/friends", label: "Friends", icon: Users, group: "social" },
  { to: "/leaderboard", label: "Ranks", icon: BarChart3, group: "main" },
];

export function TopNav() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const { data: roles } = useMyRoles(user?.id);
  const { data: profile } = useMyProfile(user?.id);
  const navigate = useNavigate();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const isStaff = roles?.some((role) => role === "owner" || role === "admin" || role === "moderator");

  useIdleXp();

  const initials = profile?.display_name?.[0]?.toUpperCase()
    ?? profile?.username?.[0]?.toUpperCase()
    ?? user?.email?.[0]?.toUpperCase()
    ?? "?";
  const isActive = (to: string, exact?: boolean) => exact ? path === to : path === to || path.startsWith(`${to}/`);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const navigation = (mobile = false) => items.map((item) => {
    const active = isActive(item.to, item.exact);
    const Icon = item.icon;
    return (
      <Link
        key={item.to}
        to={item.to as any}
        onClick={() => mobile && setMobileOpen(false)}
        className={mobile
          ? `flex items-center gap-2 rounded-md px-2 py-2 text-sm ${active ? "bg-amber-400/15 text-amber-100" : "hover:bg-white/5"}`
          : `relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${active ? "text-amber-100" : "text-muted-foreground hover:text-foreground"}`}
      >
        {!mobile && active && <motion.span layoutId="nav-active-pill" className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(135deg, rgba(201,168,76,0.22), rgba(201,168,76,0.08))", border: "1px solid rgba(201,168,76,0.45)" }} transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
        <span className="relative inline-flex items-center gap-1.5"><Icon className="size-3.5" />{item.label}</span>
      </Link>
    );
  });

  return (
    <header className="sticky top-0 z-40 border-b border-amber-300/15 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto grid h-14 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-3 px-4">
        <Link to="/" className="flex shrink-0"><DiceLogo /></Link>
        <nav className="hidden min-w-0 justify-center overflow-x-auto md:flex">
          <div className="flex items-center gap-0.5 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/5">{navigation()}</div>
        </nav>
        <div className="flex items-center justify-end gap-1.5">
          <div className="hidden sm:block"><DiceBadge amount={wallet?.balance ?? 0} /></div>
          <ChatPopover />
          <NotificationsPopover />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-white/5 sm:pr-3">
                <Avatar className="size-8 ring-1 ring-amber-400/40"><AvatarImage src={profile?.avatar_url ?? undefined} /><AvatarFallback>{initials}</AvatarFallback></Avatar>
                <span className="hidden max-w-[120px] truncate text-sm font-medium lg:inline">{profile?.display_name ?? profile?.username ?? "Account"}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="truncate"><div className="font-semibold truncate">{profile?.display_name ?? "Account"}{profile?.tag && <span className="font-mono text-primary">#{profile.tag}</span>}</div><div className="truncate font-mono text-xs text-muted-foreground">{profile ? handle(profile) : (user?.email ?? "")}</div></DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 sm:hidden"><DiceBadge amount={wallet?.balance ?? 0} /></div>
              <DropdownMenuSeparator className="sm:hidden" />
              <DropdownMenuItem asChild><Link to="/profile"><UserIcon className="mr-2 size-4" />Profile</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/settings"><SettingsIcon className="mr-2 size-4" />Settings</Link></DropdownMenuItem>
              {isStaff && <DropdownMenuItem asChild><Link to="/admin"><Shield className="mr-2 size-4" />Admin</Link></DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive"><LogOut className="mr-2 size-4" />Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild><button className="grid size-9 place-items-center rounded-md hover:bg-white/5 md:hidden" aria-label="Open menu"><Menu className="size-5" /></button></SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader><SheetTitle>Menu</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-5">
                {(["main", "social", "market"] as const).map((group) => <div key={group}><div className="mb-1.5 text-[10px] uppercase tracking-widest text-amber-200/60">{group === "main" ? "Play" : group === "social" ? "Social" : "Market"}</div><div className="space-y-0.5">{items.filter((item) => item.group === group).map((item) => {
                  const Icon = item.icon;
                  return <Link key={item.to} to={item.to as any} onClick={() => setMobileOpen(false)} className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm ${isActive(item.to, item.exact) ? "bg-amber-400/15 text-amber-100" : "hover:bg-white/5"}`}><Icon className="size-4" />{item.label}</Link>;
                })}</div></div>)}
                {isStaff && <Link to="/admin" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-neon hover:bg-neon/10"><Shield className="size-4" />Admin</Link>}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
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
  return <div className="min-h-screen"><TopNav /><main className="mx-auto max-w-7xl px-4 py-6">{children}</main></div>;
}

export function _useButton() { return Button; }
