import { useEffect, useState } from "react";
import { useNavigate, createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Dices, Sparkles, Trophy, Gamepad2, ShoppingBag, Users, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DiceLogo } from "@/components/dice/Logo";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — DICE" },
      { name: "description", content: "Sign in to DICE. Complete challenges, earn virtual DICE, play games, build your reputation. 18+ only." },
    ],
  }),
  component: AuthPage,
});

// Only allow same-origin relative paths as return targets.
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const target = safeNext(next);
  useEffect(() => {
    if (!loading && user) {
      if (target === "/") navigate({ to: "/" });
      else window.location.href = target;
    }
  }, [user, loading, navigate, target]);

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between p-10 relative overflow-hidden border-r border-border/60">
        <div className="absolute inset-0 felt-bg opacity-30" />
        <div className="relative">
          <DiceLogo size={32} />
        </div>
        <div className="relative space-y-6">
          <motion.h1
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            className="font-display text-5xl font-bold leading-tight"
          >
            Complete challenges.<br />
            Earn <span className="text-gradient-red">DICE</span>.<br />
            Play games. Build reputation.
          </motion.h1>
          <p className="text-muted-foreground max-w-md">
            DICE is a virtual-currency social gaming platform. DICE has no real-world
            value and cannot be purchased or cashed out.
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2"><Trophy className="size-4 text-primary" /> Daily challenges & camera proof</li>
            <li className="flex items-center gap-2"><Gamepad2 className="size-4 text-primary" /> Dice, Coin Flip, Blackjack, Slots & more</li>
            <li className="flex items-center gap-2"><ShoppingBag className="size-4 text-primary" /> Marketplace for digital creations</li>
            <li className="flex items-center gap-2"><Users className="size-4 text-primary" /> Friends, leaderboards, achievements</li>
            <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> Responsible-play warnings · 18+</li>
          </ul>
        </div>
        <div className="relative text-xs text-muted-foreground">© DICE — Virtual play only</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-6 glass">
          <div className="md:hidden mb-4"><DiceLogo /></div>
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin"><SignInForm /></TabsContent>
            <TabsContent value="signup"><SignUpForm /></TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const target = safeNext(next);
  function goNext() {
    if (target === "/") navigate({ to: "/" });
    else window.location.href = target;
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) toast.error(error.message);
    else goNext();
  }
  async function google() {
    const redirectTarget =
      target === "/" ? window.location.origin : `${window.location.origin}${target}`;
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: redirectTarget });
    if (r.error) toast.error(r.error.message);
    else if (!r.redirected) goNext();
  }
  return (
    <form onSubmit={submit} className="space-y-4 mt-4">
      <Button type="button" variant="outline" className="w-full" onClick={google}>
        Continue with Google
      </Button>
      <div className="relative my-2"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">or</span></div></div>
      <div className="space-y-2"><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="space-y-2"><Label>Password</Label><Input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
      <Button className="w-full" disabled={busy}>{busy ? "..." : "Sign in"}</Button>
    </form>
  );
}

function SignUpForm() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [dob, setDob] = useState("");
  const [over18, setOver18] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const target = safeNext(next);
  const emailRedirect =
    target === "/" ? window.location.origin : `${window.location.origin}${target}`;

  function ageOk(d: string) {
    if (!d) return false;
    const dt = new Date(d);
    const eighteenAgo = new Date(); eighteenAgo.setFullYear(eighteenAgo.getFullYear() - 18);
    return dt <= eighteenAgo;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!over18 || !terms) return toast.error("You must confirm you are 18+ and accept terms.");
    if (!ageOk(dob)) return toast.error("You must be at least 18 years old to use DICE.");
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return toast.error("Username must be 3–20 letters, digits, or underscores.");
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email, password: pw,
      options: {
        emailRedirectTo: emailRedirect,
        data: { username, display_name: displayName || username, dob, is_18_plus: true },
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Welcome to DICE! You earned a 2500 DICE welcome bonus.");
      if (target === "/") navigate({ to: "/" });
      else window.location.href = target;
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 mt-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2 col-span-2"><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-2 col-span-2"><Label>Password</Label><Input type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div className="space-y-2"><Label>Username</Label><Input required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ace_player" /></div>
        <div className="space-y-2"><Label>Display name</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ace" /></div>
        <div className="space-y-2 col-span-2"><Label>Date of birth</Label><Input type="date" required value={dob} onChange={(e) => setDob(e.target.value)} /></div>
      </div>
      <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-xs">
        <Sparkles className="size-4 text-primary mt-0.5" />
        <div>DICE is virtual currency only. It has no real-world value and cannot be purchased, exchanged, or cashed out. Play responsibly.</div>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={over18} onCheckedChange={(v) => setOver18(!!v)} />
        <span>I confirm I am at least <b>18 years old</b>.</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={terms} onCheckedChange={(v) => setTerms(!!v)} />
        <span>I accept the <Link to="/" className="underline">Terms</Link> and acknowledge DICE is virtual play.</span>
      </label>
      <Button className="w-full" disabled={busy}>{busy ? "Creating..." : "Create account"}</Button>
    </form>
  );
}
