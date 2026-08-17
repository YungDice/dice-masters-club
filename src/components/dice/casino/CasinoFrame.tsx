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
      className={`relative rounded-lg bg-obsidian p-6 md:p-8 overflow-hidden ${className}`}
      style={{
        boxShadow:
          "rgba(255,255,255,0.08) 0 0 0 1px inset, rgba(0,0,0,0.03) 0 1px 2px 0",
      }}
    >
      {(title || subtitle) && (
        <div className="relative mb-5 flex items-center gap-3">
          {icon}
          <div>
            {title && (
              <h2 className="font-display text-[20px] leading-[1.25] font-medium text-white">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs text-fog">{subtitle}</p>
            )}
          </div>
        </div>
      )}

      <div className="relative">{children}</div>
    </div>
  );
}
