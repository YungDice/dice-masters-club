import { Dices } from "lucide-react";

export function DiceLogo({ size = 32 }: { size?: number }) {
  return (
    <div
      className="relative grid place-items-center rounded-md glow-red"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, oklch(0.65 0.23 22), oklch(0.45 0.2 22))",
      }}
    >
      <Dices size={size * 0.65} className="text-white" />
    </div>
  );
}
