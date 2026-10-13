"use client";

import "leaflet/dist/leaflet.css";
import "@/components/map/listings-map.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { AREA_ZOOM, MAP_TILES } from "@/lib/map/tiles";
import {
  type MarkerGroup,
  clusterByPixels,
  describeCluster,
  getInitialBounds,
  markersSignature,
} from "@/lib/map/map-listings";

export type ListingsMapProps = {
  groups: readonly MarkerGroup[];
  selectedKey: string | null;
  highlightedKey: string | null;
  onSelect: (key: string) => void;
  /** Accessible name of the map region. */
  label: string;
};

/** Escapes text for the marker HTML (Leaflet divIcons take an HTML string). */
function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}

// A small dashed circle in front of the label marks an approximate (area-level) position.
const APPROX_ICON =
  '<svg class="pi-marker__approx" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 1.6"/></svg>';

function icon(label: string, approximate: boolean, cluster: boolean): L.DivIcon {
  const classes = ["pi-marker"];
  if (approximate) classes.push("pi-marker--approximate");
  if (cluster) classes.push("pi-marker--cluster");
  return L.divIcon({
    className: classes.join(" "),
    html: `<span class="pi-marker__label" aria-hidden="true">${approximate ? APPROX_ICON : ""}${escapeHtml(label)}</span>`,
    iconSize: undefined,
  });
}

/** Makes a marker element an accessible button that reacts to Enter and Space. */
function makeButton(marker: L.Marker, name: string, activate: () => void) {
  marker.on("add", () => {
    const element = marker.getElement();
    if (!element) return;
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", name);
    element.removeAttribute("title");
    element.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        activate();
      }
    });
  });
  // Leaflet fires "click" for mouse and touch; keys are handled above (preventDefault also stops
  // Leaflet's own keypress handling, so a key never activates twice).
  marker.on("click", activate);
}

/**
 * Interactive Leaflet map with one price marker per marker group. Markers that would overlap at
 * the current zoom are shown as one "N განცხადება" cluster that zooms in when activated. The map
 * is created once; markers are redrawn only when the results or the zoom change, and selection
 * only toggles CSS classes. Panning and zooming never filter the results.
 */
