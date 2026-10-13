import {
  BuildingExteriorScene,
  HouseExteriorScene,
} from "@/components/properties/property-illustration";
import { assertNever } from "@/lib/properties/listing-types";
import { pickIllustrationVariant } from "@/lib/properties/illustration";
import type { IllustrationScene } from "@/lib/properties/types";

/*
 * Original illustrated scenes used as demo images (viewBox 400 × 300). They are simple
 * drawings in the site palette, not photos, and they never depict a real property. No SVG ids
 * are used, so a scene can be drawn several times on one page.
 */

type Interior = {
  wall: string;
  wallShade: string;
  floor: string;
  floorLine: string;
  wood: string;
  fabric: string;
  fabricShade: string;
  accent: string;
  light: string;
  sky: string;
  plant: string;
};

const INTERIORS: readonly Interior[] = [
  {
    // Cream walls, navy fabric.
    wall: "#f3eee5",
    wallShade: "#e3dacb",
    floor: "#d9c3a5",
    floorLine: "#c8ae8c",
    wood: "#9b7350",
    fabric: "#2f4c74",
    fabricShade: "#22385a",
    accent: "#b98458",
    light: "#fbf8f3",
    sky: "#cfe0f3",
    plant: "#3a5a4a",
  },
  {
    // Soft blue walls, sand fabric.
    wall: "#e4ebf3",
    wallShade: "#cfdae7",
    floor: "#cbb293",
    floorLine: "#b89b7a",
    wood: "#7d5c40",
    fabric: "#c9ab8c",
    fabricShade: "#b08f6f",
    accent: "#3478d4",
    light: "#ffffff",
    sky: "#f2e4cf",
    plant: "#4a6450",
  },
  {
    // Warm sand walls, blue accents.
    wall: "#efe2d2",
    wallShade: "#e0cdb6",
    floor: "#a8896a",
    floorLine: "#957658",
    wood: "#5a4636",
    fabric: "#5f83b3",
    fabricShade: "#4a6c99",
    accent: "#172b46",
    light: "#fbf6ee",
    sky: "#d3e3f6",
    plant: "#45604d",
  },
];

function Room({ p, floorY = 215 }: { p: Interior; floorY?: number }) {
  return (
    <>
      <rect width="400" height={floorY} fill={p.wall} />
      <rect width="400" height="300" y={floorY} fill={p.floor} />
      {[0, 1, 2].map((index) => (
        <rect
          key={index}
          y={floorY + 18 + index * 24}
          width="400"
          height="1.5"
          fill={p.floorLine}
          opacity="0.6"
        />
      ))}
      <rect y={floorY - 6} width="400" height="6" fill={p.wallShade} />
    </>
  );
}

