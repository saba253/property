"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ListingImageView, NoImagesPlaceholder } from "@/components/gallery/listing-image";
import { CompareButton } from "@/components/compare/compare-button";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { DemoBadge } from "@/components/properties/demo-label";
import { PRECISION_LABELS } from "@/lib/geo/location";
import {
  type MapListing,
  type MarkerGroup,
  countMappable,
  formatListingCount,
  groupMapMarkers,
} from "@/lib/map/map-listings";

function MapPlaceholder({ failed }: { failed: boolean }) {
  return (
    <div
      role="status"
      className="flex h-full w-full items-center justify-center bg-cream p-6 text-center text-sm text-muted"
    >
      {failed ? "რუქა ვერ ჩაიტვირთა. განცხადებები ხელმისაწვდომია სიაში." : "რუქა იტვირთება…"}
    </div>
  );
}

// Leaflet needs the browser, and the map is not needed for the first paint: load it lazily,
// only in map view, and never on the server.
const ListingsMap = dynamic(() => import("@/components/map/listings-map"), {
  ssr: false,
  loading: ({ error }) => <MapPlaceholder failed={Boolean(error)} />,
});

function PinIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={`${className} fill-current`}>
      <path d="M10 2a6 6 0 0 0-6 6c0 4.2 5.2 9.4 5.4 9.6a.8.8 0 0 0 1.2 0C10.8 17.4 16 12.2 16 8a6 6 0 0 0-6-6Zm0 8.2A2.2 2.2 0 1 1 10 5.8a2.2 2.2 0 0 1 0 4.4Z" />
    </svg>
  );
}

