import type { ReactNode } from "react";

/**
 * Blackjack-style casino table frame: dark green felt + gold trim.
 * Wrap any game UI in this for a consistent premium look.
 */
export function CasinoFrame({
  title,
  subtitle,
  icon,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-2xl p-6 md:p-8 overflow-hidden ${className}`}
      style={{
        background:
          "radial-gradient(ellipse at top, #0b4d3a 0%, #073023 55%, #04201a 100%)",
        boxShadow:
          "inset 0 0 60px rgba(0,0,0,0.55), 0 10px 40px -10px rgba(0,0,0,0.6)",
        border: "2px solid #c9a84c",
      }}
    >
      {/* Inner gold hairline */}
      <div
        className="pointer-events-none absolute inset-1 rounded-xl"
        style={{ border: "1px solid rgba(201,168,76,0.35)" }}
      />
      {/* Felt texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-25 mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)",
          backgroundSize: "6px 6px",
        }}
      />
      {(title || subtitle) && (
        <div className="relative mb-5 flex items-center gap-3">
          {icon}
          <div>
            {title && (
              <h2 className="font-display text-2xl font-bold text-amber-100 drop-shadow">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs uppercase tracking-widest text-amber-200/60">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
