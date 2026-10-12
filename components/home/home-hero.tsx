import Link from "next/link";
import { HeroIllustration } from "@/components/home/hero-illustration";
import { pageContainer } from "@/components/ui/styles";
import { MAX_SEARCH_QUERY_LENGTH } from "@/lib/search/parse-search-query";

const EXAMPLES: readonly { text: string; transaction?: "rent" }[] = [
  { text: "თბილისი 2 ოთახი" },
  { text: "ვაკე" },
  { text: "100000 დოლარამდე" },
  { text: "ბათუმი ბინა ქირით", transaction: "rent" },
];

const TABS: readonly { value: "sale" | "rent"; label: string }[] = [
  { value: "sale", label: "ყიდვა" },
  { value: "rent", label: "ქირაობა" },
];

function exampleHref(example: (typeof EXAMPLES)[number]): string {
  const params = new URLSearchParams({ q: example.text });
  if (example.transaction) params.set("transaction", example.transaction);
  return `/properties?${params.toString()}`;
}

/**
 * Search-first homepage hero: Buy/Rent choice and one large free-text search bar over an
 * original illustrated background. It is a plain GET form to /properties (works without
 * JavaScript); the listings page parses `q` with the rule-based search parser and shows what it
 * understood.
 */
export function HomeHero() {
  return (
    <section className="relative isolate overflow-hidden bg-navy">
      <HeroIllustration className="absolute inset-0 -z-10 h-full w-full" />
      {/* Overlay keeps the white text and the search bar clearly readable on the illustration. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-b from-navy/60 via-navy/30 to-navy/45"
      />

      <div className={`${pageContainer} py-14 sm:py-24 lg:py-28`}>
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
            იპოვე შენი შემდეგი სახლი
          </h1>
          <p className="mt-3 text-base text-white/85 sm:text-lg">
            ყველა განცხადებაზე — ფასი კვადრატულ მეტრზე ავტომატურად.
          </p>

          <form action="/properties" method="get" role="search" className="mt-8">
            <fieldset>
              <legend className="sr-only">რას ეძებთ: ყიდვა თუ ქირაობა?</legend>
              <div className="inline-flex rounded-full bg-navy/50 p-1 ring-1 ring-white/20 backdrop-blur">
                {TABS.map((tab) => (
                  <label
                    key={tab.value}
                    className="cursor-pointer rounded-full px-5 py-2 text-base font-semibold text-white transition-colors hover:bg-white/10 has-checked:bg-white has-checked:text-navy has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-white"
                  >
                    <input
                      type="radio"
                      name="transaction"
                      value={tab.value}
                      defaultChecked={tab.value === "sale"}
                      className="sr-only"
                    />
                    {tab.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mx-auto mt-4 flex items-center gap-2 rounded-full bg-surface p-1.5 text-left shadow-2xl ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-accent-500">
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="ml-3 hidden h-5 w-5 shrink-0 fill-subtle sm:block"
              >
                <path d="M8.5 2a6.5 6.5 0 0 1 5.18 10.43l3.95 3.94a1 1 0 0 1-1.42 1.42l-3.94-3.95A6.5 6.5 0 1 1 8.5 2Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z" />
              </svg>
              <label htmlFor="home-search" className="sr-only">
                ძიება ქალაქით, უბნით, ოთახებით ან ფასით
              </label>
              <input
                id="home-search"
                name="q"
                type="search"
                maxLength={MAX_SEARCH_QUERY_LENGTH}
                autoComplete="off"
                placeholder="მოძებნე ქალაქით, უბნით, ოთახებით ან ფასით..."
                className="h-12 min-w-0 flex-1 bg-transparent px-3 text-base text-ink outline-none placeholder:text-subtle sm:px-1 sm:text-lg"
              />
              <button
                type="submit"
                className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-navy px-5 text-base font-semibold text-white transition-colors hover:bg-navy-900 sm:px-7"
              >
                <svg
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                  className="h-5 w-5 fill-current sm:hidden"
                >
                  <path d="M8.5 2a6.5 6.5 0 0 1 5.18 10.43l3.95 3.94a1 1 0 0 1-1.42 1.42l-3.94-3.95A6.5 6.5 0 1 1 8.5 2Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z" />
                </svg>
                <span className="sr-only sm:not-sr-only">ძიება</span>
              </button>
            </div>
          </form>

          <p className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-white/80">
            <span>მაგალითად:</span>
            {EXAMPLES.map((example) => (
              <Link
                key={example.text}
                href={exampleHref(example)}
                className="rounded-full bg-white/10 px-3 py-1 text-white ring-1 ring-white/20 transition-colors hover:bg-white/20"
              >
                {example.text}
              </Link>
            ))}
          </p>

          <p className="mt-6 text-xs text-white/70">
            დემო რეჟიმი: ყველა განცხადება და ფასი გამოგონილია.
          </p>
        </div>
      </div>

      <span className="absolute right-3 bottom-3 rounded-full bg-navy/60 px-2.5 py-1 text-[11px] text-white/80">
        ილუსტრაცია
      </span>
    </section>
  );
}