function PrecisionNote({ listing }: { listing: MapListing }) {
  const tone =
    listing.precision === "unknown"
      ? "text-subtle"
      : listing.precision === "approximate"
        ? "text-sand-700"
        : "text-accent-700";
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${tone}`}>
      <PinIcon />
      {PRECISION_LABELS[listing.precision]}
    </span>
  );
}

function ListingThumb({ listing, className }: { listing: MapListing; className: string }) {
  return listing.coverImage ? (
    <ListingImageView image={listing.coverImage} decorative label={null} className={className} />
  ) : (
    <NoImagesPlaceholder compact className={className} />
  );
}

/** Compact result row for the map view: summary link plus a "show on map" action. */
function ResultRow({
  listing,
  selected,
  onShowOnMap,
  onHighlight,
}: {
  listing: MapListing;
  selected: boolean;
  onShowOnMap: (key: string) => void;
  onHighlight: (key: string | null) => void;
}) {
  const key = listing.position?.groupKey ?? null;
  return (
    <li
      onMouseEnter={() => onHighlight(key)}
      onMouseLeave={() => onHighlight(null)}
      onFocus={() => onHighlight(key)}
      onBlur={() => onHighlight(null)}
      className={`rounded-card border bg-surface p-2 transition-colors ${
        selected ? "border-navy ring-1 ring-navy" : "border-line hover:border-line-strong"
      }`}
    >
      <Link href={listing.href} className="flex gap-3 rounded-xl">
        <div className="relative shrink-0">
          <ListingThumb listing={listing} className="h-20 w-28 rounded-xl sm:h-24 sm:w-32" />
          <DemoBadge className="absolute top-1.5 left-1.5 scale-90" />
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          <p className="text-[11px] font-semibold tracking-wide text-accent-700">
            {listing.transactionLabel} · {listing.propertyTypeLabel}
          </p>
          <p className="mt-0.5 text-base font-bold text-ink">{listing.priceText}</p>
          {listing.pricePerSqmText && (
            <p className="text-xs font-medium text-accent-700">{listing.pricePerSqmText}</p>
          )}
          <p className="mt-0.5 truncate text-sm text-navy">{listing.title}</p>
          <p className="truncate text-xs text-muted">{listing.facts.join(" · ")}</p>
        </div>
      </Link>
      <p className="mt-1.5 truncate px-1 text-xs text-muted">
        {listing.place} · <PrecisionNote listing={listing} />
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 px-1">
        <CompareButton listingId={listing.id} title={listing.title} />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {key && (
            <button
              type="button"
              onClick={() => onShowOnMap(key)}
              aria-label={`რუქაზე ჩვენება: ${listing.title}`}
              className="inline-flex h-9 items-center gap-1 rounded-full border border-line-strong px-3 text-xs font-semibold text-navy transition-colors hover:border-navy"
            >
              <PinIcon />
              რუქაზე
            </button>
          )}
          <FavoriteButton listingId={listing.id} title={listing.title} variant="compact" />
        </div>
      </div>
    </li>
  );
}

/** Preview of the selected marker: one or several listings that share the position. */
function MarkerPreview({
  group,
  listings,
  onClose,
}: {
  group: MarkerGroup;
  listings: readonly MapListing[];
  onClose: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [group.key]);

  return (
    <section
      aria-labelledby="map-preview-heading"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      className="absolute right-3 bottom-3 left-3 z-[1001] flex max-h-[70%] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card-hover sm:right-auto sm:w-[24rem]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h3
            ref={headingRef}
            tabIndex={-1}
            id="map-preview-heading"
            className="text-sm font-semibold text-navy outline-none"
          >
            {group.listingIds.length > 1
              ? formatListingCount(group.listingIds.length)
              : "განცხადება"}{" "}
            · {group.place}
          </h3>
          {group.precision === "approximate" && (
            <p className="mt-0.5 text-xs text-sand-700">
              მიახლოებითი მდებარეობა: ნაჩვენებია უბნის ცენტრი, არა შენობა.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="გადახედვის დახურვა"
          className="-mt-1 -mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-navy transition-colors hover:bg-cream"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-current">
            <path d="M5.3 5.3a1 1 0 0 1 1.4 0L10 8.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 10l3.3 3.3a1 1 0 0 1-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 10 5.3 6.7a1 1 0 0 1 0-1.4Z" />
          </svg>
        </button>
      </div>
      <ul className="divide-y divide-line overflow-y-auto">
        {listings.map((listing) => (
          <li key={listing.id} className="relative">
            <Link
              href={listing.href}
              className="flex gap-3 py-3 pr-14 pl-4 transition-colors hover:bg-cream/70"
            >
              <div className="relative shrink-0">
                <ListingThumb listing={listing} className="h-16 w-24 rounded-lg" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-accent-700">
                  დემო · {listing.transactionLabel} · {listing.propertyTypeLabel}
                </p>
                <p className="text-base font-bold text-ink">{listing.priceText}</p>
                {listing.pricePerSqmText && (
                  <p className="text-xs font-medium text-accent-700">{listing.pricePerSqmText}</p>
                )}
                <p className="truncate text-sm text-navy">{listing.title}</p>
                <p className="truncate text-xs text-muted">{listing.facts.join(" · ")}</p>
                <p className="mt-1 text-xs font-semibold text-accent-700">განცხადების ნახვა →</p>
              </div>
            </Link>
            {/* Next to the link, not inside it: saving never opens the listing. */}
            <FavoriteButton
              listingId={listing.id}
              title={listing.title}
              variant="compact"
              className="absolute top-3 right-3"
            />
            <div className="px-4 pb-3">
              <CompareButton listingId={listing.id} title={listing.title} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

type MapResultsProps = {
  listings: readonly MapListing[];
};

/**
 * Map view of the search results: a compact list and a lazily loaded map, side by side on wide
 * screens and stacked (map first, then the full list) on phones. Both show exactly the listings
 * the server filtered; the map never filters on its own.
 */
export function MapResults({ listings }: MapResultsProps) {
  const groups = useMemo(() => groupMapMarkers(listings), [listings]);
  const { mapped, unmapped } = countMappable(listings);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const mapAreaRef = useRef<HTMLDivElement>(null);

  // A selection that no longer exists in the results (after filtering) is dropped.
  const selectedGroup = groups.find((group) => group.key === selectedKey) ?? null;

  const select = useCallback((key: string) => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedKey(key);
  }, []);

  const showOnMap = useCallback(
    (key: string) => {
      select(key);
      mapAreaRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
    [select],
  );

  const close = useCallback(() => {
    setSelectedKey(null);
    const target = returnFocusRef.current;
    if (target?.isConnected) target.focus();
  }, []);

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
      <div className="order-2 min-w-0 lg:order-1">
        <div className="mb-3 space-y-1 text-sm">
          <p className="text-muted">
            რუქაზე: <span className="font-semibold text-ink">{formatListingCount(mapped)}</span>
            {unmapped > 0 && (
              <>
                {" "}
                · მდებარეობის გარეშე: <span className="font-semibold text-ink">
                  {unmapped}
                </span>{" "}
                (მხოლოდ სიაში)
              </>
            )}
          </p>
        </div>
        <ul aria-label="შედეგების სია" className="space-y-3">
          {listings.map((listing) => (
            <ResultRow
              key={listing.id}
              listing={listing}
              selected={
                listing.position !== null && listing.position.groupKey === selectedGroup?.key
              }
              onShowOnMap={showOnMap}
              onHighlight={setHighlightedKey}
            />
          ))}
        </ul>
      </div>

      <div
        ref={mapAreaRef}
        className="relative order-1 h-[60vh] min-h-[22rem] overflow-hidden rounded-card border border-line bg-cream lg:sticky lg:top-20 lg:order-2 lg:h-[calc(100dvh-6.5rem-var(--compare-tray-space,0px))] lg:min-h-[28rem]"
      >
        <ListingsMap
          groups={groups}
          selectedKey={selectedGroup?.key ?? null}
          highlightedKey={highlightedKey}
          onSelect={select}
          label="განცხადებების რუქა"
        />

        <p className="pointer-events-none absolute top-3 left-14 z-[1000] inline-flex max-w-[calc(100%-4.5rem)] items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs text-navy shadow-card">
          <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3 shrink-0 text-sand-700">
            <circle
              cx="6"
              cy="6"
              r="4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeDasharray="2 1.6"
            />
          </svg>
          <span className="truncate">წყვეტილი ჩარჩო — მიახლოებითი მდებარეობა (უბანი)</span>
        </p>

        {groups.length === 0 && (
          <p
            role="status"
            className="absolute inset-x-6 top-1/2 z-[1000] -translate-y-1/2 rounded-card bg-white/95 p-4 text-center text-sm text-navy shadow-card"
          >
            {listings.length === 0
              ? "ამ ფილტრებით განცხადება ვერ მოიძებნა."
              : "ნაპოვნ განცხადებებს რუქაზე საჩვენებელი მდებარეობა არ აქვს. ისინი სიაშია."}
          </p>
        )}

        {selectedGroup && (
          <MarkerPreview
            group={selectedGroup}
            listings={listings.filter((listing) => selectedGroup.listingIds.includes(listing.id))}
            onClose={close}
          />
        )}
      </div>
    </div>
  );
}
