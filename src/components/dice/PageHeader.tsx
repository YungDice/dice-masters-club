import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  accent = "primary",
}: {
  icon: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  accent?: "primary" | "gold" | "violet" | "emerald";
}) {
  const tints: Record<string, string> = {
    primary: "from-primary/30 via-primary/10 to-transparent",
    gold: "from-amber-400/25 via-amber-300/10 to-transparent",
    violet: "from-violet-500/25 via-violet-500/10 to-transparent",
    emerald: "from-emerald-500/25 via-emerald-500/10 to-transparent",
  };
  const ringTints: Record<string, string> = {
    primary: "bg-primary/15 text-primary ring-primary/30",
    gold: "bg-amber-400/15 text-amber-300 ring-amber-400/30",
    violet: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
    emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${tints[accent]} backdrop-blur-xl p-5 md:p-6`}
    >
      <div
        className="pointer-events-none absolute -top-12 -right-12 size-44 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.5), transparent 70%)" }}
      />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className={`grid size-12 shrink-0 place-items-center rounded-xl ring-1 ${ringTints[accent]}`}>
            <Icon className="size-6" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl md:text-3xl font-bold leading-tight truncate">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </motion.div>
  );
}
