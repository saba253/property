import Link from "next/link";
import { HomeHero } from "@/components/home/home-hero";
import { ListingCard } from "@/components/properties/listing-card";
import { pageContainer } from "@/components/ui/styles";
import { DEFAULT_DISPLAY_CURRENCY } from "@/lib/currency/exchange-rate";
import { getExchangeRateState } from "@/lib/currency/get-exchange-rate";
import { getListingDisplayPrice } from "@/lib/pricing/display-price";
import { buildListingDetailHref } from "@/lib/properties/filter-chips";
import { getFeaturedSaleListings, getListingCovers } from "@/lib/data/listings";

const FEATURED_COUNT = 3;

const principles = [
  {
    title: "გამოგონილი დემო მონაცემები",
    text: "ამ ეტაპზე ყველა განცხადება, ფასი და ილუსტრაცია გამოგონილია და მკაფიოდ არის მონიშნული.",
  },
  {
    title: "ფასი მ²-ზე ავტომატურად",
    text: "გამოითვლება განცხადებაში მითითებული ფასით; ეს არ არის გარიგების დადასტურებული ფასი.",
  },
  {
    title: "ოფიციალური კურსი",
    text: "GEL-ში ჩვენება ეროვნული ბანკის კურსით ხდება; ორიგინალი ფასი და ვალუტა არ იცვლება.",
  },
];

export default async function Home() {
  const rateState = await getExchangeRateState();
  const featured = await getFeaturedSaleListings(FEATURED_COUNT);
  const covers = await getListingCovers(featured.map((item) => item.listing.id));

  return (
    <main id="top" className="flex-1">
      <HomeHero />

      <section aria-labelledby="featured-heading" className={`${pageContainer} py-12 sm:py-16`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="featured-heading" className="text-2xl font-bold tracking-tight text-navy">
              დემო განცხადებები
            </h2>
            <p className="mt-1 text-sm text-muted">
              ფასები ნაჩვენებია USD-ში; GEL-ზე გადართვა ძიების გვერდზეა შესაძლებელი.
            </p>
          </div>
          <Link
            href="/properties"
            className="text-sm font-semibold text-accent-700 transition-colors hover:text-navy"
          >
            ყველა განცხადება →
          </Link>
        </div>

        <ul className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((item) => (
            <li key={item.listing.id}>
              <ListingCard
                {...item}
                {...covers[item.listing.id]}
                price={getListingDisplayPrice(item, DEFAULT_DISPLAY_CURRENCY, rateState)}
                href={buildListingDetailHref(item.listing.id)}
              />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="principles-heading" className="border-t border-line bg-cream">
        <div className={`${pageContainer} py-10`}>
          <h2 id="principles-heading" className="sr-only">
            გამჭვირვალობა მონაცემებთან მიმართებით
          </h2>
          <ul className="grid gap-6 md:grid-cols-3">
            {principles.map((principle) => (
              <li key={principle.title} className="flex gap-3">
                <svg
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 fill-sand-500"
                >
                  <path d="M10 1.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17Zm3.7 5.8a1 1 0 0 0-1.4 0L9 10.6 7.7 9.3a1 1 0 1 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4a1 1 0 0 0 0-1.4Z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-navy">{principle.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted">{principle.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
