// /cofrinho — the revenue engine landing: a dollar account that YIELDS, inside Pix.
// Money-first conversion machine (money plan 2026-06-19). Stolen, proven parts:
//   - anti-savings comparison bar (DollarUp): the pitch in one bar
//   - one-tap yield "pot" toggle (Littio/OpenTrade): turns idle dollars into yield
//   - fee anchor table (Wise/ZAP): 0.98% reads as a discount vs ~5% card
//   - on-chain proof as social-proof substitute (we have zero brand trust yet)
// Design system cloned from LandingV2: Inter monumental caps, BONE/INK, single
// #FDDA24 accent, cofrinho mascot, bilingual, reveal-on-scroll.
//
// HONESTY: the yield product is not legally live yet (needs licensed partner +
// counsel; see money plan risk #4). This page measures demand (waitlist/intent)
// and is the PULSO hackathon revenue-thesis surface. Numbers are illustrative and
// labeled as such — no invented precision.

import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import NumberFlow from "@number-flow/react";
import { Waitlist } from "../components/Waitlist.tsx";

const brlFmt = { style: "currency" as const, currency: "BRL", maximumFractionDigits: 0 };

const display = { fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" } as const;
const GRAY = "#6f6862";
const ACCENT = "#FDDA24";
const LIVE_CONTRACT = "CCT3KJXRUO3HJJ2GLTW2MISSQVUEKOPUG3B4YQH75TCGKAOC4P6FIKUF";
const xurl = (p: string, id: string) => `https://stellar.expert/explorer/public/${p}/${id}`;

// Illustrative annual rates (labeled on-screen). Dollar yield ~ short T-bill; BRL
// savings ~ nominal poupança. The real wedge is dollar protection + yield vs a
// BRL balance that the real erodes — framed honestly, not as "double your money".
const USD_YIELD = 0.06;   // ~6% a.a. em dólar (ilustrativo)

type Lang = "pt" | "en";

const COPY = {
  pt: {
    nav: { pay: "Pagar", receive: "Receber", login: "Entrar", cta: "Quero meu cofrinho" },
    hero: {
      eyebrow: "o cofrinho que rende · em dólar",
      h1: "Seu dinheiro em dólar. Rendendo. Seu.",
      sub: "Guarde em dólar dentro do Pix e deixe render, com um toque. Ninguém congela, ninguém move sem a sua digital. O dólar é seu, as chaves são suas.",
      cta: "Quero meu cofrinho",
      note: "sem cartão · biometria · sem seed phrase",
    },
    bar: {
      stamp: "por que dólar",
      h: "Real na poupança encolhe. Dólar no cofrinho rende.",
      poupLabel: "poupança · em real",
      cofreLabel: "cofrinho · em dólar",
      foot: "Taxas ilustrativas (~6% a.a.). A diferença real é a moeda: o real perde valor, o dólar protege, e ainda rende.",
    },
    calc: {
      stamp: "simule",
      h: "Veja o seu cofrinho render.",
      label: "quanto você guardaria",
      toggle: "deixar rendendo",
      after: "em 12 meses",
      yielded: "rendimento",
      protected: "protegido em dólar",
      disclaimer: "Simulação ilustrativa. Rendimento em dólar, sujeito ao parceiro licenciado e à taxa vigente.",
    },
    fee: {
      stamp: "a conta limpa",
      h: "Você fica com a diferença.",
      rows: [
        ["Cartão / banco no exterior", "~5%", false],
        ["Outras fintechs", "~1,5%", false],
        ["Vineland", "0,98%", true],
      ] as [string, string, boolean][],
      foot: "Taxa travada na confirmação. Sem letra miúda, sem mensalidade.",
    },
    trust: {
      stamp: "a prova",
      h: "Não confie. Confira.",
      items: [
        ["Zero custódia", "O dólar fica na sua carteira, nunca no nosso balanço. Não dá pra congelar o que a gente não segura."],
        ["Provado on-chain", "Contrato vivo na mainnet Stellar. Qualquer um audita o código e as transações, agora."],
        ["Só a sua digital move", "Biometria assina cada movimento. Sem senha, sem seed, sem ninguém no meio."],
      ] as [string, string][],
      contractBtn: "Ver o contrato no ar ↗",
    },
    attack: {
      stamp: "a diferença",
      h: "Eles seguram. A gente não.",
      items: [
        ["Conta custodiada congela.", "Banco e fintech podem bloquear, segurar ou perder o seu dinheiro, ele fica no balanço deles. Não dá pra congelar o que a gente nunca toca."],
        ["Spread escondido vira surpresa.", "O incumbente esconde a taxa no câmbio. A nossa é 0,98% na cara, travada na confirmação. Você fica com 100% do rendimento, sem carry escondido."],
        ["Empresa de verdade.", "Bluewave · CNPJ 66.381.800/0001-08 · brasileira, com cara e endereço. Cada conversão tem recibo on-chain que você audita."],
      ] as [string, string][],
    },
    cta: { h: "Comece o seu cofrinho.", lines: ["Dólar que rende, dentro do Pix.", "Seu, do seu jeito."], btn: "Quero meu cofrinho", note: "2 minutos · biometria · sem cartão" },
    footer: "vineland · o cofrinho que rende · seu dinheiro, seu",
  },
  en: {
    nav: { pay: "Pay", receive: "Receive", login: "Login", cta: "Get my cofrinho" },
    hero: {
      eyebrow: "the piggy bank that earns · in dollars",
      h1: "Your money in dollars. Earning. Yours.",
      sub: "Keep dollars inside Pix and let them earn, one touch. Nobody freezes it, nobody moves it without your fingerprint. The dollars are yours, the keys are yours.",
      cta: "Get my cofrinho",
      note: "no card · biometrics · no seed phrase",
    },
    bar: {
      stamp: "why dollars",
      h: "Reais in savings shrink. Dollars in the cofrinho earn.",
      poupLabel: "savings · in reais",
      cofreLabel: "cofrinho · in dollars",
      foot: "Illustrative rates (~6%/yr). The real edge is the currency: the real loses value, the dollar protects, and earns.",
    },
    calc: {
      stamp: "simulate",
      h: "Watch your cofrinho earn.",
      label: "how much you'd keep",
      toggle: "let it earn",
      after: "in 12 months",
      yielded: "earned",
      protected: "protected in dollars",
      disclaimer: "Illustrative simulation. Dollar yield, subject to the licensed partner and the prevailing rate.",
    },
    fee: {
      stamp: "the clean math",
      h: "You keep the difference.",
      rows: [
        ["Card / bank abroad", "~5%", false],
        ["Other fintechs", "~1.5%", false],
        ["Vineland", "0.98%", true],
      ] as [string, string, boolean][],
      foot: "Fee locked at confirmation. No fine print, no monthly fee.",
    },
    trust: {
      stamp: "the proof",
      h: "Don't trust. Verify.",
      items: [
        ["Zero custody", "The dollars live in your wallet, never on our balance sheet. You can't freeze what we don't hold."],
        ["Proven on-chain", "Live contract on Stellar mainnet. Anyone audits the code and the transactions, now."],
        ["Only your fingerprint moves it", "Biometrics sign every move. No password, no seed, nobody in between."],
      ] as [string, string][],
      contractBtn: "See the live contract ↗",
    },
    attack: {
      stamp: "the difference",
      h: "They hold it. We don't.",
      items: [
        ["Custodial accounts freeze.", "Banks and fintechs can block, hold, or lose your money, it sits on their balance sheet. You can't freeze what we never touch."],
        ["Hidden spread is a surprise.", "Incumbents bury the fee in the FX rate. Ours is 0.98% on the face, locked at confirmation. You keep 100% of the yield, no hidden carry."],
        ["A real company.", "Bluewave · CNPJ 66.381.800/0001-08 · Brazilian, with a face and an address. Every conversion has an on-chain receipt you can audit."],
      ] as [string, string][],
    },
    cta: { h: "Start your cofrinho.", lines: ["Dollars that earn, inside Pix.", "Yours, your way."], btn: "Get my cofrinho", note: "2 minutes · biometrics · no card" },
    footer: "vineland · the piggy bank that earns · your money, yours",
  },
} as const;

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Stamp({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.3em] justify-center md:justify-start" style={{ color: GRAY }}>
      <span className="h-px w-10 bg-current opacity-40" /><span>{label}</span>
    </div>
  );
}

