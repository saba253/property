"use client";

import { type DragEvent, useEffect, useRef, useState } from "react";
import { fieldLabel } from "@/components/ui/styles";
import { MAX_PHOTO_ALT_LENGTH } from "@/lib/listing-draft/draft";
import {
  ACCEPTED_PHOTO_EXTENSIONS,
  ACCEPTED_PHOTO_TYPES,
  MAX_DRAFT_PHOTOS,
  checkPhotoFiles,
  describePhotoRejection,
  formatFileSize,
  type PhotoRejection,
} from "@/lib/listing-draft/draft-photos";
import { type PhotoView, photoErrorMessage } from "@/lib/photos/photo-types";

/*
 * Photos of a saved private draft, stored on the server. Files are checked in the browser for a
 * quick answer (type, size, count) and then sent one at a time as the raw request body; the
 * server checks and re-encodes everything again. A failed upload stays in the list with its
 * reason and a retry button; the form's other data is never touched. Order, cover and
 * descriptions are saved immediately. Images are loaded from the owner-only photo route.
 */

type QueueItem = {
  key: number;
  file: File;
  preview: string;
  status: "waiting" | "uploading" | "failed";
  progress: number;
  error?: string;
};

function send(
  url: string,
  method: string,
  body: XMLHttpRequestBodyInit | null,
  contentType: string | null,
  onProgress?: (fraction: number) => void,
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open(method, url);
    if (contentType) request.setRequestHeader("Content-Type", contentType);
    request.responseType = "json";
    if (onProgress) {
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      };
    }
    request.onload = () => resolve({ status: request.status, data: request.response });
    request.onerror = () => resolve({ status: 0, data: null });
    request.send(body);
  });
}

const errorOf = (result: { status: number; data: Record<string, unknown> | null }) =>
  photoErrorMessage(result.status === 0 ? "network" : (result.data?.error as string | undefined));

