"use client";

import { type KeyboardEvent, type PointerEvent, useEffect, useRef } from "react";
import { ILLUSTRATION_LABEL, ListingImageView } from "@/components/gallery/listing-image";
import {
  formatImagePosition,
  isIllustration,
  stepImageIndex,
} from "@/lib/properties/listing-images";
import type { ListingImage } from "@/lib/properties/types";

/** Horizontal distance in pixels that counts as a swipe on touch screens. */
const SWIPE_THRESHOLD = 50;

type PhotoViewerProps = {
  images: readonly ListingImage[];
  /** Index of the shown image, or null when the viewer is closed. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Listing title, for the dialog's accessible name. */
  title: string;
  /** Corner label for photos (for example "local preview"); illustrations are always labelled. */
  photoLabel?: string;
};

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5 fill-current">
      {direction === "left" ? (
        <path d="M12.7 4.3a1 1 0 0 1 0 1.4L8.4 10l4.3 4.3a1 1 0 0 1-1.4 1.4l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 0Z" />
      ) : (
        <path d="M7.3 4.3a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4-1.4l4.3-4.3-4.3-4.3a1 1 0 0 1 0-1.4Z" />
      )}
    </svg>
  );
}

/**
 * Full-screen photo viewer built on the native modal <dialog>: the browser keeps keyboard focus
 * inside it, makes the page behind it inert, and closes it with Escape. Arrow keys, Home and
 * End move between images; on touch screens a horizontal swipe does the same. Focus returns to
 * the element that opened it.
 */
export function PhotoViewer({
  images,
  index,
  onIndexChange,
  onClose,
  title,
  photoLabel,
}: PhotoViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const currentThumbRef = useRef<HTMLButtonElement>(null);
  const open = index !== null && images.length > 0;
  const total = images.length;
  const current = open ? Math.min(index, total - 1) : 0;
  const image = images[current];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      // The page behind the viewer should not scroll while it is open.
      document.documentElement.style.overflow = "hidden";
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (open) currentThumbRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [open, current]);

  function handleClosed() {
    document.documentElement.style.overflow = "";
    onClose();
    returnFocusRef.current?.focus();
  }

  function go(delta: number) {
    onIndexChange(stepImageIndex(current, delta, total));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "ArrowRight") go(1);
    else if (event.key === "ArrowLeft") go(-1);
    else if (event.key === "Home") onIndexChange(0);
    else if (event.key === "End") onIndexChange(total - 1);
    else return;
    event.preventDefault();
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    swipeStartRef.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || total < 2) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      go(dx < 0 ? 1 : -1);
    }
  }

  const position = formatImagePosition(current, total);
  const label = image && isIllustration(image) ? ILLUSTRATION_LABEL : (photoLabel ?? null);

  return (
    <dialog
      ref={dialogRef}
      aria-label={`სურათები: ${title}`}
      onClose={handleClosed}
      onKeyDown={handleKeyDown}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-navy-900 p-0 text-white backdrop:bg-navy-900/80"
    >
      {open && image && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <p className="min-w-0 truncate text-sm">
              <span className="font-semibold tabular-nums">{position}</span>
              <span className="text-white/70"> · {title}</span>
            </p>
            <button
              type="button"
              autoFocus
              onClick={() => dialogRef.current?.close()}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold transition-colors hover:bg-white/20 focus-visible:outline-white"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-current">
                <path d="M5.3 5.3a1 1 0 0 1 1.4 0L10 8.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 10l3.3 3.3a1 1 0 0 1-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 10 5.3 6.7a1 1 0 0 1 0-1.4Z" />
              </svg>
              დახურვა
            </button>
          </div>

          <div
            className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center px-2 sm:px-20"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => (swipeStartRef.current = null)}
          >
            {/* Size container: the 4:3 image takes the largest size that fits both dimensions. */}
            <div className="flex h-full w-full items-center justify-center [container-type:size]">
              <ListingImageView
                key={image.id}
                image={image}
                fit="contain"
                label={label}
                className="aspect-[4/3] w-[min(100cqw,calc(100cqh*4/3))] rounded-xl"
              />
            </div>
            {total > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="წინა სურათი"
                  className="absolute left-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-navy shadow-card transition-colors hover:bg-white sm:left-5 sm:h-12 sm:w-12"
                >
                  <ArrowIcon direction="left" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="შემდეგი სურათი"
                  className="absolute right-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-navy shadow-card transition-colors hover:bg-white sm:right-5 sm:h-12 sm:w-12"
                >
                  <ArrowIcon direction="right" />
                </button>
              </>
            )}
          </div>

          <p className="px-4 py-2 text-center text-sm text-white/85">
            {image.caption ?? image.alt}
          </p>
          <p aria-live="polite" className="sr-only">
            სურათი {position}: {image.caption ?? image.alt}
          </p>

          {total > 1 && (
            <ul
              aria-label="ყველა სურათი"
              className="mx-auto flex max-w-full gap-2 overflow-x-auto px-4 py-3 [@media(max-height:480px)]:hidden"
            >
              {images.map((thumb, thumbIndex) => (
                <li key={thumb.id} className="shrink-0">
                  <button
                    ref={thumbIndex === current ? currentThumbRef : undefined}
                    type="button"
                    onClick={() => onIndexChange(thumbIndex)}
                    aria-label={`სურათი ${formatImagePosition(thumbIndex, total)}: ${thumb.caption ?? thumb.alt}`}
                    aria-current={thumbIndex === current ? "true" : undefined}
                    className={`block overflow-hidden rounded-lg ring-2 transition-opacity ${
                      thumbIndex === current
                        ? "opacity-100 ring-white"
                        : "opacity-60 ring-transparent hover:opacity-90"
                    }`}
                  >
                    <ListingImageView image={thumb} label={null} className="h-12 w-16" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </dialog>
  );
}
