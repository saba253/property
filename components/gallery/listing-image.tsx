import { IllustrationSceneSvg } from "@/components/gallery/illustration-scenes";
import { assertNever } from "@/lib/properties/listing-types";
import type { ListingImage } from "@/lib/properties/types";

/** Label for original illustrations, so they are never mistaken for photos of a property. */
export const ILLUSTRATION_LABEL = "ილუსტრაცია · არა რეალური ფოტო";

type ListingImageViewProps = {
  image: ListingImage;
  /** Sizing and shape classes (for example an aspect ratio and rounded corners). */
  className?: string;
  /** "cover" fills the box (cards, thumbnails); "contain" shows the whole photo (viewer). */
  fit?: "cover" | "contain";
  /**
   * Text of the corner label, or null for no label (small thumbnails). Illustrations default to
   * ILLUSTRATION_LABEL; photos have no label unless one is given (for example "local preview").
   */
  label?: string | null;
  /**
   * True when the surrounding link or button already names the content (listing cards), so the
   * image itself is hidden from screen readers instead of repeating its description.
   */
  decorative?: boolean;
  /** Corner of the label; "top" leaves the bottom free for controls over the image. */
  labelPlacement?: "bottom" | "top";
};

/**
 * Renders one listing image in a fixed box: an original SVG illustration or a photo. The box
 * size comes from `className`, so images never cause layout shifts while loading.
 */
export function ListingImageView({
  image,
  className = "",
  fit = "cover",
  label,
  decorative = false,
  labelPlacement = "bottom",
}: ListingImageViewProps) {
  const { source } = image;
  const shownLabel =
    label === undefined ? (source.kind === "illustration" ? ILLUSTRATION_LABEL : null) : label;

  let content;
  switch (source.kind) {
    case "illustration":
      content = (
        <div
          role={decorative ? undefined : "img"}
          aria-label={decorative ? undefined : image.alt}
          aria-hidden={decorative || undefined}
          className="h-full w-full"
        >
          <IllustrationSceneSvg scene={source.scene} seed={image.id} className="h-full w-full" />
        </div>
      );
      break;
    case "photo":
      content = (
        // A plain <img>: local previews are object URLs that the image optimizer cannot read.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source.src}
          alt={decorative ? "" : image.alt}
          width={source.width}
          height={source.height}
          decoding="async"
          draggable={false}
          className={`h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"}`}
        />
      );
      break;
    default:
      content = assertNever(source);
  }

  return (
    <div
      className={`relative overflow-hidden ${fit === "contain" && source.kind === "photo" ? "bg-black/25" : "bg-cream"} ${className}`}
    >
      {content}
      {shownLabel && (
        <span
          className={`pointer-events-none absolute right-3 ${labelPlacement === "top" ? "top-3" : "bottom-3"} rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-medium text-ink backdrop-blur`}
        >
          {shownLabel}
        </span>
      )}
    </div>
  );
}

/** Shown when a listing has no images: a calm placeholder that says so plainly. */
export function NoImagesPlaceholder({
  className = "",
  compact = false,
}: {
  className?: string;
  /** Smaller text for cards. */
  compact?: boolean;
}) {
  return (
    <div
      role="img"
      aria-label="სურათები არ არის დამატებული"
      className={`flex flex-col items-center justify-center gap-2 bg-cream text-center ${className}`}
    >
      <svg
        viewBox="0 0 48 48"
        aria-hidden="true"
        className={`${compact ? "h-10 w-10" : "h-14 w-14"} fill-none stroke-sand-500`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="6" y="10" width="36" height="28" rx="5" />
        <circle cx="17" cy="20" r="3.5" />
        <path d="m8 34 10-9 7 6 6-5 9 8" />
      </svg>
      <p className={`${compact ? "text-xs" : "text-sm"} font-medium text-muted`}>
        სურათები არ არის დამატებული
      </p>
    </div>
  );
}
