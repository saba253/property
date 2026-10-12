/**
 * Original illustrated hero background: an evening townscape of generic houses with pitched
 * roofs, balconies and lit windows, in the site's navy and sand palette. It is a drawing, not a
 * photo, and does not depict any real property or listing.
 */

type House = {
  x: number;
  width: number;
  height: number;
  roof: "pitched" | "flat";
  balcony: boolean;
  shade: string;
};

const BASELINE = 600;

// Back row (smaller, lighter) and front row (larger, darker) for depth.
const BACK_ROW: readonly House[] = [
  { x: 40, width: 150, height: 170, roof: "pitched", balcony: false, shade: "#2f4c74" },
  { x: 210, width: 120, height: 220, roof: "flat", balcony: true, shade: "#2a4266" },
  { x: 350, width: 170, height: 160, roof: "pitched", balcony: true, shade: "#33507a" },
  { x: 900, width: 160, height: 200, roof: "flat", balcony: true, shade: "#2f4c74" },
  { x: 1080, width: 140, height: 165, roof: "pitched", balcony: false, shade: "#33507a" },
  { x: 1240, width: 170, height: 230, roof: "flat", balcony: true, shade: "#2a4266" },
];

const FRONT_ROW: readonly House[] = [
  { x: -20, width: 200, height: 150, roof: "pitched", balcony: true, shade: "#1c3150" },
  { x: 190, width: 170, height: 120, roof: "pitched", balcony: false, shade: "#172b46" },
  { x: 370, width: 150, height: 180, roof: "flat", balcony: true, shade: "#1c3150" },
  { x: 930, width: 180, height: 140, roof: "pitched", balcony: true, shade: "#172b46" },
  { x: 1120, width: 150, height: 175, roof: "flat", balcony: true, shade: "#1c3150" },
  { x: 1280, width: 190, height: 130, roof: "pitched", balcony: false, shade: "#172b46" },
];

function HouseShape({ house, windowColor }: { house: House; windowColor: string }) {
  const top = BASELINE - house.height;
  const columns = Math.max(2, Math.floor(house.width / 42));
  const rows = Math.max(1, Math.floor((house.height - 40) / 48));
  const gapX = house.width / (columns + 1);

  return (
    <g>
      {house.roof === "pitched" ? (
        <polygon
          points={`${house.x - 10},${top} ${house.x + house.width / 2},${top - house.width * 0.32} ${house.x + house.width + 10},${top}`}
          fill={house.shade}
        />
      ) : (
        <rect x={house.x - 4} y={top - 10} width={house.width + 8} height="12" fill={house.shade} />
      )}
      <rect x={house.x} y={top} width={house.width} height={house.height} fill={house.shade} />
      {Array.from({ length: rows * columns }, (_, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        const lit = (index * 7 + house.x) % 5 !== 0;
        return (
          <rect
            key={index}
            x={house.x + gapX * (column + 1) - 9}
            y={top + 24 + row * 48}
            width="18"
            height="24"
            rx="2"
            fill={lit ? windowColor : "#0f1e33"}
            opacity={lit ? 0.9 : 0.6}
          />
        );
      })}
      {house.balcony && (
        <g opacity="0.85">
          <rect x={house.x + 10} y={top + 58} width={house.width - 20} height="4" fill="#b98458" />
          {Array.from({ length: Math.floor((house.width - 20) / 14) }, (_, index) => (
            <rect
              key={index}
              x={house.x + 12 + index * 14}
              y={top + 62}
              width="2.5"
              height="14"
              fill="#b98458"
            />
          ))}
          <rect x={house.x + 10} y={top + 76} width={house.width - 20} height="3" fill="#b98458" />
        </g>
      )}
    </g>
  );
}

export function HeroIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 640"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f1e33" />
          <stop offset="0.55" stopColor="#2a4266" />
          <stop offset="0.85" stopColor="#7a6a63" />
          <stop offset="1" stopColor="#b98458" />
        </linearGradient>
        <radialGradient id="hero-glow" cx="0.5" cy="0.95" r="0.6">
          <stop offset="0" stopColor="#e3c4a2" stopOpacity="0.55" />
          <stop offset="1" stopColor="#e3c4a2" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="1440" height="640" fill="url(#hero-sky)" />
      <rect width="1440" height="640" fill="url(#hero-glow)" />
      <circle cx="1130" cy="150" r="34" fill="#f2e4cf" opacity="0.85" />

      {/* Distant mountain ridges. */}
      <path
        d="M0 470 L160 380 L300 430 L470 330 L640 420 L790 350 L960 430 L1120 340 L1290 420 L1440 360 L1440 640 L0 640 Z"
        fill="#2a4266"
        opacity="0.75"
      />
      <path
        d="M0 520 L200 450 L380 500 L560 440 L760 500 L940 450 L1140 510 L1320 455 L1440 490 L1440 640 L0 640 Z"
        fill="#22385a"
        opacity="0.9"
      />

      {BACK_ROW.map((house) => (
        <HouseShape key={`b-${house.x}`} house={house} windowColor="#e3c4a2" />
      ))}
      {FRONT_ROW.map((house) => (
        <HouseShape key={`f-${house.x}`} house={house} windowColor="#f2d7b0" />
      ))}

      <rect y={BASELINE} width="1440" height={640 - BASELINE} fill="#0f1e33" />
    </svg>
  );
}
