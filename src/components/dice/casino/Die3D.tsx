import { motion } from "framer-motion";

// 3D-feeling tumbling die. Face rotations chosen so each value lands flat.
const FACE_ROT: Record<number, { x: number; y: number }> = {
  1: { x: 0,   y: 0   },
  2: { x: 0,   y: -90 },
  3: { x: -90, y: 0   },
  4: { x: 90,  y: 0   },
  5: { x: 0,   y: 90  },
  6: { x: 180, y: 0   },
};

function Pip({ className = "" }: { className?: string }) {
  return <span className={`block rounded-full bg-black ${className}`} style={{ width: 12, height: 12 }} />;
}

function Face({ value, transform }: { value: number; transform: string }) {
  // 3x3 grid pip layouts per value
  const grids: Record<number, [number, number][]> = {
    1: [[1,1]],
    2: [[0,0],[2,2]],
    3: [[0,0],[1,1],[2,2]],
    4: [[0,0],[0,2],[2,0],[2,2]],
    5: [[0,0],[0,2],[1,1],[2,0],[2,2]],
    6: [[0,0],[1,0],[2,0],[0,2],[1,2],[2,2]],
  };
  const cells = grids[value] ?? [];
  return (
    <div
      className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-1 rounded-xl p-3"
      style={{
        transform,
        background: "linear-gradient(145deg, #fdfdfd, #d8d8d8)",
        boxShadow: "inset 0 -6px 12px rgba(0,0,0,0.18), inset 0 2px 4px rgba(255,255,255,0.9), 0 4px 10px rgba(0,0,0,0.35)",
        border: "1px solid rgba(0,0,0,0.18)",
        backfaceVisibility: "hidden",
      }}
    >
      {Array.from({ length: 9 }).map((_, i) => {
        const r = Math.floor(i / 3), c = i % 3;
        const show = cells.some(([cc, rr]) => rr === r && cc === c);
        return <div key={i} className="grid place-items-center">{show && <Pip />}</div>;
      })}
    </div>
  );
}

export function Die3D({ value, rolling, size = 72 }: { value: number; rolling: boolean; size?: number }) {
  const target = FACE_ROT[value || 1] ?? FACE_ROT[1];
  // While rolling, keep adding rotations; on stop, snap to the value's face plus full revolutions for drama.
  const animate = rolling
    ? { rotateX: [0, 720, 1080], rotateY: [0, -540, -900] }
    : { rotateX: target.x + 720, rotateY: target.y - 720 };
  return (
    <div style={{ width: size, height: size, perspective: 600 }} className="relative">
      <motion.div
        animate={animate}
        transition={rolling
          ? { duration: 0.6, repeat: Infinity, ease: "linear" }
          : { duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-0"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Render six faces. We render the resolved value on the front for clarity at rest. */}
        <Face value={value || 1} transform={`translateZ(${size / 2}px)`} />
        <Face value={6} transform={`rotateY(180deg) translateZ(${size / 2}px)`} />
        <Face value={2} transform={`rotateY(90deg) translateZ(${size / 2}px)`} />
        <Face value={5} transform={`rotateY(-90deg) translateZ(${size / 2}px)`} />
        <Face value={3} transform={`rotateX(90deg) translateZ(${size / 2}px)`} />
        <Face value={4} transform={`rotateX(-90deg) translateZ(${size / 2}px)`} />
      </motion.div>
      {/* shadow */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full"
        style={{
          bottom: -10, width: size * 0.9, height: 10,
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0.45), transparent 70%)",
          filter: "blur(2px)",
        }}
      />
    </div>
  );
}
