import { useEffect, useRef, useState } from "react";

export default function LandingPage(props: {
  onStartWriting?: () => void;
  onLogin?: () => void;
}) {
  const onStartWriting =
    props.onStartWriting ?? (() => (window.location.hash = "#/generate"));
  const onLogin = props.onLogin ?? (() => (window.location.hash = "#/login"));
  const currentYear = new Date().getFullYear();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="bg-background-light font-display text-text-main min-h-screen page-enter">
      {/* overflow guard — 모든 자식의 돌출을 잡아줌 */}
      <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden overflow-y-auto">

        {/* ── Header ──────────────────────────────────────────────── */}
        <header
          ref={menuRef}
          className="sticky top-0 z-50 border-b border-solid border-border-light bg-background-light/80 backdrop-blur-md"
        >
          <div className="flex items-center justify-between px-4 py-3 md:px-10">
            <a
              href="#/"
              className="flex items-center gap-3 text-text-main shrink-0"
              aria-label="Life Reels — home"
            >
              <div className="size-8 text-primary">
                <span className="material-symbols-outlined !text-3xl" aria-hidden="true">movie_filter</span>
              </div>
              <span className="text-lg font-bold leading-tight tracking-[-0.015em]">Life Reels</span>
            </a>

            <nav className="hidden md:flex items-center gap-9" aria-label="Primary navigation">
              <a className="text-text-muted hover:text-text-main transition-colors text-sm font-medium" href="#how-it-works">How it Works</a>
              <a className="text-text-muted hover:text-text-main transition-colors text-sm font-medium" href="#showcase">Showcase</a>
              <button type="button" className="text-text-muted hover:text-text-main transition-colors text-sm font-medium" onClick={onLogin}>Login</button>
            </nav>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onStartWriting}
                className="hidden md:flex min-w-[84px] cursor-pointer items-center justify-center rounded-full h-10 px-6 bg-primary hover:bg-primary-hover transition-colors text-[#181411] text-sm font-bold"
              >
                Start Writing
              </button>
              <button
                type="button"
                aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
                onClick={() => setMenuOpen((v) => !v)}
                className="md:hidden flex items-center justify-center h-11 w-11 rounded-xl bg-white border border-border-light shadow-sm hover:bg-surface-light transition-colors"
              >
                <span className="material-symbols-outlined text-[22px] text-text-main" aria-hidden="true">
                  {menuOpen ? "close" : "menu"}
                </span>
              </button>
            </div>
          </div>

          {menuOpen && (
            <nav
              id="mobile-menu"
              role="navigation"
              aria-label="Mobile navigation"
              className="md:hidden mobile-menu-enter border-t border-border-light bg-white/95 backdrop-blur-md px-4 pb-4 pt-3 flex flex-col gap-1"
            >
              <a href="#how-it-works" onClick={closeMenu} className="flex items-center gap-3 rounded-xl px-4 py-3 text-text-main font-medium hover:bg-primary/10 transition-colors">
                <span className="material-symbols-outlined text-primary text-[18px]" aria-hidden="true">info</span>
                How it Works
              </a>
              <a href="#showcase" onClick={closeMenu} className="flex items-center gap-3 rounded-xl px-4 py-3 text-text-main font-medium hover:bg-primary/10 transition-colors">
                <span className="material-symbols-outlined text-primary text-[18px]" aria-hidden="true">play_circle</span>
                Showcase
              </a>
              <button type="button" onClick={() => { closeMenu(); onLogin(); }} className="flex items-center gap-3 rounded-xl px-4 py-3 text-text-main font-medium hover:bg-primary/10 transition-colors text-left">
                <span className="material-symbols-outlined text-primary text-[18px]" aria-hidden="true">person</span>
                Login
              </button>
              <div className="mt-2 pt-2 border-t border-border-light">
                <button type="button" onClick={() => { closeMenu(); onStartWriting(); }} className="w-full flex items-center justify-center gap-2 rounded-full h-12 bg-primary hover:bg-primary-hover transition-colors text-[#181411] font-bold">
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">edit_note</span>
                  Start Writing for Free
                </button>
              </div>
            </nav>
          )}
        </header>

        {/* ── Main Content ────────────────────────────────────────── */}
        <main className="flex flex-1 justify-center py-2 sm:py-5">
          <div className="flex flex-col w-full max-w-[1200px] px-4 sm:px-6 md:px-8">

            {/* ── Hero ────────────────────────────────────────────── */}
            <section
              className="flex flex-col gap-6 py-8 sm:gap-10 sm:py-10 lg:flex-row lg:items-center lg:py-20"
              aria-label="Hero"
            >
              <div className="flex flex-col gap-5 sm:gap-8 lg:w-1/2 lg:pr-10">
                <div className="flex flex-col gap-3 sm:gap-4">
                  <div className="hero-1 inline-flex w-fit items-center gap-2 rounded-full border border-border-light bg-white px-3 py-1 shadow-sm">
                    <span className="material-symbols-outlined text-primary text-sm" aria-hidden="true">auto_awesome</span>
                    <span className="text-xs font-medium text-text-muted">AI-Powered Storytelling</span>
                  </div>

                  <h1 className="hero-2 text-text-main text-[26px] font-black leading-[1.15] tracking-[-0.03em] sm:text-4xl md:text-5xl lg:text-6xl">
                    Turn Your Daily{" "}
                    <span className="text-primary-dark relative inline-block">
                      Stories
                      <span className="absolute bottom-0 left-0 w-full h-1.5 bg-primary/20 -z-10 rounded-full" aria-hidden="true" />
                    </span>{" "}
                    into Cinematic Reels
                  </h1>

                  <p className="hero-3 text-text-muted text-[15px] leading-relaxed sm:text-lg md:text-xl">
                    The AI journaling companion that visualizes your memories.
                    Simply write about your day, and watch it transform into a
                    vibrant video instantly.
                  </p>
                </div>

                <div className="hero-4 flex flex-col gap-3 sm:flex-row sm:gap-4">
                  <button
                    type="button"
                    onClick={onStartWriting}
                    className="w-full sm:w-auto flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-6 text-[#181411] text-base font-bold transition-transform hover:scale-105 shadow-lg shadow-primary/20 active:scale-100"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">edit_note</span>
                    Start Writing for Free
                  </button>
                  <a
                    className="w-full sm:w-auto flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-border-light bg-white px-6 text-text-main text-base font-bold hover:bg-surface-light transition-colors shadow-sm"
                    href="#how-it-works"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">expand_more</span>
                    How it Works
                  </a>
                </div>

                <div className="hero-5 flex items-center gap-3">
                  <div className="flex items-center gap-2 rounded-full bg-white border border-border-light px-3 py-1.5 shadow-sm">
                    <span className="material-symbols-outlined text-primary text-[16px]" aria-hidden="true">verified</span>
                    <span className="text-xs font-semibold text-text-muted">Free to try · No credit card</span>
                  </div>
                </div>
              </div>

              {/* Phone mockup */}
              <div className="relative flex items-center justify-center lg:w-1/2 lg:justify-end" aria-hidden="true">
                <div className="absolute inset-0 rounded-full bg-primary/30 blur-[60px] opacity-60" />
                <div className="relative z-10 mx-auto w-[200px] sm:w-[240px] md:w-[280px] lg:w-[300px] overflow-hidden rounded-[2.5rem] border-[8px] border-white bg-white shadow-2xl">
                  <div className="absolute left-1/2 top-0 z-20 h-6 w-24 -translate-x-1/2 rounded-b-xl bg-white" />
                  <div
                    className="relative h-[356px] sm:h-[428px] md:h-[498px] lg:h-[534px] w-full bg-cover bg-center"
                    style={{
                      backgroundImage:
                        "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDxSGm0t0wXtNBy8BFLS2so5eBFXPy_WiHm40hRG4J2C1NTq1Xocf9_A660fWTh09rVSHn1hjvaFVKurvzP3xxhpR5FJnCnDP5yOFpx6znbdNCOTMp7dc42Y7NpDXuiAg2MlYjXMCySvx-g8AAPeS48ENksntB8Az7Ku2M4dVLPvXcJ7J2pvTFqNixBkb_iTqjueKPUATyjWNms55A6LI81yuJXiwEHojg4L9rga3UvN2wx78cWXlIibpQn-I-itHaRuKpfPcYcNcs')",
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
                    <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
                      <div className="flex items-center gap-2 sm:gap-3 mb-3">
                        <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/20">
                          <span className="material-symbols-outlined text-white text-[18px] sm:text-[22px]">person</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs sm:text-sm font-bold text-white drop-shadow-sm">Alex&apos;s Journal</span>
                          <span className="text-[10px] sm:text-xs text-white/90 drop-shadow-sm">Just now · AI Generated</span>
                        </div>
                      </div>
                      <p className="text-white/95 text-xs sm:text-sm font-medium leading-relaxed p-2 sm:p-3 rounded-xl bg-black/40 backdrop-blur-md border border-white/20 shadow-lg line-clamp-3">
                        &quot;Today was purely magical. The light through the trees felt like a movie scene...&quot;
                      </p>
                      <div className="flex gap-2 mt-3">
                        <div className="h-1 w-full rounded-full bg-white/30 overflow-hidden">
                          <div className="h-full w-1/3 bg-primary" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* "Generating" tooltip — md+ only */}
                  <div className="absolute top-16 -left-10 z-30 hidden lg:flex items-center gap-2 rounded-xl bg-white border border-border-light p-2 shadow-xl max-w-[160px] animate-pulse">
                    <span className="material-symbols-outlined text-primary text-[18px]">auto_awesome</span>
                    <p className="text-[11px] font-medium text-text-main">Generating visuals...</p>
                  </div>
                </div>
              </div>
            </section>

            {/* ── How it Works ────────────────────────────────────── */}
            <section className="py-8 sm:py-12 md:py-20 scroll-mt-24" id="how-it-works" aria-labelledby="how-title">
              <div className="flex flex-col gap-3 sm:gap-4 mb-8 sm:mb-10 text-center items-center">
                <h2 id="how-title" className="text-primary-dark text-lg font-bold leading-tight sm:text-[22px] md:text-3xl">
                  How it Works
                </h2>
                <h3 className="text-text-main font-bold leading-tight text-xl sm:text-[28px] md:text-4xl lg:text-5xl max-w-[720px]">
                  From Diary to Video in 3 Steps
                </h3>
                <p className="text-text-muted text-sm sm:text-base font-normal leading-normal max-w-[600px]">
                  Transform your daily thoughts into engaging social content
                  effortlessly. No video editing skills required.
                </p>
              </div>

              {/* Step cards — 넘버 뱃지를 카드 내부로 이동 (모바일에서 돌출 방지) */}
              <ol className="grid grid-cols-1 gap-6 md:grid-cols-3" aria-label="Steps">
                {[
                  { n: 1, icon: "edit_note", title: "Write Your Diary", body: "Simply type out your day's events, feelings, or random thoughts in our distraction-free journal interface." },
                  { n: 2, icon: "movie_edit", title: "AI Creates Video", body: "Our advanced AI analyzes the sentiment and context of your text to generate a matching cinematic video." },
                  { n: 3, icon: "share", title: "Share Your Reels", body: "Download your video and share it instantly to TikTok, Instagram Reels, or YouTube Shorts." },
                ].map((c) => (
                  <li
                    key={c.n}
                    className="group relative flex flex-col gap-4 rounded-2xl sm:rounded-3xl border border-border-light bg-white p-5 sm:p-6 transition-all hover:border-primary/50 hover:bg-white shadow-sm hover:shadow-md list-none"
                  >
                    {/* 번호 뱃지: 모바일에서는 카드 내부 우상단, md+에서만 밖으로 돌출 */}
                    <div
                      className="absolute right-4 top-4 md:-right-4 md:-top-4 flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-full bg-white border border-border-light text-lg md:text-xl font-bold text-text-main shadow-md md:shadow-lg"
                      aria-hidden="true"
                    >
                      {c.n}
                    </div>
                    <div className="mb-1 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-[#181411] transition-colors" aria-hidden="true">
                      <span className="material-symbols-outlined text-2xl sm:text-3xl">{c.icon}</span>
                    </div>
                    <div className="flex flex-col gap-1.5 sm:gap-2 pr-10 md:pr-0">
                      <h4 className="text-lg sm:text-xl font-bold text-text-main">{c.title}</h4>
                      <p className="text-text-muted text-sm leading-relaxed">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {/* ── Showcase ────────────────────────────────────────── */}
            <section className="py-8 sm:py-12 md:py-20 scroll-mt-24" id="showcase" aria-labelledby="showcase-title">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 sm:mb-10 gap-2 sm:gap-4">
                <div className="flex flex-col gap-1 sm:gap-2">
                  <h2 id="showcase-title" className="text-text-main text-xl font-bold leading-tight sm:text-3xl md:text-4xl">
                    Made with Life Reels
                  </h2>
                  <p className="text-text-muted text-sm sm:text-base">See what others are creating from simple text.</p>
                </div>
              </div>

              {/* 가로 스크롤 — 음수 마진 제거, 카드 크기 모바일 대응 */}
              <div
                className="hide-scroll flex gap-4 sm:gap-6 overflow-x-auto pb-4 sm:pb-8"
                role="list"
                aria-label="Showcase examples"
              >
                {[
                  { tagIcon: "bolt", tag: "Viral", title: "Friday Night Vibes", quote: '"The music was loud, the energy was electric..."', img: "https://lh3.googleusercontent.com/aida-public/AB6AXuCg5_X747iThDasGScKVGYP796HNODvuH--9s2jC7kASeSd20leQK0OMgH_NY3W6PIiysolHb040r3F4uJ8XBSOLWGSe3QYPtICWbdlw5TmnZif1EDTLQPEmt291UcNLiJ6n6vKdGBhvju28326EZ-Y0qi2nOuk55S0rNg_0Iyy2l0ommzN5E-NE_MiF6GBObwbav0EfiabT_29dkAl__vP5-zdal2Dz6O8tl_kJjYr7ZwrRxGnHmwcVOQEKM28tLmcmk1QswPZbvE" },
                  { tagIcon: "flight", tag: "Travel", title: "Swiss Alps Trip", quote: '"Woke up to the sound of cowbells and fresh air..."', img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBh_cwsXbDAYZkk-ZSnXDl8_8qzNkDGodL8kBgxidtZrQvXeEgybzh0JL3Y2YuFJhO8KASz5-5tGezhMfl5O4QPlcIyr0VpmPw7TMZuOUgmILJsWrqK9rQsz7WS5IVNr97ubbhtnO-5H8Azct8HgO6oSTMFHTWso6rc_8Tnh_X7twnu0bcU1J_XF_SuUyosQyzV75YCNjvVF3RTrPVoza4ZRMNXtWp95GLanGU_c-t6YladIpkVhqAjtguaG-jFN6RNIpc5IgDMugg" },
                  { tagIcon: "fitness_center", tag: "Fitness", title: "Gym Progress", quote: '"Hit a new PR on deadlifts today! Feeling strong..."', img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAf770M55Qnv8cdsX-2izQ_Ti4MNjZdfsN3ecnxlVrMIh2FqnXmJrnDh_hbxVb3NVKNn7MSC2qkMHHZg1y8PfIpAjFaYfoqgKZWS8fcNdC4GShiuaojqU5kX5Er482HwNuvYCZIRBC-WLtJefBuhXeG6aUEd21GIAXWQrGwjAUF_S69c8ziKm6l6A8NWkrYqSYwvmjSuO8LW81Mk37Z0V2N2d4oCqW1ZrEgm9SLy-j4Jqfnv2QiiNnvb8QihUS6nKch8I7x69p0VME" },
                  { tagIcon: "coffee", tag: "Daily", title: "Morning Routine", quote: '"Slow mornings are the best mornings. Coffee first..."', img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAnSybLrIuhROYzJnZMp1a-OuSteksmPMwV0TEH9aM7pSKb5wpC-3harNT82nS5HEMbDwFyWNabvmC8Y2fCfZzNROK9c0LHnk-lRDE3TcgBqaRM5CNTO2X3nFByf8SF7Di5wN3SUvcTIiFW10ttkcmKAOW5S0R1d4Zyp8TWfNqdoT-y5wZeQ2kZ3SBI1a9O27jHxfhpPpyvCVLhON_qETLZ0kBcgSNgltfHlb61eAu_1BdCoTFVgAEgx99PdKddGRfbsW7a-850Seg" },
                ].map((card) => (
                  <article
                    key={card.title}
                    role="listitem"
                    aria-label={`${card.tag}: ${card.title}`}
                    className="group relative shrink-0 w-[70vw] max-w-[280px] sm:w-[280px] md:w-[300px] cursor-pointer overflow-hidden rounded-2xl sm:rounded-[2rem] bg-white shadow-lg"
                  >
                    <div
                      className="aspect-[9/16] w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                      style={{ backgroundImage: `url('${card.img}')` }}
                      role="img"
                      aria-label={card.title}
                    >
                      <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition-colors" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden="true">
                        <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-primary text-[#181411] backdrop-blur-sm shadow-xl">
                          <span className="material-symbols-outlined !text-3xl sm:!text-4xl">play_arrow</span>
                        </div>
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/70 to-transparent p-4 sm:p-6 pt-10 sm:pt-12">
                      <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-md border border-white/10" aria-hidden="true">
                        <span className="material-symbols-outlined text-[12px]">{card.tagIcon}</span>{" "}
                        {card.tag}
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-white">{card.title}</h3>
                      <p className="mt-1 line-clamp-2 text-xs text-white/80">{card.quote}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {/* ── CTA ─────────────────────────────────────────────── */}
            <section
              className="my-8 sm:my-10 rounded-2xl sm:rounded-3xl md:rounded-[3rem] bg-white p-6 sm:p-10 md:p-20 text-center relative overflow-hidden shadow-xl"
              aria-label="Call to action"
            >
              {/* 장식 blob — overflow:hidden 덕에 잘림 방지 됨 */}
              <div className="absolute top-0 right-0 w-40 sm:w-64 h-40 sm:h-64 bg-primary/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" aria-hidden="true" />
              <div className="absolute bottom-0 left-0 w-40 sm:w-64 h-40 sm:h-64 bg-primary/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" aria-hidden="true" />
              <div className="relative z-10 flex flex-col items-center gap-4 sm:gap-6 max-w-2xl mx-auto">
                <h2 className="text-text-main text-xl font-black leading-tight tracking-[-0.02em] sm:text-3xl md:text-5xl">
                  Ready to Visualize Your Story?
                </h2>
                <p className="text-text-muted text-sm sm:text-base md:text-lg leading-relaxed">
                  Join our early community and turn your daily journal into
                  a cinematic reel — no video editing skills required.
                </p>
                <button
                  type="button"
                  onClick={onStartWriting}
                  className="mt-2 w-full sm:w-auto flex items-center justify-center gap-2 rounded-full h-12 sm:h-14 px-8 bg-primary hover:bg-primary-hover transition-all hover:scale-105 active:scale-100 text-[#181411] text-base sm:text-lg font-bold shadow-lg shadow-primary/30"
                >
                  Start Writing Now
                </button>
                <p className="text-xs text-text-muted">No credit card required. Free plan available.</p>
              </div>
            </section>

            {/* ── Footer ──────────────────────────────────────────── */}
            <footer className="flex flex-col gap-6 py-8 sm:py-10 border-t border-border-light md:flex-row md:items-center md:justify-between" role="contentinfo">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-text-main">
                  <span className="material-symbols-outlined text-primary" aria-hidden="true">movie_filter</span>
                  <span className="text-lg font-bold">Life Reels</span>
                </div>
                <p className="text-sm text-text-muted">© {currentYear} Life Reels. All rights reserved.</p>
              </div>
              <nav aria-label="Footer links">
                <ul className="flex gap-6 sm:gap-8 flex-wrap list-none p-0 m-0">
                  {["Privacy", "Terms", "Twitter", "Instagram"].map((label) => (
                    <li key={label}>
                      <span className="text-sm text-text-muted/50 cursor-default select-none" title="Coming soon" aria-label={`${label} — coming soon`}>
                        {label}
                      </span>
                    </li>
                  ))}
                </ul>
              </nav>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
