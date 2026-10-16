"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { archiveDraftAction } from "@/app/account/listings/actions";

/** Removes a draft from "my listings" after a confirmation; it is archived, not destroyed. */
export function ArchiveDraftButton({ draftId, title }: { draftId: string; title: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`წაშლა: ${title}`}
        className="text-sm font-medium text-muted underline-offset-4 hover:text-navy hover:underline"
      >
        წაშლა
      </button>
    );
  }
  return (
    <span
      role="group"
      aria-label="წაშლის დადასტურება"
      className="inline-flex flex-wrap items-center gap-2 text-sm"
    >
      <span className="text-muted">წავშალოთ დრაფტი?</span>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const result = await archiveDraftAction(draftId).catch(() => ({ ok: false }));
          setPending(false);
          if (result.ok) router.refresh();
          else setFailed(true);
        }}
        className="font-semibold text-navy hover:underline"
      >
        დიახ
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-muted hover:underline"
      >
        არა
      </button>
      {failed && (
        <span role="alert" className="text-amber-900">
          ვერ მოხერხდა.
        </span>
      )}
    </span>
  );
}
