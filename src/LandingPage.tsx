export default function LandingPage(props: {
  onStartWriting?: () => void;
  onLogin?: () => void;
}) {
  const onStartWriting =
    props.onStartWriting ?? (() => (window.location.hash = "#/generate"));
  const onLogin = props.onLogin ?? (() => (window.location.hash = "#/login"));

  return (
    <div className="bg-background-light font-display text-text-main overflow-x-hidden">
      <div className="relative flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-50 flex items-center justify-between whitespace-nowrap border-b border-solid border-border-light bg-background-light/80 backdrop-blur-md px-4 py-3 md:px-10">
          <div className="flex items-center gap-4 text-text-main">
            <div className="size-8 text-primary">
              <span className="material-symbols-outlined !text-3xl">
                movie_filter
              </span>
            </div>
            <h2 className="text-lg font-bold leading-tight tracking-[-0.015em]">
              Life Reels
            </h2>
          </div>

          <div className="flex flex-1 justify-end gap-4 md:gap-8">
            <nav className="hidden md:flex items-center gap-9">
              <a
                className="text-text-muted hover:text-primary transition-colors text-sm font-medium leading-normal"
                href="#how-it-works"
              >
                How it Works
              </a>
              <a
                className="text-text-muted hover:text-primary transition-colors text-sm font-medium leading-normal"
                href="#showcase"
              >
                Showcase
              </a>
              <button
                type="button"
                className="text-text-muted hover:text-primary transition-colors text-sm font-medium leading-normal"
                onClick={onLogin}
              >
                Login
              </button>
            </nav>
            <button
              type="button"
              onClick={onStartWriting}
              className="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-10 px-6 bg-primary hover:bg-primary/90 transition-colors text-[#181411] text-sm font-bold leading-normal tracking-[0.015em]"
            >
              <span className="truncate">Start Writing</span>
            </button>
          </div>
        </header>

        <div className="flex flex-1 justify-center py-5">
          <div className="flex flex-col max-w-[1200px] flex-1 px-4 md:px-8">
            <section className="flex flex-col gap-10 py-10 lg:flex-row lg:items-center lg:py-20">
              <div className="flex flex-col gap-8 lg:w-1/2 lg:pr-10">
                <div className="flex flex-col gap-4 text-left">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border-light bg-white px-3 py-1 shadow-sm">
                    <span className="material-symbols-outlined text-primary text-sm">
                      auto_awesome
                    </span>
                    <span className="text-xs font-medium text-text-muted">
                      AI-Powered Storytelling
                    </span>
                  </div>

                  <h1 className="text-text-main text-4xl font-black leading-[1.1] tracking-[-0.033em] md:text-6xl">
                    Turn Your Daily{" "}
                    <span className="text-primary relative inline-block">
                      Stories{" "}
                      <span className="absolute bottom-1 left-0 w-full h-2 bg-primary/20 -z-10 rounded-full" />
                    </span>{" "}
                    into Cinematic Reels
                  </h1>

                  <p className="text-text-muted text-lg font-normal leading-relaxed md:text-xl">
                    The AI journaling companion that visualizes your memories.
                    Simply write about your day, and watch it transform into a
                    vibrant video instantly.
                  </p>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row">
                  <button
                    type="button"
                    onClick={onStartWriting}
                    className="flex h-12 min-w-[160px] cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-6 text-[#181411] text-base font-bold transition-transform hover:scale-105 shadow-lg shadow-primary/20"
                  >
                    <span className="material-symbols-outlined">edit_note</span>
                    <span className="truncate">Start Writing for Free</span>
                  </button>
                  <a
                    className="flex h-12 min-w-[160px] cursor-pointer items-center justify-center gap-2 rounded-full border border-border-light bg-white px-6 text-text-main text-base font-bold hover:bg-surface-light transition-colors shadow-sm"
                    href="#showcase"
                  >
                    <span className="material-symbols-outlined">
                      play_circle
                    </span>
                    <span className="truncate">Watch Demo</span>
                  </a>
                </div>

                <div className="flex items-center gap-4 pt-4">
                  <div className="flex -space-x-3">
                    {[
                      "https://lh3.googleusercontent.com/aida-public/AB6AXuBlT4kT4UAP9FeWlpQE3aKVKfJi8VkhWhl4GHsTGpEEvIG4YpF2I1vdUL-AtHN3c2etQFvrCFgOXyr3Lxlbq_fjpLq-ClC3Jg0x4b6H4VSlozjieH96Dx-xmVV3cW9g6HJhFCXskbM4nlQqRIpCR3KeS1L0qyYYvRqhFk_sVOi2cVvl8O0CUBHJ7cm19XOyQxriITx_J1klqicfI3lDNzOlTB1TTvaKGWJ09l4fTku2YjCDSPfw8vXmNS8k1ReyKiUqhvTlji3hECs",
                      "https://lh3.googleusercontent.com/aida-public/AB6AXuCB7N5OHId--N3LXXQE7k_xfOCkda-aUygDqMrp6mczM_-jEAlyLWSN2I6_LyjsbeaL38-XOG9bQfchpdLfrufEdMqLubTsK70ah1vkCvmZuuMwTdawJ5BHPv12uxejW1wU-SSSDCQm_1-AiCFK_xSq_Rx5jBBXzm4blxQoS4vB03dlTLc-KvoJxoPtDsqyCCsMvycea3T6ZSdvPaRI1bRCEEt8FFAtwRaDlIu_rkjvFHXS3gJSACAWbGr1wRxZTT5LgS0gmvhA-Lw",
                      "https://lh3.googleusercontent.com/aida-public/AB6AXuAD27bFMrvhbJVcb52NS5N4sMx0ngkRM35jZwwnO7UoZ29VuylbEiBrSmwHtMvLDFDYQO1PDNQENQwvJSQ8YBcVuv4bL5vpCdkvh41AbZPUnTrpNcjNnVSJCrC4u5D2xXgWYdbzRA2-C6--09xBNhhj62AZiapvqcr4xx19da7ZqT_PyW00WZQD0H-NzlDYXx4ny3OUxe-C69ywnqkJGHPN4h-h-4yBkKdEg89cLwLCpSZtGm_Mdtp5D4_TBV-YhkMjazawFQ_1UnI",
                    ].map((src) => (
                      <div
                        key={src}
                        className="h-10 w-10 rounded-full border-2 border-background-light bg-gray-300 bg-cover bg-center"
                        style={{ backgroundImage: `url('${src}')` }}
                      />
                    ))}
                  </div>
                  <p className="text-sm font-medium text-text-muted">
                    Loved by 10,000+ storytellers
                  </p>
                </div>
              </div>

              <div className="relative flex items-center justify-center lg:w-1/2 lg:justify-end">
                <div className="absolute -inset-4 rounded-full bg-primary/30 blur-[60px]" />
                <div className="relative z-10 mx-auto w-[280px] overflow-hidden rounded-[2.5rem] border-[8px] border-white bg-white shadow-2xl md:w-[320px]">
                  <div className="absolute left-1/2 top-0 z-20 h-6 w-32 -translate-x-1/2 rounded-b-xl bg-white" />
                  <div
                    className="relative h-[580px] w-full bg-cover bg-center"
                    style={{
                      backgroundImage:
                        "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDxSGm0t0wXtNBy8BFLS2so5eBFXPy_WiHm40hRG4J2C1NTq1Xocf9_A660fWTh09rVSHn1hjvaFVKurvzP3xxhpR5FJnCnDP5yOFpx6znbdNCOTMp7dc42Y7NpDXuiAg2MlYjXMCySvx-g8AAPeS48ENksntB8Az7Ku2M4dVLPvXcJ7J2pvTFqNixBkb_iTqjueKPUATyjWNms55A6LI81yuJXiwEHojg4L9rga3UvN2wx78cWXlIibpQn-I-itHaRuKpfPcYcNcs')",
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
                    <div className="absolute bottom-0 left-0 right-0 p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/20">
                          <span className="material-symbols-outlined text-white">
                            person
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white drop-shadow-sm">
                            Alex&apos;s Journal
                          </span>
                          <span className="text-xs text-white/90 drop-shadow-sm">
                            Just now · AI Generated
                          </span>
                        </div>
                      </div>
                      <p className="text-white/95 text-sm font-medium leading-relaxed p-3 rounded-xl bg-black/40 backdrop-blur-md border border-white/20 shadow-lg">
                        &quot;Today was purely magical. The light through the
                        trees felt like a movie scene...&quot;
                      </p>
                      <div className="flex gap-2 mt-4">
                        <div className="h-1 w-full rounded-full bg-white/30 overflow-hidden">
                          <div className="h-full w-1/3 bg-primary" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="absolute top-20 -left-12 z-30 hidden md:flex items-center gap-3 rounded-xl bg-white border border-border-light p-3 shadow-xl max-w-[200px] animate-pulse">
                    <span className="material-symbols-outlined text-primary">
                      auto_awesome
                    </span>
                    <p className="text-xs font-medium text-text-main">
                      Generating visuals...
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="py-10 md:py-20 scroll-mt-24" id="how-it-works">
              <div className="flex flex-col gap-4 mb-10 text-center md:items-center">
                <h2 className="text-primary text-[22px] font-bold leading-tight tracking-[-0.015em] md:text-3xl">
                  How it Works
                </h2>
                <h3 className="text-text-main tracking-light text-[32px] font-bold leading-tight md:text-4xl lg:text-5xl max-w-[720px]">
                  From Diary to Video in 3 Steps
                </h3>
                <p className="text-text-muted text-base font-normal leading-normal max-w-[600px]">
                  Transform your daily thoughts into engaging social content
                  effortlessly. No video editing skills required.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {[
                  {
                    n: 1,
                    icon: "edit_note",
                    title: "Write Your Diary",
                    body: "Simply type out your day's events, feelings, or random thoughts in our distraction-free journal interface.",
                  },
                  {
                    n: 2,
                    icon: "movie_edit",
                    title: "AI Creates Video",
                    body: "Our advanced AI analyzes the sentiment and context of your text to generate a matching cinematic video.",
                  },
                  {
                    n: 3,
                    icon: "share",
                    title: "Share Your Reels",
                    body: "Download your video and share it instantly to TikTok, Instagram Reels, or YouTube Shorts.",
                  },
                ].map((c) => (
                  <div
                    key={c.n}
                    className="group relative flex flex-col gap-4 rounded-3xl border border-border-light bg-white p-6 transition-all hover:border-primary/50 hover:bg-white shadow-sm hover:shadow-md"
                  >
                    <div className="absolute -right-4 -top-4 flex h-12 w-12 items-center justify-center rounded-full bg-white border border-border-light text-xl font-bold text-text-main shadow-lg">
                      {c.n}
                    </div>
                    <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-[#181411] transition-colors">
                      <span className="material-symbols-outlined text-3xl">
                        {c.icon}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <h4 className="text-xl font-bold text-text-main">
                        {c.title}
                      </h4>
                      <p className="text-text-muted text-sm leading-relaxed">
                        {c.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="py-10 md:py-20 scroll-mt-24" id="showcase">
              <div className="flex flex-col md:flex-row justify-between items-end mb-10 gap-4">
                <div className="flex flex-col gap-2">
                  <h2 className="text-text-main text-3xl font-bold leading-tight md:text-4xl">
                    Made with Life Reels
                  </h2>
                  <p className="text-text-muted">
                    See what others are creating from simple text.
                  </p>
                </div>
                <a
                  className="flex items-center gap-2 text-primary font-bold hover:text-text-main transition-colors"
                  href="#"
                >
                  View all examples{" "}
                  <span className="material-symbols-outlined text-sm">
                    arrow_forward
                  </span>
                </a>
              </div>

              <div className="hide-scroll -mx-4 flex gap-6 overflow-x-auto px-4 pb-8 md:px-0">
                {[
                  {
                    tagIcon: "bolt",
                    tag: "Viral",
                    title: "Friday Night Vibes",
                    quote: '"The music was loud, the energy was electric..."',
                    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuCg5_X747iThDasGScKVGYP796HNODvuH--9s2jC7kASeSd20leQK0OMgH_NY3W6PIiysolHb040r3F4uJ8XBSOLWGSe3QYPtICWbdlw5TmnZif1EDTLQPEmt291UcNLiJ6n6vKdGBhvju28326EZ-Y0qi2nOuk55S0rNg_0Iyy2l0ommzN5E-NE_MiF6GBObwbav0EfiabT_29dkAl__vP5-zdal2Dz6O8tl_kJjYr7ZwrRxGnHmwcVOQEKM28tLmcmk1QswPZbvE",
                  },
                  {
                    tagIcon: "flight",
                    tag: "Travel",
                    title: "Swiss Alps Trip",
                    quote: '"Woke up to the sound of cowbells and fresh air..."',
                    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBh_cwsXbDAYZkk-ZSnXDl8_8qzNkDGodL8kBgxidtZrQvXeEgybzh0JL3Y2YuFJhO8KASz5-5tGezhMfl5O4QPlcIyr0VpmPw7TMZuOUgmILJsWrqK9rQsz7WS5IVNr97ubbhtnO-5H8Azct8HgO6oSTMFHTWso6rc_8Tnh_X7twnu0bcU1J_XF_SuUyosQyzV75YCNjvVF3RTrPVoza4ZRMNXtWp95GLanGU_c-t6YladIpkVhqAjtguaG-jFN6RNIpc5IgDMugg",
                  },
                  {
                    tagIcon: "fitness_center",
                    tag: "Fitness",
                    title: "Gym Progress",
                    quote: '"Hit a new PR on deadlifts today! Feeling strong..."',
                    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAf770M55Qnv8cdsX-2izQ_Ti4MNjZdfsN3ecnxlVrMIh2FqnXmJrnDh_hbxVb3NVKNn7MSC2qkMHHZg1y8PfIpAjFaYfoqgKZWS8fcNdC4GShiuaojqU5kX5Er482HwNuvYCZIRBC-WLtJefBuhXeG6aUEd21GIAXWQrGwjAUF_S69c8ziKm6l6A8NWkrYqSYwvmjSuO8LW81Mk37Z0V2N2d4oCqW1ZrEgm9SLy-j4Jqfnv2QiiNnvb8QihUS6nKch8I7x69p0VME",
                  },
                  {
                    tagIcon: "coffee",
                    tag: "Daily",
                    title: "Morning Routine",
                    quote: '"Slow mornings are the best mornings. Coffee first..."',
                    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAnSybLrIuhROYzJnZMp1a-OuSteksmPMwV0TEH9aM7pSKb5wpC-3harNT82nS5HEMbDwFyWNabvmC8Y2fCfZzNROK9c0LHnk-lRDE3TcgBqaRM5CNTO2X3nFByf8SF7Di5wN3SUvcTIiFW10ttkcmKAOW5S0R1d4Zyp8TWfNqdoT-y5wZeQ2kZ3SBI1a9O27jHxfhpPpyvCVLhON_qETLZ0kBcgSNgltfHlb61eAu_1BdCoTFVgAEgx99PdKddGRfbsW7a-850Seg",
                  },
                ].map((card) => (
                  <div
                    key={card.title}
                    className="group relative min-w-[280px] cursor-pointer overflow-hidden rounded-[2rem] bg-white shadow-lg md:min-w-[300px]"
                  >
                    <div
                      className="aspect-[9/16] w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                      style={{ backgroundImage: `url('${card.img}')` }}
                    >
                      <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition-colors" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-[#181411] backdrop-blur-sm shadow-xl">
                          <span className="material-symbols-outlined !text-4xl">
                            play_arrow
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/70 to-transparent p-6 pt-12">
                      <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-md border border-white/10">
                        <span className="material-symbols-outlined text-[12px]">
                          {card.tagIcon}
                        </span>{" "}
                        {card.tag}
                      </div>
                      <h3 className="text-lg font-bold text-white">
                        {card.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-xs text-white/80">
                        {card.quote}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="my-10 rounded-[3rem] bg-white p-8 text-center md:p-20 relative overflow-hidden shadow-xl">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
              <div className="relative z-10 flex flex-col items-center gap-6 max-w-2xl mx-auto">
                <h2 className="text-text-main text-3xl font-black leading-tight tracking-[-0.033em] md:text-5xl">
                  Ready to Visualize Your Story?
                </h2>
                <p className="text-text-muted text-lg">
                  Join thousands of creators turning their daily journals into
                  viral-worthy content.
                </p>
                <button
                  type="button"
                  onClick={onStartWriting}
                  className="mt-4 flex min-w-[200px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-14 px-8 bg-primary hover:bg-primary/90 transition-all hover:scale-105 text-[#181411] text-lg font-bold shadow-lg shadow-primary/30"
                >
                  Start Writing Now
                </button>
                <p className="text-xs text-text-muted mt-2">
                  No credit card required. Free plan available.
                </p>
              </div>
            </section>

            <footer className="flex flex-col gap-8 py-10 border-t border-border-light md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-text-main">
                  <span className="material-symbols-outlined text-primary">
                    movie_filter
                  </span>
                  <span className="text-lg font-bold">Life Reels</span>
                </div>
                <p className="text-sm text-text-muted">
                  © {new Date().getFullYear()} Life Reels. All rights reserved.
                </p>
              </div>
              <div className="flex gap-8 flex-wrap">
                <a
                  className="text-sm text-text-muted hover:text-text-main"
                  href="#"
                >
                  Privacy
                </a>
                <a
                  className="text-sm text-text-muted hover:text-text-main"
                  href="#"
                >
                  Terms
                </a>
                <a
                  className="text-sm text-text-muted hover:text-text-main"
                  href="#"
                >
                  Twitter
                </a>
                <a
                  className="text-sm text-text-muted hover:text-text-main"
                  href="#"
                >
                  Instagram
                </a>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
