import { Dices } from "lucide-react";

export function DiceLogo({ size = 32 }: { size?: number }) {
  return (
    <div
      className="relative grid place-items-center rounded bg-graphite"
      style={{
        width: size,
        height: size,
        boxShadow: "rgba(255,255,255,0.08) 0 0 0 1px inset",
      }}
    >
      <Dices size={size * 0.6} strokeWidth={1.5} className="text-white" />
    </div>
  );
}
