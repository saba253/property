const features = [
  {
    id: "search",
    title: "ქონების ძიება",
    description:
      "მოძებნეთ ქონება ძირითადი პარამეტრებით: მდებარეობა, ფართი, ოთახების რაოდენობა და ფასი.",
  },
  {
    id: "comparison",
    title: "ფასების შედარება",
    description:
      "შეადარეთ განცხადებაში მითითებული ფასი, მსგავსი აქტიური განცხადებების ფასებს. ეს არის ორიენტირებული და არა დადასტურებული გარიგების ფასი ან საბოლოო სამართლიანი ღირებულება.",
  },
  {
    id: "calculators",
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
  return (
    <div className="flex flex-1 flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          {/* Temporary text logo. The final name and logo are not decided yet. */}
          <a href="#top" className="text-lg font-bold tracking-tight text-slate-900">
            Property Intelligence
          </a>

          <nav aria-label="მთავარი ნავიგაცია" className="hidden items-center gap-6 md:flex">
            <a href="#features" className="text-sm text-slate-600 hover:text-slate-900">
              შესაძლებლობები
            </a>
            <a href="#principles" className="text-sm text-slate-600 hover:text-slate-900">
              ჩვენი პრინციპები
            </a>
          </nav>

          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
            მუშავდება
          </span>
        </div>
      </header>

      <div className="border-b border-amber-200 bg-amber-50">
        <p className="mx-auto max-w-6xl px-4 py-3 text-sm text-amber-900 sm:px-6">
          პლატფორმა შემუშავების პროცესშია. რეალური განცხადებები და მონაცემები ჯერ არ არის
          ხელმისაწვდომი.
        </p>
      </div>

      <main id="top" className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
              უკეთ გაიგეთ უძრავი ქონების ფასი გადაწყვეტილების მიღებამდე
            </h1>

            <p className="mt-6 text-lg leading-8 text-slate-600">
              ჩვენი მიზანია, დაგეხმაროთ უძრავი ქონების შედარებასა და განცხადებებში მითითებული
              ფასების გაგებაში და არა მხოლოდ განცხადებების დათვალიერებაში.
            </p>

            <div className="mt-8">
              <a
                href="#features"
                className="inline-flex h-12 items-center justify-center rounded-full bg-slate-900 px-6 text-base font-medium text-white transition-colors hover:bg-slate-700"
              >
                იხილეთ დაგეგმილი შესაძლებლობები
              </a>
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-4 border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              დაგეგმილი შესაძლებლობები
            </h2>

            <p className="mt-3 max-w-2xl text-slate-600">
              ქვემოთ ჩამოთვლილი შესაძლებლობები ჯერ შემუშავების პროცესშია და ამჟამად არ მუშაობს.
            </p>

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {features.map((feature) => (
                <article
                  key={feature.id}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-6"
                >
                  <span className="w-fit rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                    მალე
                  </span>

                  <h3 className="mt-4 text-xl font-semibold">{feature.title}</h3>

                  <p className="mt-3 leading-7 text-slate-600">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="principles" className="scroll-mt-4 border-t border-slate-200">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              გამჭვირვალობა მონაცემებთან მიმართებით
            </h2>

            <ul className="mt-6 max-w-3xl space-y-3">
              {principles.map((principle) => (
                <li key={principle} className="flex gap-3 leading-7 text-slate-700">
                  <span
                    aria-hidden="true"
                    className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-900"
                  />
                  <span>{principle}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-slate-500 sm:px-6">
          პლატფორმა შემუშავების პროცესშია. შინაარსი ინფორმაციული ხასიათისაა და არ წარმოადგენს
          საინვესტიციო ან იურიდიულ რჩევას.
        </p>
      </footer>
    </div>
  );
}
