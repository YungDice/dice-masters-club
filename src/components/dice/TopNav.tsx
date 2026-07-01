import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowUpCircle,
  BarChart3,
  BookOpen,
  Castle,
  ChevronDown,
  Crown,
  Gamepad2,
  Gem,
  Gift,
  Home,
  Images,
  LogOut,
  Menu,
  Music2,
  Settings as SettingsIcon,
  Shield,
  ShoppingBag,
  Sparkles,
  Swords,
  Target,
  Ticket,
  Trophy,
  User as UserIcon,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DiceLogo } from "./Logo";
import { DiceBadge } from "./DiceBadge";
import { ChatPopover } from "./ChatPopover";
import { NotificationsPopover } from "./NotificationsPopover";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile, useMyRoles, useWallet } from "@/hooks/use-profile";
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

type NavLink = {
  to: string;
  label: string;
  icon: typeof Home;
  exact?: boolean;
  hash?: string;
};

type MenuLink = NavLink & { description: string };

const primaryBeforeClub: NavLink[] = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/play", label: "Play", icon: Gamepad2 },
  { to: "/club", hash: "game-pass", label: "Game Pass", icon: Ticket },
  { to: "/challenges", label: "Challenges", icon: Trophy },
];

const primaryAfterClub: NavLink[] = [
  { to: "/marketplace", label: "Marketplace", icon: ShoppingBag },
];

const primaryAfterBaddies: NavLink[] = [
  { to: "/upgrader", label: "Upgrader", icon: ArrowUpCircle },
  { to: "/dikdok", label: "DikDok", icon: Music2 },
  { to: "/gallery", label: "Gallery", icon: Images },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/leaderboard", label: "Ranks", icon: BarChart3 },
];

const clubLinks: MenuLink[] = [
  { to: "/club", label: "Club Home", description: "Progress, rewards and social activity", icon: Crown },
  { to: "/club", hash: "crews", label: "Create or Join a Club", description: "Build your crew and share invite codes", icon: Users },
  { to: "/club", hash: "missions", label: "Club Missions", description: "Daily goals, streaks and achievements", icon: Target },
  { to: "/club", hash: "game-pass", label: "Game Pass", description: "Season XP, rewards and cosmetics", icon: Gift },
  { to: "/club", hash: "events", label: "Events", description: "Tournaments and the Risk Room", icon: Trophy },
];

const baddieLinks: MenuLink[] = [
  { to: "/baddies", label: "My Baddies", description: "View and collect from your roster", icon: Sparkles },
  { to: "/club", hash: "baddie-base", label: "Baddie Base", description: "Place and protect active Baddies", icon: Castle },
  { to: "/trades", label: "Trade", description: "Secure Baddie-for-Baddie trades", icon: Swords },
  { to: "/club", hash: "fusion", label: "Fusion", description: "Create Prestige Baddies from duplicates", icon: Gem },
  { to: "/club", hash: "collection", label: "Collection Book", description: "Traits, variants and completion progress", icon: BookOpen },
];

