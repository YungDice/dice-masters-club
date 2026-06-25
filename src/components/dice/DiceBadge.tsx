import { Dices } from "lucide-react";
import { fmt } from "@/lib/format";

export function DiceBadge({ amount, size = "md" }: { amount: number | bigint; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "text-xs px-2 py-0.5 gap-1",
    md: "text-sm px-2.5 py-1 gap-1.5",
    lg: "text-base px-3 py-1.5 gap-2",
  };
  return (
    <span className={`inline-flex items-center rounded-full font-semibold glass text-primary ${sizes[size]}`}>
      <Dices className="size-3.5" />
      {fmt(amount)}
    </span>
  );
}