export default function Cofrinho() {
  const [scrolled, setScrolled] = useState(false);
  const [lang, setLang] = useState<Lang>(() => {
    try { const s = localStorage.getItem("vineland.lang"); if (s === "pt" || s === "en") return s; } catch { /* */ }
    return (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("pt")) ? "pt" : "en";
  });
  useEffect(() => { try { localStorage.setItem("vineland.lang", lang); } catch { /* */ } }, [lang]);
  const t = COPY[lang];

  const [amount, setAmount] = useState(5000);
  const [earning, setEarning] = useState(true);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    root.classList.add("js-reveal");
    const io = new IntersectionObserver((ents) => { for (const e of ents) if (e.isIntersecting) { e.target.classList.add("reveal-in"); io.unobserve(e.target); } }, { rootMargin: "-8% 0px -8% 0px", threshold: 0.06 });
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    return () => { io.disconnect(); root.classList.remove("js-reveal"); };
  }, []);

  const sim = useMemo(() => {
    const rate = earning ? USD_YIELD : 0;
    const grown = amount * (1 + rate);
    return { grown, yielded: grown - amount };
  }, [amount, earning]);

  const btn = "lift inline-flex items-center rounded-full px-9 py-4 text-[11px] uppercase tracking-[0.22em] bg-[#FDDA24] text-[#0a0a0a] font-semibold";
  const sec = "border-t border-[#0a0a0a]/12";
  const h2 = "font-black uppercase tracking-[-0.04em] leading-[0.88] text-center md:text-left mx-auto md:mx-0";

  const LangToggle = () => {
    const active = "text-[#0a0a0a] font-medium";
    return (
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#0a0a0a]/45">
        <button onClick={() => setLang("pt")} className={lang === "pt" ? active : "hover:opacity-80"}>PT</button>
        <span className="opacity-30 mx-1">/</span>
        <button onClick={() => setLang("en")} className={lang === "en" ? active : "hover:opacity-80"}>EN</button>
      </div>
    );
  };

  // Bar widths: dollar protection framed as the taller bar (currency edge), not rate.
  const poupW = 46;
  const cofreW = 100;

  return (
    <div className="min-h-screen bg-[#f1eee7] text-[#0a0a0a] grain overflow-x-hidden" style={display}>
      <style>{`html{scroll-behavior:smooth}::selection{background:${ACCENT};color:#0a0a0a}`}</style>

      <header className={"fixed top-0 left-0 right-0 z-40 px-6 md:px-12 py-4 flex items-center justify-between transition-colors duration-300 " + (scrolled ? "backdrop-blur-md bg-[#f1eee7]/85 border-b border-[#0a0a0a]/8" : "bg-transparent")}>
        <Link to="/" className="text-2xl md:text-3xl lowercase text-[#0a0a0a]" style={{ ...display, fontWeight: 800, letterSpacing: "-0.04em" }}>vineland<span style={{ color: ACCENT }}>.</span></Link>
        <nav className="flex items-center gap-5 text-[10px] uppercase tracking-[0.2em] text-[#0a0a0a]/55">
          <Link to="/pay" className="hidden md:inline transition-opacity hover:opacity-70">{t.nav.pay}</Link>
          <Link to="/cobrar" className="hidden md:inline transition-opacity hover:opacity-70">{t.nav.receive}</Link>
          <span className="hidden md:inline"><LangToggle /></span>
          <Link to="/account" className="inline-flex items-center rounded-full px-5 py-2.5 bg-[#FDDA24] text-[#0a0a0a] font-semibold hover:opacity-90">{t.nav.cta}</Link>
        </nav>
      </header>

      {/* HERO — dollar that earns */}
      <section className="bg-[#f5f3ee] text-[#0a0a0a]">
        <div className="max-w-[920px] mx-auto px-6 pt-32 md:pt-40 pb-16 md:pb-20 flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 border border-[#0a0a0a]/15 font-mono text-[10px] uppercase tracking-[0.22em] text-[#0a0a0a]/55"><span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />{lang === "pt" ? "em breve · entre na lista" : "coming soon · join the list"}</span>
          <span className="mt-4 font-mono text-[10px] uppercase tracking-[0.24em] text-[#0a0a0a]/45">{t.hero.eyebrow}</span>
          <img src="/cofrinho.svg" alt="vineland" className="mt-6 w-44 sm:w-52 md:w-[300px] h-auto select-none" draggable={false} />
          <h1 className="mt-8 md:mt-10 font-black uppercase tracking-[-0.03em] leading-[0.9] text-[clamp(2rem,7.5vw,4.75rem)] max-w-[13ch]" style={display}>{t.hero.h1}</h1>
          <p className="mt-6 text-base md:text-xl text-[#0a0a0a]/65 max-w-[36ch] md:max-w-[44ch] leading-relaxed">{t.hero.sub}</p>
          <a href="#lista" className={btn + " mt-9"}>{t.hero.cta}</a>
          <span className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-[#0a0a0a]/45">{t.hero.note}</span>
        </div>
      </section>

      {/* ANTI-SAVINGS BAR — the pitch in one bar (stolen: DollarUp) */}
      <section className={sec}><div data-reveal className="max-w-[1100px] mx-auto px-6 md:px-12 py-24 md:py-32">
        <Stamp label={t.bar.stamp} />
        <h2 className={`mt-10 ${h2} text-[clamp(2.25rem,7vw,4.75rem)] max-w-[18ch]`} style={display}>{t.bar.h}</h2>
        <div className="mt-14 flex flex-col gap-7 max-w-[760px]">
          <div>
            <div className="flex items-baseline justify-between mb-2"><span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#0a0a0a]/55">{t.bar.poupLabel}</span></div>
            <div className="bar-fill h-12 md:h-14 rounded-r-xl bg-[#0a0a0a]/12" style={{ width: `${poupW}%` }} />
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-2"><span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#0a0a0a]">{t.bar.cofreLabel}</span></div>
            <div className="bar-fill h-12 md:h-14 rounded-r-xl" style={{ width: `${cofreW}%`, background: ACCENT, transitionDelay: "160ms" }} />
          </div>
        </div>
        <p className="mt-8 text-[14px] leading-relaxed text-[#0a0a0a]/55 max-w-[60ch]">{t.bar.foot}</p>
      </div></section>

      {/* CALCULATOR + YIELD TOGGLE — the pot (stolen: Littio/OpenTrade) */}
      <section className={sec}><div data-reveal className="max-w-[1100px] mx-auto px-6 md:px-12 py-24 md:py-32 grid md:grid-cols-2 gap-12 md:gap-16 items-center">
        <div>
          <Stamp label={t.calc.stamp} />
          <h2 className={`mt-10 ${h2} text-[clamp(2.25rem,6.5vw,4.25rem)] max-w-[14ch]`} style={display}>{t.calc.h}</h2>
          <div className="mt-10">
            <label className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#0a0a0a]/55">{t.calc.label}</label>
            <div className="mt-3 text-4xl md:text-5xl font-black tracking-[-0.03em]" style={display}>{fmtBRL(amount)}</div>
            <input type="range" min={500} max={100000} step={500} value={amount} onChange={(e) => setAmount(Number(e.target.value))}
              className="mt-5 w-full max-w-[420px] accent-[#FDDA24]" />
          </div>
          <button onClick={() => setEarning((v) => !v)}
            className={"mt-8 inline-flex items-center gap-3 rounded-full pl-2 pr-5 py-2 border transition-colors " + (earning ? "border-[#0a0a0a] bg-[#0a0a0a] text-[#f1eee7]" : "border-[#0a0a0a]/25 text-[#0a0a0a]")}>
            <span className={"w-10 h-6 rounded-full relative transition-colors " + (earning ? "bg-[#FDDA24]" : "bg-[#0a0a0a]/20")}>
              <span className={"absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all " + (earning ? "left-[18px]" : "left-0.5")} />
            </span>
            <span className="text-[11px] uppercase tracking-[0.2em] font-semibold">{t.calc.toggle}</span>
          </button>
        </div>

        <div className="w-full max-w-[440px] mx-auto md:justify-self-end">
          <div
            className="spotlight rounded-[1.75rem] border border-[#0a0a0a]/12 bg-[#f5f3ee] p-7 md:p-9"
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              e.currentTarget.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
              e.currentTarget.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
            }}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#0a0a0a]/45">{t.calc.after}</div>
            <div className="mt-3 text-5xl md:text-6xl font-black tracking-[-0.03em] tabular-nums" style={display}><NumberFlow value={Math.round(sim.grown)} format={brlFmt} locales="pt-BR" /></div>
            <div className="mt-6 flex flex-col gap-3">
              <div className="flex items-center justify-between border-t border-[#0a0a0a]/10 pt-3">
                <span className="text-[13px] text-[#0a0a0a]/60">{t.calc.protected}</span>
                <span className="font-mono text-[13px]">{fmtBRL(amount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[#0a0a0a]/60">{t.calc.yielded}</span>
                <span className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: earning ? "#0a0a0a" : GRAY }}>+ <NumberFlow value={Math.round(sim.yielded)} format={brlFmt} locales="pt-BR" /></span>
              </div>
            </div>
            <div className="mt-5 h-2 rounded-full bg-[#0a0a0a]/10 overflow-hidden">
              <div className="h-full transition-all duration-500" style={{ width: earning ? "100%" : "0%", background: ACCENT }} />
            </div>
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-[#0a0a0a]/45 max-w-[42ch]">{t.calc.disclaimer}</p>
        </div>
      </div></section>

      {/* FEE ANCHOR — you keep the difference (stolen: Wise/ZAP) */}
      <section className={sec}><div data-reveal className="max-w-[1100px] mx-auto px-6 md:px-12 py-24 md:py-32">
        <Stamp label={t.fee.stamp} />
        <h2 className={`mt-10 ${h2} text-[clamp(2.25rem,7vw,4.75rem)]`} style={display}>{t.fee.h}</h2>
        <div className="mt-12 max-w-[640px] flex flex-col">
          {t.fee.rows.map(([who, rate, hot], i) => (
            <div key={i} className={"flex items-center justify-between py-5 border-t " + (hot ? "border-[#0a0a0a]" : "border-[#0a0a0a]/12")}>
              <span className={"text-lg md:text-2xl tracking-[-0.01em] " + (hot ? "font-bold" : "text-[#0a0a0a]/60")} style={display}>{who}</span>
              <span className={"font-mono text-xl md:text-3xl tabular-nums " + (hot ? "font-black" : "text-[#0a0a0a]/55")} style={hot ? { background: ACCENT, padding: "2px 10px", borderRadius: "8px" } : undefined}>{rate}</span>
            </div>
          ))}
        </div>
        <p className="mt-8 text-lg md:text-xl font-medium tracking-[-0.01em]">{t.fee.foot}</p>
      </div></section>

      {/* TRUST / PROOF — on-chain proof as social-proof substitute */}
      <section className={sec}><div data-reveal className="max-w-[1100px] mx-auto px-6 md:px-12 py-24 md:py-32">
        <Stamp label={t.trust.stamp} />
        <h2 className={`mt-10 ${h2} text-[clamp(2.5rem,8vw,5.5rem)]`} style={display}>{t.trust.h}</h2>
        <div className="mt-16 grid md:grid-cols-3 gap-x-12 gap-y-12">
          {t.trust.items.map(([h, b], i) => (
            <div key={h} className="border-t-2 border-[#0a0a0a] pt-6">
              <div className="font-mono text-[11px] tracking-[0.2em]" style={{ color: ACCENT }}>0{i + 1}</div>
              <div className="mt-3 text-2xl md:text-[28px] font-bold tracking-[-0.02em] leading-[1.05]" style={display}>{h}</div>
              <p className="mt-3 text-[15px] leading-relaxed text-[#0a0a0a]/60 max-w-[40ch]">{b}</p>
            </div>
          ))}
        </div>
        <a href={xurl("contract", LIVE_CONTRACT)} target="_blank" rel="noreferrer" className="mt-12 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.18em] border-b-2 pb-1 hover:opacity-70" style={{ borderColor: ACCENT, color: "#0a0a0a" }}>{t.trust.contractBtn}</a>
      </div></section>

      {/* ATTACK — they hold + hide the spread; we don't (inverted INK punch) */}
      <section className="px-4 md:px-6 py-2"><div data-reveal className="bg-[#0a0a0a] text-[#f1eee7] rounded-[1.75rem] md:rounded-[2.5rem] max-w-[1200px] mx-auto px-6 md:px-14 py-24 md:py-36">
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.3em] text-[#f1eee7]/40">
          <span className="h-px w-8 bg-[#f1eee7]/30" /><span>{t.attack.stamp}</span>
        </div>
        <h2 className="mt-10 font-black uppercase tracking-[-0.04em] leading-[0.88] text-[clamp(2.5rem,8vw,5.5rem)] max-w-[14ch]" style={display}>{t.attack.h}</h2>
        <div className="mt-16 grid md:grid-cols-3 gap-x-12 gap-y-12">
          {t.attack.items.map(([h, b], i) => (
            <div key={h} className="border-t-2 pt-6" style={{ borderColor: ACCENT }}>
              <div className="font-mono text-[11px] tracking-[0.2em]" style={{ color: ACCENT }}>0{i + 1}</div>
              <div className="mt-3 text-2xl md:text-[28px] font-bold tracking-[-0.02em] leading-[1.05]" style={display}>{h}</div>
              <p className="mt-3 text-[15px] leading-relaxed text-[#f1eee7]/65 max-w-[40ch]">{b}</p>
            </div>
          ))}
        </div>
      </div></section>

      {/* CTA — waitlist */}
      <section id="lista" className={sec}><div className="max-w-[1200px] mx-auto px-6 md:px-12 py-28 md:py-40">
        <h2 className="font-black uppercase tracking-[-0.055em] leading-[0.82] text-[clamp(3rem,13vw,10rem)] text-center md:text-left" style={display}>{t.cta.h}</h2>
        <div className="mt-8 flex flex-col gap-1 text-xl md:text-2xl text-[#0a0a0a]/65 text-center md:text-left">{t.cta.lines.map((l) => <span key={l}>{l}</span>)}</div>
        <div className="mt-12 flex flex-col items-center md:items-start gap-5">
          <Waitlist source="cofrinho" lang={lang} />
          <Link to="/account" className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#0a0a0a]/45 border-b border-[#0a0a0a]/20 hover:border-[#0a0a0a] pb-0.5">{lang === "pt" ? "ver o app ao vivo →" : "see the live app →"}</Link>
        </div>
        <div className="mt-20 font-mono text-[10px] uppercase tracking-[0.28em] text-[#0a0a0a]/30">{t.footer}</div>
      </div></section>
    </div>
  );
}
