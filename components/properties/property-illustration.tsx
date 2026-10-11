import { pickIllustrationVariant } from "@/lib/properties/illustration";

type Palette = {
  skyTop: string;
  skyBottom: string;
  sun: string;
  buildings: [string, string, string];
  windows: string;
  ground: string;
  tree: string;
};

// Original, invented colour scenes. They are drawings, not photos of any real property.
const PALETTES: readonly Palette[] = [
  {
    // Navy dusk over cream.
    skyTop: "#dde6f2",
    skyBottom: "#f7f4ee",
    sun: "#e3c4a2",
    buildings: ["#172b46", "#2f4c74", "#8ea8c8"],
    windows: "#f7f4ee",
    ground: "#ece9e4",
    tree: "#2a4266",
  },
  {
    // Warm sand afternoon.
    skyTop: "#efe4d6",
    skyBottom: "#fbf8f3",
    sun: "#d9a679",
    buildings: ["#5a4636", "#8c6c52", "#c9ab8c"],
    windows: "#fbf6ee",
    ground: "#e4d8c7",
    tree: "#6e5644",
  },
  {
    // Night navy.
    skyTop: "#14243c",
    skyBottom: "#3d5577",
    sun: "#efd9b4",
    buildings: ["#0f1e33", "#22385a", "#3b5679"],
    windows: "#f3dcae",
    ground: "#101c2e",
    tree: "#1b2c45",
  },
  {
    // Clear blue morning.
    skyTop: "#d3e3f6",
    skyBottom: "#f4f8fc",
    sun: "#f6e7cc",
    buildings: ["#2a4266", "#5f83b3", "#a9c1df"],
    windows: "#f4f8fc",
    ground: "#dde5ee",
    tree: "#3a5579",
  },
];

type Building = { x: number; width: number; height: number };

// Three skyline layouts; the variant picks one so cards do not all look the same.
const LAYOUTS: readonly (readonly Building[])[] = [
  [
    { x: 40, width: 96, height: 150 },
    { x: 150, width: 110, height: 200 },
    { x: 274, width: 86, height: 120 },
  ],
  [
    { x: 30, width: 120, height: 120 },
    { x: 164, width: 92, height: 180 },
    { x: 270, width: 100, height: 150 },
  ],
  [
    { x: 56, width: 84, height: 185 },
    { x: 154, width: 124, height: 135 },
    { x: 292, width: 72, height: 165 },
  ],
];

const GROUND_Y = 250;

function Windows({ building, color }: { building: Building; color: string }) {
  const columns = Math.max(1, Math.floor((building.width - 16) / 20));
  const rows = Math.max(1, Math.floor((building.height - 28) / 24));
  const gapX = (building.width - columns * 10) / (columns + 1);
  const top = GROUND_Y - building.height + 16;

  return (
    <>
      {Array.from({ length: rows * columns }, (_, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        return (
          <rect
            key={index}
            x={building.x + gapX + column * (10 + gapX)}
            y={top + row * 24}
            width={10}
            height={13}
            rx={2}
            fill={color}
            opacity={(row + column) % 3 === 0 ? 0.55 : 0.9}
          />
        );
      })}
    </>
  );
}

type PropertyIllustrationProps = {
  /** Stable seed, for example the listing id, so a listing always gets the same drawing. */
  seed: string;
  className?: string;
};

/**
 * Original illustrated placeholder used instead of property photos. It is always labelled
 * as an illustration so it can never be mistaken for a real photo of the property.
 */
export function PropertyIllustration({ seed, className = "" }: PropertyIllustrationProps) {
  const palette = PALETTES[pickIllustrationVariant(seed, PALETTES.length)];
  const layout = LAYOUTS[pickIllustrationVariant(`${seed}:layout`, LAYOUTS.length)];
  const gradientId = `sky-${seed.replace(/[^a-zA-Z0-9-]/g, "")}`;

  return (
    <div className={`relative overflow-hidden bg-cream ${className}`}>
      <svg
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMax slice"
        role="img"
        aria-label="ილუსტრაცია, არა რეალური ფოტო"
        className="h-full w-full"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={palette.skyTop} />
            <stop offset="1" stopColor={palette.skyBottom} />
          </linearGradient>
        </defs>
        <rect width="400" height="300" fill={`url(#${gradientId})`} />
        <circle cx="318" cy="68" r="26" fill={palette.sun} />
        {layout.map((building, index) => (
          <g key={index}>
            <rect
              x={building.x}
              y={GROUND_Y - building.height}
              width={building.width}
              height={building.height}
              rx={6}
              fill={palette.buildings[index]}
            />
            <Windows building={building} color={palette.windows} />
          </g>
        ))}
        <rect y={GROUND_Y} width="400" height={300 - GROUND_Y} fill={palette.ground} />
        <rect x="20" y={GROUND_Y - 22} width="4" height="22" fill={palette.tree} />
        <circle cx="22" cy={GROUND_Y - 30} r="14" fill={palette.tree} />
      </svg>

      <span className="absolute right-3 bottom-3 rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-medium text-ink backdrop-blur">
        ილუსტრაცია · არა რეალური ფოტო
      </span>
    </div>
  );
}
