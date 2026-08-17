import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/** 8px radius card on Charcoal with a 1px inset white-alpha ring (no drop shadow). */
export function Panel({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg bg-charcoal p-3", className)}
      style={{ boxShadow: "rgba(255,255,255,0.08) 0 0 0 1px inset" }}
      {...rest}
    >
      {children}
    </div>
  );
}

/** 32px weight-500 heading with optional right-aligned Ice Signal link. 24px gap below. */
export function SectionHeader({
  title,
  to,
  linkLabel = "See all",
  subtitle,
}: {
  title: string;
  to?: string;
  linkLabel?: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[22px] md:text-[32px] font-medium leading-[1.25] truncate">{title}</h2>
        {subtitle && <p className="mt-1 text-[12px] text-fog">{subtitle}</p>}
      </div>
      {to && (
        <Link to={to as any} className="shrink-0 text-[14px] font-medium text-ice hover:text-white transition-colors">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

/** 28px outlined pill, 1px Iron border, 4px radius. */
export function Pill({
  active,
  className,
  children,
  ...rest
}: { active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "h-7 shrink-0 rounded border px-2.5 text-[14px] font-medium leading-none transition-colors",
        active
          ? "border-ice text-white bg-charcoal"
          : "border-iron text-white/90 hover:border-white",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function PillLink({
  to,
  active,
  children,
}: { to: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to as any}
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded border px-2.5 text-[14px] font-medium leading-none transition-colors",
        active ? "border-ice text-white bg-charcoal" : "border-iron text-white/90 hover:border-white",
      )}
    >
      {children}
    </Link>
  );
}

/** Ghost/outline action button per spec: 1px Ice border, no fill. */
export function OutlineAction({
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 rounded border border-ice px-4 py-2.5 text-[14px] font-medium leading-none text-white transition-colors hover:border-white disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
