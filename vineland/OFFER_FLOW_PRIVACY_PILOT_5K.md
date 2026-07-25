# Vineland — Flow-Privacy Exposure Audit + Design Pilot · $4,997 (fixed)

**For:** an algotrader, quant fund, market maker, or whale whose on-chain flow is
being shadowed, front-run, or reverse-engineered — and who wants to know *exactly*
how exposed they are, and what closing it looks like.

**Delivery:** 5 business days. Fixed price, fixed scope. No retainer.

**Honest framing, up front.** This pilot does **not** make your flow private today.
The behavioral-privacy protocol (riverrun) is a research prototype, not production
(its self-audit and gaps are public). What this delivers today is the *diagnosis
and the blueprint*: a real adversarial audit of how deanonymizable your flow is —
run with the same tooling a hostile actor would use — plus the architecture to
close it. **You buy the map before the build.**

---

## What you get (concrete, all deliverable in 5 days)

1. **A deanonymization audit of your real on-chain flow.**
   We run the `provenance-tracer` (proven on live mainnet) and the
   behavioral-clustering harness against your actual addresses:
   - how far your funding traces **back to an attributable origin** (a CEX, a
     doxxed funder), and in how many hops;
   - how your **timing and position-sizing fingerprint** clusters your wallets
     and links your moves;
   - which specific signals (co-buy timing, sizing, the common-funder graph) make
     you **front-runnable and strategy-reconstructable**.
   Delivered as a **re-runnable report against public tooling** — you re-check the
   math, you don't trust us.

2. **Your exposure, quantified.** Concrete numbers, not adjectives: root-hit rate,
   the attacker's attribution accuracy on your pattern, and the ranked leaks that
   cost you the most.

3. **A privacy architecture for *your* flow.** A concrete design of how riverrun's
   behavioral-anonymity layer plus Vineland's confidential-settlement layer would
   protect your specific flow: what is hideable, what is not, the honest roadmap
   and cost, and the **regulatory framing** (provable-compliance with selective
   disclosure — not pure hiding, which is the OFAC trap).

4. **A private walkthrough.** A working session that walks your desk through the
   report and the design, with the raw tooling handed over so your own engineers
   re-run it.

---

## Price

- **$4,997**, fixed. 50% to start, 50% on delivery.
- Settles in USDC (or invoice/bank, your choice).
- Scope is exactly the four items above, for **one** entity's flow. Ongoing
  protection or the built integration = separate scope.

---

## Why now

Your flow is already being watched. Every rail can move your money; none tells you
**how visible you are** while it does. This pilot puts a number on your exposure in
a week — and hands you the blueprint (and the public tooling) to close it, before a
front-runner or a competitor does the reconstruction for you.

---

## Honest scope boundary

- This delivers a **diagnosis + design**, not live protection. The behavioral-
  privacy protocol is a prototype (see the riverrun Security status); Vineland's
  confidential-settlement layer is live on Stellar for amounts/recipients, but the
  behavioral layer that this design proposes is roadmap.
- We **do not** custody funds, touch your keys, or execute trades. We read public
  on-chain data and the addresses you provide, and analyze them.
- The number we hand you is a *lower bound* on your exposure: our trace is
  deliberately bounded; a funded adversary goes deeper. If we can reconstruct this
  much in five days, so can they.

---

## Why this is the honest wedge (internal note, not for the client)

- Sells what actually works **today** (the tracer + behavioral harness, mainnet-
  proven) as service revenue — the "bridge" in the Vineland positioning doc — while
  the rail (riverrun protection + take-rate on protected flow) is still being built.
- Mirrors the proven `OFFER_AGENT_PAYMENT_PILOT_5K` structure: fixed price, 5 days,
  a re-runnable adversarial report as the hard deliverable, no retainer.
- Puts Vineland in front of exactly the segment that pays for privacy (funds/MMs/
  whales), with a diagnosis they can't get elsewhere, and opens the door to the
  take-rate rail once riverrun's audit gaps (1c / on-chain verification) close.