function WindowFrame({
  p,
  x,
  y,
  width,
  height,
}: {
  p: Interior;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return (
    <g>
      <rect x={x - 5} y={y - 5} width={width + 10} height={height + 10} rx="4" fill={p.light} />
      <rect x={x} y={y} width={width} height={height} fill={p.sky} />
      <polygon
        points={`${x},${y + height} ${x + width * 0.35},${y + height * 0.6} ${x + width * 0.6},${y + height * 0.78} ${x + width},${y + height * 0.5} ${x + width},${y + height}`}
        fill={p.fabricShade}
        opacity="0.25"
      />
      <rect x={x + width / 2 - 2} y={y} width="4" height={height} fill={p.light} />
      <rect x={x} y={y + height / 2 - 2} width={width} height="4" fill={p.light} />
    </g>
  );
}

function Plant({ p, x, y }: { p: Interior; x: number; y: number }) {
  return (
    <g>
      <ellipse cx={x} cy={y - 30} rx="12" ry="22" fill={p.plant} />
      <ellipse cx={x - 13} cy={y - 22} rx="9" ry="16" fill={p.plant} opacity="0.85" />
      <ellipse cx={x + 13} cy={y - 22} rx="9" ry="16" fill={p.plant} opacity="0.85" />
      <path d={`M${x - 13} ${y - 10} h26 l-4 22 h-18 Z`} fill={p.accent} />
    </g>
  );
}

function LivingRoom({ p }: { p: Interior }) {
  return (
    <g>
      <Room p={p} />
      <WindowFrame p={p} x={40} y={42} width={110} height={118} />
      <rect x="28" y="34" width="16" height="140" rx="3" fill={p.fabricShade} opacity="0.75" />
      <rect x="146" y="34" width="16" height="140" rx="3" fill={p.fabricShade} opacity="0.75" />
      {/* Framed picture of mountains. */}
      <rect x="228" y="52" width="96" height="64" rx="3" fill={p.wood} />
      <rect x="234" y="58" width="84" height="52" fill={p.light} />
      <polygon points="234,110 262,78 280,96 296,80 318,110" fill={p.accent} opacity="0.8" />
      {/* Floor lamp. */}
      <rect x="179" y="110" width="3" height="100" fill={p.wood} />
      <polygon points="166,112 195,112 189,88 172,88" fill={p.light} />
      {/* Sofa. */}
      <rect x="196" y="128" width="172" height="44" rx="14" fill={p.fabricShade} />
      <rect x="190" y="160" width="184" height="42" rx="10" fill={p.fabric} />
      <rect x="184" y="146" width="22" height="56" rx="9" fill={p.fabricShade} />
      <rect x="358" y="146" width="22" height="56" rx="9" fill={p.fabricShade} />
      <rect x="214" y="142" width="40" height="26" rx="7" fill={p.light} opacity="0.8" />
      <rect x="316" y="142" width="34" height="26" rx="7" fill={p.accent} opacity="0.8" />
      <rect x="196" y="202" width="5" height="10" fill={p.wood} />
      <rect x="364" y="202" width="5" height="10" fill={p.wood} />
      {/* Rug and coffee table. */}
      <ellipse cx="262" cy="258" rx="120" ry="20" fill={p.accent} opacity="0.3" />
      <rect x="212" y="232" width="96" height="8" rx="3" fill={p.wood} />
      <rect x="222" y="240" width="5" height="18" fill={p.wood} />
      <rect x="294" y="240" width="5" height="18" fill={p.wood} />
      <rect x="240" y="224" width="16" height="8" rx="2" fill={p.light} />
      <Plant p={p} x={70} y={232} />
    </g>
  );
}

function Kitchen({ p }: { p: Interior }) {
  return (
    <g>
      <Room p={p} />
      {/* Upper cabinets. */}
      {[0, 1, 2, 3].map((index) => (
        <g key={index}>
          <rect x={30 + index * 52} y="36" width="48" height="62" rx="3" fill={p.wood} />
          <rect x={30 + index * 52 + 21} y="84" width="6" height="2.5" rx="1" fill={p.light} />
        </g>
      ))}
      <WindowFrame p={p} x={256} y={44} width={72} height={78} />
      {/* Backsplash tiles. */}
      <rect x="24" y="100" width="300" height="42" fill={p.light} opacity="0.7" />
      {Array.from({ length: 12 }, (_, index) => (
        <rect
          key={index}
          x={24 + index * 25}
          y="100"
          width="1"
          height="42"
          fill={p.wallShade}
          opacity="0.9"
        />
      ))}
      <rect x="24" y="120" width="300" height="1" fill={p.wallShade} />
      {/* Hood and cooktop. */}
      <polygon points="118,100 168,100 160,82 126,82" fill={p.fabricShade} opacity="0.9" />
      {/* Counter and lower cabinets. */}
      <rect x="20" y="142" width="310" height="9" rx="2" fill={p.fabricShade} />
      <rect x="24" y="151" width="302" height="58" fill={p.wood} />
      {[0, 1, 2, 3, 4].map((index) => (
        <g key={index}>
          <rect
            x={30 + index * 59}
            y="157"
            width="53"
            height="46"
            rx="3"
            fill={p.light}
            opacity="0.12"
          />
          <rect x={52 + index * 59} y="163" width="9" height="2.5" rx="1" fill={p.light} />
        </g>
      ))}
      <rect x="118" y="137" width="50" height="5" rx="2" fill="#1c2330" opacity="0.8" />
      <rect x="62" y="124" width="22" height="18" rx="5" fill={p.accent} />
      <rect x="262" y="128" width="16" height="14" rx="3" fill={p.light} />
      <Plant p={p} x={304} y={142} />
      {/* Refrigerator. */}
      <rect x="342" y="56" width="50" height="153" rx="6" fill={p.light} />
      <rect x="342" y="112" width="50" height="2" fill={p.wallShade} />
      <rect x="348" y="78" width="3" height="22" rx="1" fill={p.wallShade} />
      <rect x="348" y="122" width="3" height="28" rx="1" fill={p.wallShade} />
    </g>
  );
}

function Bedroom({ p }: { p: Interior }) {
  return (
    <g>
      <Room p={p} />
      <WindowFrame p={p} x={296} y={46} width={76} height={108} />
      <rect x="286" y="38" width="13" height="132" rx="3" fill={p.fabric} opacity="0.7" />
      <rect x="370" y="38" width="13" height="132" rx="3" fill={p.fabric} opacity="0.7" />
      {/* Pictures above the bed. */}
      <rect x="128" y="50" width="44" height="44" rx="3" fill={p.wood} />
      <rect x="133" y="55" width="34" height="34" fill={p.light} />
      <circle cx="150" cy="72" r="10" fill={p.accent} opacity="0.75" />
      <rect x="184" y="50" width="44" height="44" rx="3" fill={p.wood} />
      <rect x="189" y="55" width="34" height="34" fill={p.light} />
      <rect x="196" y="66" width="20" height="14" fill={p.fabric} opacity="0.75" />
      {/* Bed. */}
      <rect x="84" y="112" width="190" height="80" rx="10" fill={p.wood} />
      <rect x="76" y="160" width="206" height="36" rx="8" fill={p.light} />
      <rect x="104" y="146" width="62" height="26" rx="10" fill={p.light} />
      <rect x="192" y="146" width="62" height="26" rx="10" fill={p.light} />
      <rect x="76" y="176" width="206" height="44" rx="8" fill={p.fabric} />
      <rect x="76" y="176" width="206" height="10" rx="5" fill={p.fabricShade} />
      <rect x="84" y="220" width="6" height="10" fill={p.wood} />
      <rect x="268" y="220" width="6" height="10" fill={p.wood} />
      {/* Nightstand and lamp. */}
      <rect x="28" y="172" width="42" height="40" rx="4" fill={p.wood} />
      <rect x="34" y="190" width="30" height="2" fill={p.light} opacity="0.5" />
      <rect x="47" y="150" width="4" height="22" fill={p.wallShade} />
      <polygon points="36,152 62,152 57,132 41,132" fill={p.accent} opacity="0.85" />
      <ellipse cx="182" cy="262" rx="130" ry="18" fill={p.accent} opacity="0.25" />
    </g>
  );
}

function Bathroom({ p }: { p: Interior }) {
  return (
    <g>
      <rect width="400" height="300" fill={p.light} />
      {/* Wall tiles. */}
      {Array.from({ length: 16 }, (_, index) => (
        <rect key={`v${index}`} x={index * 26} width="1" height="215" fill={p.wallShade} />
      ))}
      {Array.from({ length: 8 }, (_, index) => (
        <rect key={`h${index}`} y={index * 26} width="400" height="1" fill={p.wallShade} />
      ))}
      <rect y="215" width="400" height="85" fill={p.wallShade} />
      {Array.from({ length: 10 }, (_, index) => (
        <rect
          key={`f${index}`}
          x={index * 42}
          y="215"
          width="1.5"
          height="85"
          fill={p.floorLine}
          opacity="0.5"
        />
      ))}
      {/* Bathtub. */}
      <rect x="26" y="150" width="190" height="64" rx="16" fill="#ffffff" />
      <rect x="26" y="150" width="190" height="12" rx="6" fill={p.sky} />
      <rect x="40" y="214" width="8" height="10" rx="2" fill={p.wood} />
      <rect x="194" y="214" width="8" height="10" rx="2" fill={p.wood} />
      <rect x="46" y="118" width="5" height="34" fill={p.wood} />
      <rect x="46" y="118" width="22" height="5" rx="2" fill={p.wood} />
      {/* Towel rail. */}
      <rect x="226" y="98" width="30" height="3" rx="1.5" fill={p.wood} />
      <rect x="230" y="101" width="22" height="46" rx="3" fill={p.fabric} />
      <rect x="230" y="134" width="22" height="4" fill={p.fabricShade} />
      {/* Mirror and vanity. */}
      <rect x="276" y="44" width="84" height="92" rx="40" fill={p.wood} />
      <rect x="282" y="50" width="72" height="80" rx="34" fill={p.sky} />
      <rect x="296" y="62" width="10" height="40" rx="5" fill="#ffffff" opacity="0.6" />
      <rect x="264" y="150" width="108" height="64" rx="4" fill={p.wood} />
      <rect x="258" y="144" width="120" height="8" rx="3" fill="#ffffff" />
      <rect x="316" y="132" width="4" height="12" fill={p.wallShade} />
      <rect x="272" y="160" width="44" height="46" rx="3" fill={p.light} opacity="0.15" />
      <rect x="320" y="160" width="44" height="46" rx="3" fill={p.light} opacity="0.15" />
      <Plant p={p} x={240} y={210} />
    </g>
  );
}

function BalconyView({ p, seed }: { p: Interior; seed: string }) {
  const evening = pickIllustrationVariant(`${seed}:time`, 2) === 1;
  const sky = evening ? "#2a4266" : p.sky;
  const far = evening ? "#3b5679" : "#a9c1df";
  const city = evening ? "#172b46" : "#5f83b3";
  const windows = evening ? "#f3dcae" : "#eef4fc";
  return (
    <g>
      <rect width="400" height="300" fill={sky} />
      <rect
        y="120"
        width="400"
        height="180"
        fill={evening ? "#b98458" : "#ffffff"}
        opacity="0.25"
      />
      <circle cx="300" cy="70" r="22" fill={evening ? "#efd9b4" : "#f6e7cc"} />
      <polygon
        points="0,170 60,120 120,150 190,100 260,145 330,110 400,140 400,300 0,300"
        fill={far}
      />
      {[
        [10, 70],
        [56, 100],
        [104, 60],
        [150, 120],
        [210, 80],
        [258, 105],
        [310, 70],
        [356, 95],
      ].map(([x, height]) => (
        <g key={x}>
          <rect x={x} y={200 - height} width="40" height={height + 20} fill={city} />
          {Array.from({ length: Math.floor(height / 18) }, (_, row) => (
            <rect
              key={row}
              x={x + 8}
              y={208 - height + row * 18}
              width="24"
              height="5"
              rx="1"
              fill={windows}
              opacity={(row + x) % 3 === 0 ? 0.4 : 0.85}
            />
          ))}
        </g>
      ))}
      {/* Balcony floor and railing in the foreground. */}
      <rect y="250" width="400" height="50" fill={p.floor} />
      <rect y="250" width="400" height="4" fill={p.floorLine} />
      <rect y="196" width="400" height="7" rx="2" fill={p.wood} />
      {Array.from({ length: 26 }, (_, index) => (
        <rect key={index} x={6 + index * 16} y="203" width="3" height="47" fill={p.wood} />
      ))}
      <Plant p={p} x={44} y={270} />
      <rect x="292" y="230" width="62" height="6" rx="3" fill={p.light} />
      <rect x="320" y="236" width="5" height="28" fill={p.light} />
      <rect x="300" y="266" width="44" height="4" rx="2" fill={p.light} />
    </g>
  );
}

function Yard({ p }: { p: Interior }) {
  return (
    <g>
      <rect width="400" height="300" fill={p.sky} />
      <rect y="100" width="400" height="200" fill="#ffffff" opacity="0.3" />
      <rect y="190" width="400" height="110" fill="#8fa77f" />
      <rect y="190" width="400" height="6" fill="#7a9369" />
      {/* Corner of the house. */}
      <polygon points="214,112 312,58 410,112" fill="#22385a" />
      <rect x="228" y="108" width="172" height="104" fill={p.wall} />
      <rect x="252" y="130" width="38" height="34" rx="3" fill={p.sky} />
      <rect x="270" y="130" width="2" height="34" fill={p.light} />
      <rect x="320" y="148" width="32" height="64" rx="3" fill={p.wood} />
      <rect x="346" y="178" width="3" height="5" rx="1" fill={p.light} />
      {/* Path to the door. */}
      <polygon points="300,300 380,300 352,212 322,212" fill={p.wallShade} />
      {/* Tree. */}
      <rect x="86" y="140" width="10" height="70" fill={p.wood} />
      <circle cx="91" cy="122" r="36" fill={p.plant} />
      <circle cx="66" cy="140" r="24" fill={p.plant} opacity="0.9" />
      <circle cx="116" cy="140" r="24" fill={p.plant} opacity="0.9" />
      {/* Fence. */}
      <rect y="176" width="200" height="4" fill={p.light} />
      {Array.from({ length: 12 }, (_, index) => (
        <rect key={index} x={4 + index * 17} y="166" width="5" height="32" rx="2" fill={p.light} />
      ))}
      {/* Bench and flowers. */}
      <rect x="140" y="222" width="70" height="7" rx="2" fill={p.wood} />
      <rect x="146" y="229" width="5" height="14" fill={p.wood} />
      <rect x="199" y="229" width="5" height="14" fill={p.wood} />
      {[30, 48, 64, 236, 252, 270].map((x, index) => (
        <circle key={x} cx={x} cy={252 + (index % 2) * 8} r="5" fill={p.accent} opacity="0.85" />
      ))}
    </g>
  );
}

function Scene({ scene, seed }: { scene: IllustrationScene; seed: string }) {
  const p = INTERIORS[pickIllustrationVariant(seed, INTERIORS.length)];
  switch (scene) {
    case "building-exterior":
      return <BuildingExteriorScene seed={seed} />;
    case "house-exterior":
      return <HouseExteriorScene seed={seed} />;
    case "living-room":
      return <LivingRoom p={p} />;
    case "kitchen":
      return <Kitchen p={p} />;
    case "bedroom":
      return <Bedroom p={p} />;
    case "bathroom":
      return <Bathroom p={p} />;
    case "balcony-view":
      return <BalconyView p={p} seed={seed} />;
    case "yard":
      return <Yard p={p} />;
    default:
      return assertNever(scene);
  }
}

type IllustrationSceneSvgProps = {
  scene: IllustrationScene;
  /** Stable seed (the image id), so an image always gets the same colours. */
  seed: string;
  className?: string;
};

/** Decorative SVG drawing of a scene; the surrounding element provides the accessible name. */
export function IllustrationSceneSvg({ scene, seed, className = "" }: IllustrationSceneSvgProps) {
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <Scene scene={scene} seed={seed} />
    </svg>
  );
}
