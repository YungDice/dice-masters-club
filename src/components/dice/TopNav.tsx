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
  Search,
} from "lucide-react";
import { useState, type FormEvent } from "react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  {
    kind: "group", label: "Ranks", icon: BarChart3,
    children: [
      { to: "/leaderboard", label: "Players", icon: BarChart3 },
      { to: "/leaderboard/crews", label: "Crews", icon: Shield },
    ],
  },
];

function SideRailItem({
  active,
  label,
  children,
}: {
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative">
          {active && (
            <motion.span
              layoutId="rail-active"
              className="absolute -left-2 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary shadow-[0_0_12px_rgba(232,93,58,0.7)]"
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            />
          )}
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
    </Tooltip>
  );
}

function Sidebar({ isStaff }: { isStaff: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");
  const groupActive = (g: Group) => g.children.some((c) => isActive(c.to));

  const iconBtn =
    "grid size-11 place-items-center rounded-xl text-muted-foreground hover:text-amber-100 hover:bg-white/[0.06] transition-colors";
  const activeCls =
    "text-amber-100 bg-gradient-to-br from-primary/25 to-amber-400/10 ring-1 ring-amber-400/40 shadow-[0_0_20px_-6px_rgba(232,93,58,0.5)]";

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        className="hidden md:flex fixed inset-y-0 left-0 z-40 w-16 flex-col items-center gap-1 py-3 bg-background/85 backdrop-blur-xl"
        style={{ borderRight: "1px solid rgba(201,168,76,0.14)" }}
      >
        <Link to="/" className="mb-2 grid place-items-center">
          <DiceLogo size={36} />
        </Link>
        <div className="flex-1 flex flex-col items-center gap-1.5 py-2">
          {nav.map((it) => {
            if (it.kind === "leaf") {
              const active = isActive(it.to, it.exact);
              return (
                <SideRailItem key={it.to} active={active} label={it.label}>
                  <Link to={it.to} className={`${iconBtn} ${active ? activeCls : ""}`} aria-label={it.label}>
                    <it.icon className="size-5" />
                  </Link>
                </SideRailItem>
              );
            }
            const active = groupActive(it);
            return (
              <DropdownMenu key={it.label}>
                <SideRailItem active={active} label={it.label}>
                  <DropdownMenuTrigger asChild>
                    <button className={`${iconBtn} ${active ? activeCls : ""}`} aria-label={`${it.label} menu`}>
                      <it.icon className="size-5" />
                    </button>
                  </DropdownMenuTrigger>
                </SideRailItem>
                <DropdownMenuContent side="right" align="start" sideOffset={12} className="min-w-44">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-amber-200/70">
                    {it.label}
                  </DropdownMenuLabel>
                  {it.children.map((c) => (
                    <DropdownMenuItem key={c.to} asChild>
                      <Link to={c.to}><c.icon className="mr-2 size-4" /> {c.label}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </div>
        {isStaff && (
          <SideRailItem active={isActive("/admin")} label="Admin">
            <Link to="/admin" className={`${iconBtn} text-neon hover:text-neon ${isActive("/admin") ? "ring-1 ring-neon/60 bg-neon/10" : ""}`} aria-label="Admin">
              <Shield className="size-5" />
            </Link>
          </SideRailItem>
        )}
      </aside>
    </TooltipProvider>
  );
}

function MobileMenu({ isStaff }: { isStaff: boolean }) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="grid size-9 place-items-center rounded-md hover:bg-white/5 md:hidden" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 flex flex-col p-0">
        <SheetHeader className="p-6 pb-2 shrink-0"><SheetTitle>Menu</SheetTitle></SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-6 pt-2 space-y-4">
          {nav.map((it) => {
            if (it.kind === "leaf") {
              return (
                <Link key={it.to} to={it.to} onClick={() => setOpen(false)}
                  className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm ${
                    isActive(it.to, it.exact) ? "bg-amber-400/15 text-amber-100" : "hover:bg-white/5"
                  }`}>
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
                    <Link key={c.to} to={c.to} onClick={() => setOpen(false)}
                      className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm ${
                        isActive(c.to) ? "bg-amber-400/15 text-amber-100" : "hover:bg-white/5"
                      }`}>
                      <c.icon className="size-4" /> {c.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
          {isStaff && (
            <Link to="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-neon hover:bg-neon/10">
              <Shield className="size-4" /> Admin
            </Link>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function TopNav() {
  const { user } = useAuth();
  const { data: wallet } = useWallet(user?.id);
  const { data: roles } = useMyRoles(user?.id);
  const { data: profile } = useMyProfile(user?.id);
  const isStaff = !!roles?.some((r) => r === "owner" || r === "admin" || r === "moderator");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  useIdleXp();

  const initials =
    profile?.display_name?.[0]?.toUpperCase() ??
    profile?.username?.[0]?.toUpperCase() ??
    user?.email?.[0]?.toUpperCase() ??
    "?";

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true, search: {} });
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate({ to: "/marketplace", search: { q } as any });
  }

  return (
    <>
      <Sidebar isStaff={isStaff} />
      <header
        className="sticky top-0 z-30 backdrop-blur-xl bg-background/75 md:pl-16"
        style={{ borderBottom: "1px solid rgba(201,168,76,0.14)" }}
      >
        <div className="flex h-14 items-center gap-2 sm:gap-3 px-3 sm:px-5">
          <MobileMenu isStaff={isStaff} />
          <Link to="/" className="md:hidden flex items-center shrink-0">
            <DiceLogo size={30} />
          </Link>

          <form onSubmit={onSearch} className="flex-1 max-w-xl">
            <label className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search marketplace, players, challenges…"
                aria-label="Search"
                className="w-full h-9 rounded-full bg-white/[0.04] pl-9 pr-4 text-sm outline-none ring-1 ring-white/10 focus:ring-amber-400/40 placeholder:text-muted-foreground/70 transition"
              />
            </label>
          </form>

          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <div className="hidden sm:block"><DiceBadge amount={wallet?.balance ?? 0} /></div>
            <ChatPopover />
            <NotificationsPopover />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label="Open account menu" className="flex items-center gap-2 rounded-full pl-1 pr-2 sm:pr-3 py-1 hover:bg-white/5 transition shrink-0">
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
          </div>
        </div>
      </header>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  if (!loading && !user) {
    navigate({ to: "/auth", search: {} });
    return null;
  }
  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="md:pl-16">
        <div className="mx-auto max-w-7xl px-4 md:px-6 py-6">{children}</div>
      </main>
    </div>
  );
}

export function _useButton() { return Button; }
