import Link from "next/link";
import { pageNumbers } from "@/lib/properties/listing-page";

/**
 * Compact previous/next navigation with page numbers. Plain links (they work without
 * JavaScript and with Back/Forward); no client code. On phones only "გვერდი X / Y" is shown
 * between the arrows. When only a lower bound of the total is known, the last page is not shown.
 */
export function Pagination({
  page,
  lastPage,
  hasNextPage,
  hrefFor,
}: {
  page: number;
  lastPage: number | null;
  hasNextPage: boolean;
  hrefFor: (page: number) => string;
}) {
  if (page === 1 && !hasNextPage) return null;
  const pill =
    "inline-flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm font-medium";
  const arrow = (direction: "prev" | "next", target: number | null) => {
    const label = direction === "prev" ? "წინა გვერდი" : "შემდეგი გვერდი";
    const icon = direction === "prev" ? "←" : "→";
    return target === null ? (
      <span aria-hidden="true" className={`${pill} text-subtle`}>
        {icon}
      </span>
    ) : (
      <Link
        href={hrefFor(target)}
        rel={direction}
        aria-label={label}
        className={`${pill} border border-line-strong bg-surface text-navy hover:border-navy`}
      >
        {icon}
      </Link>
    );
  };

  return (
    <nav aria-label="შედეგების გვერდები" className="mt-10 flex items-center justify-center gap-1.5">
      {arrow("prev", page > 1 ? page - 1 : null)}
      <span className="px-2 text-sm text-muted sm:hidden">
        გვერდი {page}
        {lastPage !== null && ` / ${lastPage}`}
      </span>
      <ol className="hidden items-center gap-1.5 sm:flex">
        {pageNumbers(page, lastPage).map((item, index) =>
          item === null ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-subtle">
              …
            </li>
          ) : (
            <li key={item}>
              {item === page ? (
                <span aria-current="page" className={`${pill} bg-navy text-white`}>
                  {item}
                </span>
              ) : (
                <Link
                  href={hrefFor(item)}
                  aria-label={`გვერდი ${item}`}
                  className={`${pill} text-navy hover:bg-cream`}
                >
                  {item}
                </Link>
              )}
            </li>
          ),
        )}
      </ol>
      {arrow("next", hasNextPage ? page + 1 : null)}
    </nav>
  );
}