export default function ListingsMap({
  groups,
  selectedKey,
  highlightedKey,
  onSelect,
  label,
}: ListingsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  /** Individually shown markers, by group key (groups inside a cluster are not here). */
  const markersRef = useRef(new Map<string, L.Marker>());
  const groupsRef = useRef(groups);
  const selectedRef = useRef(selectedKey);
  const highlightedRef = useRef(highlightedKey);
  const onSelectRef = useRef(onSelect);
  const renderRef = useRef<() => void>(() => {});
  const [tilesFailed, setTilesFailed] = useState(false);
  const signature = markersSignature(groups);

  useEffect(() => {
    onSelectRef.current = onSelect;
    groupsRef.current = groups;
    selectedRef.current = selectedKey;
    highlightedRef.current = highlightedKey;
  });

  /** Selection and hover highlight only change classes and stacking order. */
  function applyState() {
    for (const [key, marker] of markersRef.current) {
      const element = marker.getElement();
      const selected = key === selectedRef.current;
      const highlighted = key === highlightedRef.current;
      element?.classList.toggle("pi-marker--selected", selected);
      element?.classList.toggle("pi-marker--highlighted", highlighted);
      element?.setAttribute("aria-pressed", selected ? "true" : "false");
      marker.setZIndexOffset(selected ? 1000 : highlighted ? 500 : 0);
    }
  }

  /** Draws the markers for the current zoom, merging those that would overlap. */
  function renderMarkers() {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    markersRef.current.clear();

    const current = groupsRef.current;
    const byKey = new Map(current.map((group) => [group.key, group]));
    const clusters = clusterByPixels(
      current.map((group) => {
        const point = map.latLngToContainerPoint([group.point.lat, group.point.lng]);
        return { key: group.key, x: point.x, y: point.y };
      }),
    );

    for (const keys of clusters) {
      const members = keys.map((key) => byKey.get(key)!);
      const approximate = members.some((member) => member.precision === "approximate");
      if (members.length === 1) {
        const [group] = members;
        const marker = L.marker([group.point.lat, group.point.lng], {
          icon: icon(group.label, approximate, false),
          keyboard: true,
          riseOnHover: true,
        });
        makeButton(marker, group.accessibleName, () => onSelectRef.current(group.key));
        marker.addTo(layer);
        markersRef.current.set(group.key, marker);
        continue;
      }

      const bounds = L.latLngBounds(members.map((member) => [member.point.lat, member.point.lng]));
      const { label: clusterLabel, accessibleName } = describeCluster(members);
      const marker = L.marker(bounds.getCenter(), {
        icon: icon(clusterLabel, approximate, true),
        keyboard: true,
        riseOnHover: true,
      });
      makeButton(marker, accessibleName, () => {
        // Zoom so the cluster's members fill the map; they separate as far as the space allows.
        map.fitBounds(bounds, { padding: [72, 72], maxZoom: AREA_ZOOM + 3 });
      });
      marker.addTo(layer);
    }
    applyState();
  }

  useEffect(() => {
    renderRef.current = renderMarkers;
  });

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = L.map(container, {
      zoomControl: true,
      // Scrolling the page over the map must not zoom it; use the buttons, +/- or pinch.
      scrollWheelZoom: false,
      attributionControl: true,
    });
    map.attributionControl.setPrefix(
      '<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>',
    );
    map.zoomControl
      .getContainer()
      ?.querySelectorAll("a")
      .forEach((link) => {
        const text = link.classList.contains("leaflet-control-zoom-in")
          ? "მასშტაბის გადიდება"
          : "მასშტაბის შემცირება";
        link.setAttribute("aria-label", text);
        link.title = text;
      });

    let loadedTiles = 0;
    let failedTiles = 0;
    L.tileLayer(MAP_TILES.url, {
      attribution: MAP_TILES.attribution,
      maxZoom: MAP_TILES.maxZoom,
    })
      .on("tileload", () => {
        loadedTiles++;
        setTilesFailed(false);
      })
      .on("tileerror", () => {
        failedTiles++;
        if (loadedTiles === 0 && failedTiles >= 3) setTilesFailed(true);
      })
      .addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.on("zoomend", () => renderRef.current());
    const markers = markersRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markers.clear();
    };
  }, []);

  // When the results change: fit the view to them and redraw the markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = getInitialBounds(groupsRef.current);
    if (groupsRef.current.length === 1) {
      map.setView([bounds.south, bounds.west], AREA_ZOOM, { animate: false });
    } else {
      map.fitBounds(
        [
          [bounds.south, bounds.west],
          [bounds.north, bounds.east],
        ],
        { padding: [48, 48], maxZoom: AREA_ZOOM, animate: false },
      );
    }
    renderRef.current();
  }, [signature]);

  useEffect(() => {
    // applyState reads the latest selection from refs.
    applyState();
  }, [selectedKey, highlightedKey]);

  // Bring the selected marker into view; zoom in when it is inside a cluster.
  useEffect(() => {
    const map = mapRef.current;
    const group = groupsRef.current.find((item) => item.key === selectedKey);
    if (!map || !group) return;
    const point = L.latLng(group.point.lat, group.point.lng);
    if (!markersRef.current.has(group.key)) {
      map.setView(point, Math.max(map.getZoom() + 2, AREA_ZOOM));
    } else if (!map.getBounds().contains(point)) {
      map.panTo(point);
    }
  }, [selectedKey]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} role="region" aria-label={label} className="pi-map h-full w-full" />
      {tilesFailed && (
        <p
          role="status"
          className="absolute top-14 right-3 left-3 z-[1000] rounded-xl bg-white/95 px-3 py-2 text-sm text-navy shadow-card"
        >
          რუქის ფონი ვერ ჩაიტვირთა. ფასები და განცხადებები მაინც ხელმისაწვდომია, მათ შორის სიაში.
        </p>
      )}
    </div>
  );
}
