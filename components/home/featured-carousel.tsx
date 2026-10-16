"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

/*
 * Horizontal carousel for the homepage's featured listings. Native scrolling with snap points,
 * so touch swipes, trackpads and the keyboard (the focusable track scrolls with the arrow keys)
 * work without extra code; the arrow buttons scroll by one page of cards. No autoplay. Without
 * JavaScript the list still scrolls. Smooth scrolling only when the visitor allows motion.
 */

function Arrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5 fill-current">
      {direction === "left" ? (
        <path d="M12.7 4.3a1 1 0 0 1 0 1.4L8.4 10l4.3 4.3a1 1 0 0 1-1.4 1.4l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 0Z" />
      ) : (
        <path d="M7.3 15.7a1 1 0 0 1 0-1.4l4.3-4.3-4.3-4.3a1 1 0 0 1 1.4-1.4l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4 0Z" />
      )}
    </svg>
  );
}

const arrowButton =
  "inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-surface text-navy shadow-card transition-colors hover:border-navy disabled:cursor-default disabled:opacity-40 disabled:hover:border-line-strong";

export function FeaturedCarousel({
  label,
  count,
  children,
}: {
  /** Accessible name of the carousel (the section heading's text). */
  label: string;
  count: number;
  /** One <li> per card (rendered on the server). */
  children?: ReactNode;
}) {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: count <= 1 });

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 4,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  function scrollByPage(direction: 1 | -1) {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <div role="region" aria-roledescription="კარუსელი" aria-label={label} className="relative">
      <div className="mb-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => scrollByPage(-1)}
          disabled={edges.start}
          aria-label="წინა განცხადებები"
          className={arrowButton}
        >
          <Arrow direction="left" />
        </button>
        <button
          type="button"
          onClick={() => scrollByPage(1)}
          disabled={edges.end}
          aria-label="შემდეგი განცხადებები"
          className={arrowButton}
        >
          <Arrow direction="right" />
        </button>
      </div>
      <ul
        ref={track}
        tabIndex={0}
        aria-label={`${label}: გადაახვიეთ ჰორიზონტალურად`}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-6 overflow-x-auto overscroll-x-contain px-4 pt-2 pb-4 [scrollbar-width:thin] focus-visible:outline-offset-4 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:scroll-px-0 lg:px-0"
      >
        {children}
      </ul>
    </div>
  );
}