function navPillClass(active: boolean) {
  return `relative inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-semibold transition-colors ${
    active
      ? "text-amber-100"
      : "text-muted-foreground hover:bg-white/[0.055] hover:text-foreground"
  }`;
}

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
  const clubActive = path === "/club" || path.startsWith("/club") || path === "/spectate";
  const baddiesActive = path === "/baddies" || path.startsWith("/baddies") || path === "/trades";

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const DesktopLink = ({ item }: { item: NavLink }) => {
    const Icon = item.icon;
    const active = isActive(item.to, item.exact) && !item.hash;
    return (
      <Link to={item.to as any} hash={item.hash} className={navPillClass(active)}>
        {active && <motion.span layoutId="nav-active-pill" className="absolute inset-0 rounded-lg border border-amber-300/35 bg-[linear-gradient(135deg,rgba(201,168,76,0.22),rgba(201,168,76,0.06))]" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
        <span className="relative inline-flex items-center gap-1.5"><Icon className="size-3.5" />{item.label}</span>
      </Link>
    );
  };

  const FeatureMenu = ({ label, icon: Icon, active, links }: { label: string; icon: typeof Home; active: boolean; links: MenuLink[] }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={navPillClass(active)}>
          {active && <motion.span layoutId="nav-active-pill" className="absolute inset-0 rounded-lg border border-amber-300/35 bg-[linear-gradient(135deg,rgba(201,168,76,0.22),rgba(201,168,76,0.06))]" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
          <span className="relative inline-flex items-center gap-1.5"><Icon className="size-3.5" />{label}<ChevronDown className="size-3 opacity-70" /></span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={9} className="w-72 border-amber-300/15 bg-[#131317]/98 p-1.5 shadow-2xl backdrop-blur-xl">
        <DropdownMenuLabel className="px-2.5 pb-2 pt-1.5 text-[10px] uppercase tracking-[0.16em] text-amber-200/70">{label}</DropdownMenuLabel>
        {links.map((item) => {
          const MenuIcon = item.icon;
          return (
            <DropdownMenuItem key={`${item.to}-${item.hash ?? item.label}`} asChild className="cursor-pointer rounded-lg p-0 focus:bg-white/[0.06]">
              <Link to={item.to as any} hash={item.hash} className="flex items-start gap-2.5 px-2.5 py-2.5">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-amber-300/15 bg-amber-300/[0.07] text-amber-200"><MenuIcon className="size-3.5" /></span>
                <span className="min-w-0"><span className="block text-sm font-semibold text-foreground">{item.label}</span><span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{item.description}</span></span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const MobileLink = ({ item }: { item: NavLink }) => {
    const Icon = item.icon;
    const active = isActive(item.to, item.exact) && !item.hash;
    return <Link to={item.to as any} hash={item.hash} onClick={() => setMobileOpen(false)} className={`flex items-center gap-2 rounded-lg px-2.5 py-2.5 text-sm font-medium ${active ? "bg-amber-300/15 text-amber-100" : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"}`}><Icon className="size-4" />{item.label}</Link>;
  };

  const MobileFeatureList = ({ label, icon: Icon, links }: { label: string; icon: typeof Home; links: MenuLink[] }) => (
    <section>
      <div className="mb-1.5 flex items-center gap-2 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-amber-200/70"><Icon className="size-3.5" />{label}</div>
      <div className="space-y-0.5 rounded-xl border border-white/[0.06] bg-black/15 p-1">
        {links.map((item) => {
          const MenuIcon = item.icon;
          return <Link key={`${item.to}-${item.hash ?? item.label}`} to={item.to as any} hash={item.hash} onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 hover:bg-white/[0.05]"><span className="grid size-7 place-items-center rounded-md bg-amber-300/[0.08] text-amber-200"><MenuIcon className="size-3.5" /></span><span><span className="block text-sm font-semibold">{item.label}</span><span className="block text-[11px] text-muted-foreground">{item.description}</span></span></Link>;
        })}
      </div>
    </section>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-amber-300/15 bg-background/85 shadow-[0_10px_28px_-22px_rgba(0,0,0,0.9)] backdrop-blur-xl">
      <div className="mx-auto grid h-16 max-w-[1720px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 sm:px-4">
        <Link to="/" className="flex shrink-0"><DiceLogo /></Link>

        <nav aria-label="Primary navigation" className="hidden min-w-0 overflow-x-auto lg:block">
          <div className="flex min-w-max items-center justify-center gap-0.5 rounded-xl border border-white/[0.055] bg-white/[0.025] p-1">
            {primaryBeforeClub.map((item) => <DesktopLink key={item.label} item={item} />)}
            <span className="mx-0.5 h-5 w-px bg-white/[0.075]" />
            <FeatureMenu label="Club" icon={Crown} active={clubActive} links={clubLinks} />
            {primaryAfterClub.map((item) => <DesktopLink key={item.label} item={item} />)}
            <FeatureMenu label="Baddies" icon={Sparkles} active={baddiesActive} links={baddieLinks} />
            <span className="mx-0.5 h-5 w-px bg-white/[0.075]" />
            {primaryAfterBaddies.map((item) => <DesktopLink key={item.label} item={item} />)}
            {isStaff && <><span className="mx-0.5 h-5 w-px bg-white/[0.075]" /><Link to="/admin" className={navPillClass(isActive("/admin"))}><Shield className="size-3.5" />Admin</Link></>}
          </div>
        </nav>

        <div className="flex items-center justify-end gap-1.5">
          <div className="hidden sm:block"><DiceBadge amount={wallet?.balance ?? 0} /></div>
          <ChatPopover />
          <NotificationsPopover />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-white/5 sm:pr-3">
                <Avatar className="size-8 ring-1 ring-amber-400/40"><AvatarImage src={profile?.avatar_url ?? undefined} /><AvatarFallback>{initials}</AvatarFallback></Avatar>
                <span className="hidden max-w-[120px] truncate text-sm font-medium xl:inline">{profile?.display_name ?? profile?.username ?? "Account"}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="truncate"><div className="truncate font-semibold">{profile?.display_name ?? "Account"}{profile?.tag && <span className="font-mono text-primary">#{profile.tag}</span>}</div><div className="truncate font-mono text-xs text-muted-foreground">{profile ? handle(profile) : (user?.email ?? "")}</div></DropdownMenuLabel>
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
            <SheetTrigger asChild><button className="grid size-9 place-items-center rounded-lg hover:bg-white/5 lg:hidden" aria-label="Open menu"><Menu className="size-5" /></button></SheetTrigger>
            <SheetContent side="right" className="w-[22rem] max-w-[92vw] overflow-y-auto border-white/[0.08] bg-[#111114]">
              <SheetHeader><SheetTitle className="font-display text-xl">Navigation</SheetTitle></SheetHeader>
              <div className="mt-5 space-y-5">
                <section>
                  <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-amber-200/70">Explore</div>
                  <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.06] bg-black/15 p-1">
                    {[...primaryBeforeClub, ...primaryAfterClub, ...primaryAfterBaddies].map((item) => <MobileLink key={item.label} item={item} />)}
                  </div>
                </section>
                <MobileFeatureList label="Club" icon={Crown} links={clubLinks} />
                <MobileFeatureList label="Baddies" icon={Sparkles} links={baddieLinks} />
                {isStaff && <section><div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-amber-200/70">Staff</div><Link to="/admin" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-xl border border-neon/20 bg-neon/[0.05] px-3 py-2.5 text-sm font-semibold text-neon"><Shield className="size-4" />Admin</Link></section>}
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
