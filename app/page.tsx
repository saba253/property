import Link from "next/link";
import { DemoBadge } from "@/components/properties/demo-label";
import { ListingCard } from "@/components/properties/listing-card";
import { buttonPrimary, buttonSecondary, pageContainer } from "@/components/ui/styles";
import { getActiveDemoListingsWithProperties } from "@/lib/properties/get-demo-listing";

const features = [
  {
    id: "search",
    icon: "M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.25 4.24a1 1 0 0 1-1.42 1.42l-4.24-4.25A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z",
    title: "ქონების ძიება",
    description:
      "მოძებნეთ ქონება ძირითადი პარამეტრებით: მდებარეობა, ფართი, ოთახების რაოდენობა და ფასი.",
  },
  {
    id: "comparison",
    icon: "M5 20a1 1 0 0 1-1-1v-7a1 1 0 1 1 2 0v7a1 1 0 0 1-1 1Zm7 0a1 1 0 0 1-1-1V5a1 1 0 1 1 2 0v14a1 1 0 0 1-1 1Zm7 0a1 1 0 0 1-1-1v-4a1 1 0 1 1 2 0v4a1 1 0 0 1-1 1Z",
    title: "ფასების შედარება",
    description:
      "შეადარეთ განცხადებაში მითითებული ფასი, მსგავსი აქტიური განცხადებების ფასებს. ეს არის ორიენტირებული და არა დადასტურებული გარიგების ფასი ან საბოლოო სამართლიანი ღირებულება.",
  },
  {
    id: "calculators",
    icon: "M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 3v3h10V6H7Zm0 6v2h2v-2H7Zm4 0v2h2v-2h-2Zm4 0v2h2v-2h-2Zm-8 4v2h2v-2H7Zm4 0v2h2v-2h-2Zm4 0v2h2v-2h-2Z",
    title: "ფინანსური კალკულატორები",
    description:
      "შეაფასეთ ძირითადი მაჩვენებლები, მაგალითად ფასი კვადრატულ მეტრზე, USD და GEL ვალუტებისთვის.",
  },
];

const principles = [
  "ამ ეტაპზე საიტზე რეალური განცხადებები არ არის გამოქვეყნებული.",
  "დემო მონაცემები, თუ გამოჩნდება, მკაფიოდ იქნება მონიშნული როგორც დემო.",
  "შედარებები ეფუძნება განცხადებებში მითითებულ ფასებს და არა გარიგების დადასტურებულ ფასებს.",
];

export default function Home() {
  const [exampleListing] = getActiveDemoListingsWithProperties();

  return (
    <main id="top" className="flex-1">
      <div className="border-b border-amber-200 bg-amber-50">
        <p className={`${pageContainer} py-3 text-sm text-amber-900`}>
          პლატფორმა შემუშავების პროცესშია. რეალური განცხადებები და მონაცემები ჯერ არ არის
          ხელმისაწვდომი.
        </p>
      </div>

      <section className="bg-cream">
        <div className={`${pageContainer} grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-2`}>
          <div>
            <p className="flex items-center gap-3 text-sm font-semibold text-navy">
              <span aria-hidden="true" className="h-px w-8 bg-sand-500" />
              უძრავი ქონების გადაწყვეტილების მხარდაჭერა
            </p>
            <h1 className="mt-3 text-3xl leading-tight font-bold tracking-tight text-navy sm:text-5xl sm:leading-tight">
              უკეთ გაიგეთ უძრავი ქონების ფასი გადაწყვეტილების მიღებამდე
            </h1>

            <p className="mt-6 text-lg leading-8 text-muted">
              ჩვენი მიზანია, დაგეხმაროთ უძრავი ქონების შედარებასა და განცხადებებში მითითებული
              ფასების გაგებაში და არა მხოლოდ განცხადებების დათვალიერებაში.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/properties" className={buttonPrimary}>
                დემო განცხადებების ნახვა
              </Link>
              <a href="#features" className={buttonSecondary}>
                დაგეგმილი შესაძლებლობები
              </a>
            </div>
            <p className="mt-3 text-sm text-muted">
              დემო განცხადებები გამოგონილია და მხოლოდ პლატფორმის საჩვენებლადაა.
            </p>
          </div>

          {exampleListing && (
            <figure className="mx-auto w-full max-w-sm lg:max-w-md">
              <ListingCard {...exampleListing} />
              <figcaption className="mt-4 flex items-center gap-2 px-1 text-sm text-muted">
                <DemoBadge />
                დემო განცხადების მაგალითი ავტომატური ფასით მ²-ზე
              </figcaption>
            </figure>
          )}
        </div>
      </section>

      <section id="features" className="scroll-mt-20 bg-surface">
        <div className={`${pageContainer} py-16 sm:py-20`}>
          <h2 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">
            დაგეგმილი შესაძლებლობები
          </h2>

          <p className="mt-3 max-w-2xl text-muted">
            ქვემოთ ჩამოთვლილი შესაძლებლობები ჯერ შემუშავების პროცესშია და ამჟამად არ მუშაობს.
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.id} className="flex flex-col rounded-card bg-cream p-6">
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface ring-1 ring-sand-200">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-navy">
                      <path d={feature.icon} />
                    </svg>
                  </span>
                  <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted ring-1 ring-line">
                    მალე
                  </span>
                </div>

                <h3 className="mt-5 text-xl font-semibold text-navy">{feature.title}</h3>

                <p className="mt-3 leading-7 text-muted">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="principles" className="scroll-mt-20 bg-cream">
        <div className={`${pageContainer} py-16 sm:py-20`}>
          <h2 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">
            გამჭვირვალობა მონაცემებთან მიმართებით
          </h2>

          <ul className="mt-8 grid max-w-4xl gap-4 sm:grid-cols-3">
            {principles.map((principle) => (
              <li
                key={principle}
                className="flex gap-3 rounded-card border border-line bg-surface p-5 leading-7 text-ink"
              >
                <svg
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                  className="mt-1 h-5 w-5 shrink-0 fill-sand-500"
                >
                  <path d="M10 1.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17Zm3.7 5.8a1 1 0 0 0-1.4 0L9 10.6 7.7 9.3a1 1 0 1 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4a1 1 0 0 0 0-1.4Z" />
                </svg>
                <span>{principle}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