export function DraftPhotoManager({
  draftId,
  photos,
  onChange,
}: {
  draftId: string;
  photos: readonly PhotoView[];
  onChange: (photos: PhotoView[]) => void;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [rejections, setRejections] = useState<PhotoRejection[]>([]);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const nextKey = useRef(1);
  const queueRef = useRef<QueueItem[]>([]);
  const base = `/api/drafts/${draftId}/photos`;

  const pendingCount = queue.filter((item) => item.status !== "failed").length;
  const full = photos.length + pendingCount >= MAX_DRAFT_PHOTOS;

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  // Release the local previews when the component goes away.
  useEffect(
    () => () => {
      for (const item of queueRef.current) URL.revokeObjectURL(item.preview);
    },
    [],
  );

  // One upload at a time, in the order the files were chosen.
  const uploading = queue.some((item) => item.status === "uploading");
  const next = queue.find((item) => item.status === "waiting");
  useEffect(() => {
    if (uploading || !next) return;
    const item = next;
    const update = (patch: Partial<QueueItem>) =>
      setQueue((items) => items.map((i) => (i.key === item.key ? { ...i, ...patch } : i)));
    update({ status: "uploading", progress: 0 });
    void send(base, "POST", item.file, "application/octet-stream", (progress) =>
      update({ progress }),
    ).then((result) => {
      if (result.status === 201 && Array.isArray(result.data?.photos)) {
        onChange(result.data.photos as PhotoView[]);
        URL.revokeObjectURL(item.preview);
        setQueue((items) => items.filter((i) => i.key !== item.key));
        setMessage({ tone: "info", text: `ფოტო შენახულია: ${item.file.name}` });
      } else {
        update({ status: "failed", error: errorOf(result) });
      }
    });
  }, [uploading, next, base, onChange]);

  function addFiles(files: File[]) {
    const { accepted, rejected } = checkPhotoFiles(files, photos.length + pendingCount);
    setRejections(rejected);
    if (accepted.length === 0) return;
    setQueue((items) => [
      ...items,
      ...accepted.map((index) => ({
        key: nextKey.current++,
        file: files[index],
        preview: URL.createObjectURL(files[index]),
        status: "waiting" as const,
        progress: 0,
      })),
    ]);
  }

  function dropQueued(key: number) {
    setQueue((items) => {
      const item = items.find((i) => i.key === key);
      if (item) URL.revokeObjectURL(item.preview);
      return items.filter((i) => i.key !== key);
    });
  }

  async function change(body: object, done: string) {
    setBusy(true);
    const result = await send(base, "PATCH", JSON.stringify(body), "application/json");
    setBusy(false);
    if (result.status === 200 && Array.isArray(result.data?.photos)) {
      onChange(result.data.photos as PhotoView[]);
      setMessage({ tone: "info", text: done });
    } else {
      setMessage({ tone: "error", text: errorOf(result) });
    }
  }

  async function remove(id: string) {
    setConfirmDelete(null);
    setBusy(true);
    const result = await send(`${base}/${id}`, "DELETE", null, null);
    setBusy(false);
    if (result.status === 200 && Array.isArray(result.data?.photos)) {
      onChange(result.data.photos as PhotoView[]);
      setMessage({ tone: "info", text: "ფოტო წაიშალა." });
    } else {
      setMessage({ tone: "error", text: errorOf(result) });
    }
  }

  function move(index: number, delta: -1 | 1) {
    const order = photos.map((photo) => photo.id);
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    void change({ order }, `ფოტო გადატანილია ${target + 1}-ე ადგილზე.`);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (!full) addFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div className="space-y-5">
      <div
        role="note"
        className="rounded-2xl border border-line bg-cream px-4 py-3 text-sm leading-6 text-navy"
      >
        ფოტოები ინახება თქვენს პირად დრაფტში და მათ მხოლოდ თქვენ ხედავთ. ატვირთვისას ფაილიდან იშლება
        ფარული მონაცემები (კამერა, GPS მდებარეობა, თარიღი). ეს ნაბიჯი არასავალდებულოა.
      </div>

      <label
        onDragOver={(event) => {
          event.preventDefault();
          if (!full) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center gap-2 rounded-card border-2 border-dashed px-6 py-8 text-center transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent-500 ${
          full
            ? "cursor-not-allowed border-line bg-surface opacity-60"
            : dragging
              ? "cursor-pointer border-accent-500 bg-accent-50"
              : "cursor-pointer border-line-strong bg-surface hover:border-navy"
        }`}
      >
        <svg
          viewBox="0 0 48 48"
          aria-hidden="true"
          className="h-10 w-10 fill-none stroke-sand-500"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="6" y="10" width="36" height="28" rx="5" />
          <circle cx="17" cy="20" r="3.5" />
          <path d="m8 34 10-9 7 6 6-5 9 8" />
        </svg>
        <span className="text-base font-semibold text-navy">
          {full ? "ფოტოების ლიმიტი შევსებულია" : "აირჩიეთ ან ჩააგდეთ ფოტოები"}
        </span>
        <span className="text-sm text-muted">
          JPG, PNG ან WebP · თითო 10 მბ-მდე · მაქსიმუმ {MAX_DRAFT_PHOTOS} ფოტო
        </span>
        <input
          id="draft-photos"
          type="file"
          multiple
          disabled={full}
          accept={`${ACCEPTED_PHOTO_TYPES.join(",")},${ACCEPTED_PHOTO_EXTENSIONS}`}
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
          className="sr-only"
        />
      </label>

      {rejections.length > 0 && (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900">ზოგიერთი ფაილი არ დაემატა:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-900">
            {rejections.map((rejection, index) => (
              <li key={`${rejection.name}-${index}`}>{describePhotoRejection(rejection)}</li>
            ))}
          </ul>
        </div>
      )}

      <p
        aria-live="polite"
        className={`min-h-5 text-sm ${message?.tone === "error" ? "text-red-700" : "text-muted"}`}
      >
        {message?.text ??
          (photos.length > 0
            ? `შენახულია ${photos.length} / ${MAX_DRAFT_PHOTOS} ფოტო.`
            : "ფოტოები ჯერ არ არის დამატებული.")}
      </p>

      {queue.length > 0 && (
        <ul className="space-y-3" aria-label="ასატვირთი ფოტოები">
          {queue.map((item) => (
            <li
              key={item.key}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.preview}
                alt=""
                className="h-14 w-14 shrink-0 rounded-xl object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink" title={item.file.name}>
                  {item.file.name}{" "}
                  <span className="font-normal text-subtle">
                    · {formatFileSize(item.file.size)}
                  </span>
                </p>
                {item.status === "failed" ? (
                  <p className="mt-1 text-sm text-red-700">{item.error}</p>
                ) : (
                  <div className="mt-2">
                    <div
                      role="progressbar"
                      aria-label={`ატვირთვა: ${item.file.name}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(item.progress * 100)}
                      className="h-1.5 overflow-hidden rounded-full bg-line"
                    >
                      <div
                        className="h-full rounded-full bg-accent-500 transition-[width]"
                        style={{ width: `${Math.round(item.progress * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-subtle">
                      {item.status === "waiting"
                        ? "რიგშია…"
                        : item.progress >= 1
                          ? "მუშავდება…"
                          : `იტვირთება… ${Math.round(item.progress * 100)}%`}
                    </p>
                  </div>
                )}
              </div>
              {item.status === "failed" && (
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                  <SmallButton
                    label="თავიდან"
                    srLabel={`თავიდან ატვირთვა: ${item.file.name}`}
                    onClick={() =>
                      setQueue((items) =>
                        items.map((i) =>
                          i.key === item.key ? { ...i, status: "waiting", error: undefined } : i,
                        ),
                      )
                    }
                  />
                  <SmallButton
                    label="გაუქმება"
                    srLabel={`გაუქმება: ${item.file.name}`}
                    onClick={() => dropQueued(item.key)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {photos.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2" aria-label="შენახული ფოტოები">
          {photos.map((photo, index) => (
            <li
              key={photo.id}
              className="overflow-hidden rounded-2xl border border-line bg-surface"
            >
              <div className="relative aspect-[4/3] bg-cream">
                {/* Owner-only route; the browser sends the session cookie. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.alt || `განცხადების ფოტო ${index + 1}`}
                  width={photo.width}
                  height={photo.height}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                {photo.isCover && (
                  <span className="absolute top-3 left-3 rounded-full bg-navy px-2.5 py-1 text-xs font-semibold text-white">
                    მთავარი ფოტო
                  </span>
                )}
                <span className="absolute right-3 bottom-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-ink">
                  {index + 1} / {photos.length}
                </span>
              </div>
              <div className="space-y-3 p-3">
                <div>
                  <label htmlFor={`photo-alt-${photo.id}`} className={fieldLabel}>
                    ფოტოს აღწერა<span className="sr-only">: ფოტო {index + 1}</span>{" "}
                    <span className="font-normal text-subtle">(არასავალდებულო)</span>
                  </label>
                  <input
                    id={`photo-alt-${photo.id}`}
                    type="text"
                    defaultValue={photo.alt}
                    maxLength={MAX_PHOTO_ALT_LENGTH}
                    placeholder="მაგ. მისაღები ოთახი აივნით"
                    onBlur={(event) => {
                      const text = event.target.value.trim();
                      if (text !== photo.alt) {
                        void change({ alt: { id: photo.id, text } }, "აღწერა შენახულია.");
                      }
                    }}
                    className="h-10 w-full rounded-xl border border-line-strong bg-white px-3 text-sm text-ink placeholder:text-subtle focus:border-navy focus:outline-none"
                  />
                </div>
                {confirmDelete === photo.id ? (
                  <div
                    role="group"
                    aria-label="ფოტოს წაშლა"
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="text-sm text-muted">წავშალოთ ფოტო?</span>
                    <SmallButton
                      label="დიახ, წაშლა"
                      srLabel={`დიახ, წაშლა: ფოტო ${index + 1}`}
                      danger
                      disabled={busy}
                      onClick={() => void remove(photo.id)}
                    />
                    <SmallButton
                      label="არა"
                      srLabel="არა, არ წაიშალოს"
                      onClick={() => setConfirmDelete(null)}
                    />
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <SmallButton
                      label="← მარცხნივ"
                      srLabel={`მარცხნივ გადატანა: ფოტო ${index + 1}`}
                      disabled={busy || index === 0}
                      onClick={() => move(index, -1)}
                    />
                    <SmallButton
                      label="მარჯვნივ →"
                      srLabel={`მარჯვნივ გადატანა: ფოტო ${index + 1}`}
                      disabled={busy || index === photos.length - 1}
                      onClick={() => move(index, 1)}
                    />
                    {!photo.isCover && (
                      <SmallButton
                        label="მთავარად"
                        srLabel={`მთავარად დაყენება: ფოტო ${index + 1}`}
                        disabled={busy}
                        onClick={() => void change({ coverId: photo.id }, "მთავარი ფოტო შეიცვალა.")}
                      />
                    )}
                    <SmallButton
                      label="წაშლა"
                      srLabel={`წაშლა: ფოტო ${index + 1}`}
                      danger
                      disabled={busy}
                      onClick={() => setConfirmDelete(photo.id)}
                    />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SmallButton({
  label,
  srLabel,
  onClick,
  disabled = false,
  danger = false,
}: {
  label: string;
  srLabel: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={srLabel}
      className={`inline-flex h-10 items-center rounded-full border px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "border-red-200 text-red-700 hover:border-red-600"
          : "border-line-strong text-navy hover:border-navy"
      }`}
    >
      {label}
    </button>
  );
}
