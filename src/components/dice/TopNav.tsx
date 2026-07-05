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
  ArrowLeftRight,
  Target,
  Settings as SettingsIcon,
  Palette,
  Crown,
  ChevronDown,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useFx } from "@/lib/fx";

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

type Leaf = { to: string; label: string; icon: typeof Home; exact?: boolean };
type Group = { label: string; icon: typeof Home; children: Leaf[] };
type Entry = ({ kind: "leaf" } & Leaf) | ({ kind: "group" } & Group);

const nav: Entry[] = [
  { kind: "leaf", to: "/", label: "Home", icon: Home, exact: true },
  { kind: "leaf", to: "/play", label: "Play", icon: Gamepad2 },
  { kind: "leaf", to: "/season-pass", label: "Season", icon: Crown },
  {
    kind: "group", label: "Missions", icon: Target,
    children: [
      { to: "/missions", label: "Missions", icon: Target },
      { to: "/challenges", label: "Challenges", icon: Trophy },
    ],
  },
  {
    kind: "group", label: "Market", icon: ShoppingBag,
    children: [
      { to: "/marketplace", label: "Market", icon: ShoppingBag },
      { to: "/cosmetics", label: "Cosmetics", icon: Palette },
    ],
  },
  {
    kind: "group", label: "Baddies", icon: Sparkles,
    children: [
      { to: "/baddies", label: "Baddies", icon: Sparkles },
      { to: "/upgrader", label: "Upgrader", icon: Sparkles },
      { to: "/trades", label: "Trades", icon: ArrowLeftRight },
    ],
  },
  {
    kind: "group", label: "DikDok", icon: Music2,
    children: [
      { to: "/dikdok", label: "DikDok", icon: Music2 },
      { to: "/gallery", label: "Gallery", icon: Images },
    ],
  },
  {
    kind: "group", label: "Social", icon: Users,
    children: [
      { to: "/friends", label: "Friends", icon: Users },
      { to: "/crews", label: "Crews", icon: Shield },
    ],
  },
  { kind: "leaf", to: "/leaderboard", label: "Ranks", icon: BarChart3 },
];

