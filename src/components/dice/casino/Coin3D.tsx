import { motion } from "framer-motion";

export function Coin3D({ side, flipping, size = 140 }: { side: "heads" | "tails" | null; flipping: boolean; size?: number }) {
  // Tails should land face-up. Heads = 0deg, Tails = 180deg around X.
  const targetX = side === "tails" ? 180 : 0;
  return (
    <div style={{ width: size, height: size, perspective: 1000 }} className="relative mx-auto">
      <motion.div
        animate={flipping ? { rotateX: [0, 1440, 2880] } : { rotateX: 2880 + targetX, y: [0, -10, 0] }}
        transition={flipping
          ? { duration: 0.45, repeat: Infinity, ease: "linear" }
          : { duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-0 rounded-full"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Heads face */}
        <div
          className="absolute inset-0 rounded-full grid place-items-center font-display font-black"
          style={{
            transform: `translateZ(8px)`,
            background: "radial-gradient(circle at 30% 30%, #fff2a8, #d4a017 60%, #8a6608)",
            color: "#3a2700",
            fontSize: size * 0.42,
            boxShadow: "inset 0 -6px 12px rgba(0,0,0,0.35), inset 0 4px 8px rgba(255,255,255,0.4), 0 0 24px -2px rgba(212,160,23,0.6)",
            border: "3px solid #b8860b",
            backfaceVisibility: "hidden",
          }}
        >H</div>
        {/* Tails face */}
        <div
          className="absolute inset-0 rounded-full grid place-items-center font-display font-black"
          style={{
            transform: `rotateX(180deg) translateZ(8px)`,
            background: "radial-gradient(circle at 30% 30%, #fff2a8, #d4a017 60%, #8a6608)",
            color: "#3a2700",
            fontSize: size * 0.42,
            boxShadow: "inset 0 -6px 12px rgba(0,0,0,0.35), inset 0 4px 8px rgba(255,255,255,0.4), 0 0 24px -2px rgba(212,160,23,0.6)",
            border: "3px solid #b8860b",
            backfaceVisibility: "hidden",
          }}
        >T</div>
        {/* Edge */}
        <div
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: size, height: 16,
            transform: "translate(-50%, -50%) rotateX(90deg)",
            background: "linear-gradient(90deg, #8a6608, #d4a017, #8a6608)",
            transformStyle: "preserve-3d",
          }}
        />
      </motion.div>
      {/* shadow */}
      <motion.div
        animate={flipping ? { scaleX: [1, 0.7, 1], opacity: [0.5, 0.25, 0.5] } : { scaleX: 1, opacity: 0.5 }}
        transition={flipping ? { duration: 0.45, repeat: Infinity, ease: "easeInOut" } : { duration: 0.6 }}
        className="absolute left-1/2 -translate-x-1/2 rounded-full"
        style={{
          bottom: -18, width: size * 0.9, height: 14,
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55), transparent 70%)",
          filter: "blur(3px)",
        }}
      />
    </div>
  );
}