export function TopNav() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const { data: roles } = useMyRoles(user?.id);
  const { data: profile } = useMyProfile(user?.id);
  const isStaff = roles?.some((r) => r === "owner" || r === "admin" || r === "moderator");
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  useIdleXp();

  const initials =
    profile?.display_name?.[0]?.toUpperCase() ??
    profile?.username?.[0]?.toUpperCase() ??
    user?.email?.[0]?.toUpperCase() ??
    "?";

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");
  const groupActive = (g: Group) => g.children.some((c) => isActive(c.to));

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl bg-background/70"
      style={{ borderBottom: "1px solid rgba(201,168,76,0.18)" }}
    >
      <div className="mx-auto grid h-14 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-3 px-4">
        <Link to="/" className="flex items-center shrink-0">
          <DiceLogo />
        </Link>

        <nav className="hidden md:flex justify-center">
          <div className="flex items-center gap-0.5 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/5">
            {nav.map((it) => {
              if (it.kind === "leaf") {
                const active = isActive(it.to, it.exact);
                return (
                  <Link
                    key={it.to}
                    to={it.to}
                    className={`relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      active ? "text-amber-100" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-active-pill"
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: "linear-gradient(135deg, rgba(201,168,76,0.22), rgba(201,168,76,0.08))",
                          border: "1px solid rgba(201,168,76,0.45)",
                        }}
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span className="relative inline-flex items-center gap-1.5">
                      <it.icon className="size-3.5" /> {it.label}
                    </span>
                  </Link>
                );
              }
              const active = groupActive(it);
              return (
                <DropdownMenu key={it.label}>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={`relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors outline-none ${
                        active ? "text-amber-100" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="nav-active-pill"
                          className="absolute inset-0 rounded-full"
                          style={{
                            background: "linear-gradient(135deg, rgba(201,168,76,0.22), rgba(201,168,76,0.08))",
                            border: "1px solid rgba(201,168,76,0.45)",
                          }}
                          transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        />
                      )}
                      <span className="relative inline-flex items-center gap-1">
                        <it.icon className="size-3.5" /> {it.label}
                        <ChevronDown className="size-3 opacity-70" />
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="min-w-40">
                    {it.children.map((c) => (
                      <DropdownMenuItem key={c.to} asChild>
                        <Link to={c.to}>
                          <c.icon className="mr-2 size-4" /> {c.label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
            {isStaff && (
              <Link
                to="/admin"
                className={`relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive("/admin") ? "text-neon" : "text-neon/80 hover:text-neon"
                }`}
              >
                <Shield className="size-3.5" /> Admin
              </Link>
            )}
          </div>
        </nav>

        <div className="flex items-center gap-1.5 justify-end">
          <div className="hidden sm:block"><DiceBadge amount={wallet?.balance ?? 0} /></div>
          <SoundToggle />
          <ChatPopover />
          <NotificationsPopover />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full pl-1 pr-2 sm:pr-3 py-1 hover:bg-white/5 transition shrink-0">
                <Avatar className="size-8 ring-1 ring-amber-400/40">
                  <AvatarImage src={profile?.avatar_url ?? undefined} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden lg:inline text-sm font-medium max-w-[120px] truncate">
                  {profile?.display_name ?? profile?.username ?? "Account"}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="truncate">
                <div className="font-semibold truncate">
                  {profile?.display_name ?? "Account"}
                  {profile?.tag && <span className="text-primary font-mono">#{profile.tag}</span>}
                </div>
                <div className="text-xs text-muted-foreground font-mono truncate">
                  {profile ? handle(profile) : (user?.email ?? "")}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 sm:hidden">
                <DiceBadge amount={wallet?.balance ?? 0} />
              </div>
              <DropdownMenuSeparator className="sm:hidden" />
              <DropdownMenuItem asChild><Link to="/profile"><UserIcon className="mr-2 size-4" />Profile</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/settings"><SettingsIcon className="mr-2 size-4" />Settings</Link></DropdownMenuItem>
              {isStaff && <DropdownMenuItem asChild><Link to="/admin"><Shield className="mr-2 size-4" />Admin</Link></DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive">
                <LogOut className="mr-2 size-4" />Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className="grid size-9 place-items-center rounded-md hover:bg-white/5 md:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader><SheetTitle>Menu</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-4">
                {nav.map((it) => {
                  if (it.kind === "leaf") {
                    return (
                      <Link
                        key={it.to}
                        to={it.to}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm ${
                          isActive(it.to, it.exact) ? "bg-amber-400/15 text-amber-100" : "hover:bg-white/5"
                        }`}
                      >
                        <it.icon className="size-4" /> {it.label}
                      </Link>
                    );
                  }
                  return (
                    <div key={it.label}>
                      <div className="text-[10px] uppercase tracking-widest text-amber-200/60 mb-1.5 flex items-center gap-1.5">
                        <it.icon className="size-3" /> {it.label}
                      </div>
                      <div className="space-y-0.5">
                        {it.children.map((c) => (
                          <Link
                            key={c.to}
                            to={c.to}
                            onClick={() => setMobileOpen(false)}
                            className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm ${
                              isActive(c.to) ? "bg-amber-400/15 text-amber-100" : "hover:bg-white/5"
                            }`}
                          >
                            <c.icon className="size-4" /> {c.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {isStaff && (
                  <Link to="/admin" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-neon hover:bg-neon/10">
                    <Shield className="size-4" /> Admin
                  </Link>
                )}
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
  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

export function _useButton() { return Button; }

function SoundToggle() {
  const { enabled, toggleSound } = useFx();
  return (
    <button
      onClick={toggleSound}
      aria-label={enabled ? "Mute sound" : "Enable sound"}
      title={enabled ? "Sound on" : "Sound off"}
      className="grid size-9 place-items-center rounded-md hover:bg-white/5 text-muted-foreground hover:text-amber-200 transition"
    >
      {enabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
    </button>
  );
}

