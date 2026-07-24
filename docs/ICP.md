# Vineland — ideal customer profile (closed beta)

*Who the first customers are, chosen by the one rule that de-risks everything.*

## The one rule: the first customer must bring a crowd

Confidentiality is a crowd property. A privacy pool with one participant hides
nobody (the ruler would prove `effective-k = 1`). So the beta ICP is **not** ranked
by pain or willingness-to-pay first — it is ranked by **"does this customer bring
N KYC'd participants in one integration?"** A customer that brings a crowd solves
the cold-start problem that no code solves. A customer that is a single wallet, no
matter how much pain it has, does not.

This flips the intuition: the ideal first customer is **not the fund that wants
privacy** — it is the **platform whose clients want privacy**.

## Primary ICP — the aggregator/integrator (brings the crowd)

A platform that already serves **many KYC'd business clients** who transact on
Solana and do not want that activity public. One integration = N participants = a
real anonymity set on day one.

Concrete shapes, best first:

1. **A B2B stablecoin payments rail / OTC desk.** Already KYCs its clients, already
   moves their USDC, and its clients hate that every payment, counterparty and
   amount is public. *(This is Slippay's existing world — warm intros, regulatory
   familiarity, and a KYC partner already in the loop: 4P / Etherfuse.)*
2. **A crypto payroll / treasury platform.** Many companies paying contributors and
   salaries on-chain; payroll is the most sensitive leak on a public ledger.
3. **A market-maker / prop desk serving multiple funds.** Runs strategies for a book
   of clients who are being front-run; brings a crowd of professional traders.
4. **A DAO tooling / treasury platform.** Many DAO clients whose treasury moves and
   contributor payments are public.

**The pitch to them:** *"Your clients' payments are naked on-chain — competitors read
their payroll, suppliers, and margins. Embed Vineland and offer them confidential,
still-compliant settlement. You keep the client relationship; we provide the privacy
layer; we split the fee. Your clients are the crowd that makes each other private."*

Why they are ideal, against the one rule:
- **They bring the crowd** (their clients = the anonymity set).
- **They already do KYC** (or have a partner), so the compliance gate is filled.
- **They feel the pain through their clients** (churn/complaints), so WTP is real.
- **One sale = N participants**, so the pool reaches a useful `effective-k` fast.

## Secondary ICP — the acute-pain direct user (validate, don't scale)

A crypto-native **fund or prop desk** bleeding to MEV front-running. Highest pain,
highest WTP per seat — but a single fund is `k = 1` and does **not** bootstrap a
pool. Use it as a **design partner** to validate the pain and the UX, not as the way
to build the crowd. One or two of these, in parallel with an aggregator, is right.

## Disqualifiers (who NOT to chase in the beta)

- **Retail / memecoin traders.** No compliance appetite, no B2B confidentiality pain,
  and they are the "anonymous mixer" demand — the legally radioactive segment.
- **Anyone who wants to hide from the operator or the regulator.** Turn them away.
  That is the illegal use, and taking them is the Tornado-Cash prosecution template.
- **Single entities with no crowd**, except as design partners for validation.

## Closed-beta selection checklist

A candidate qualifies when it meets **all** of:

1. Brings **≥ N KYC'd participants** in one integration (the crowd test).
2. Has, or accepts, a **licensed KYC issuer** (4P / Etherfuse / equivalent).
3. Transacts on **Solana** (or will migrate a real flow to it).
4. Has a **concrete confidentiality pain** — payroll leak, supplier terms, or
   strategy front-run — that its clients name unprompted.
5. Will be a **design partner**: co-build, tolerate rough edges, sign a pilot.
6. **Bonus, prioritize:** Brazilian / LatAm, so the warm network (Slippay's B2B and
   comex relationships) and the KYC partner shorten the first close.

## Beta shape and the honest sequence

- **1–3 aggregator design partners**, each bringing a small crowd, non-custodial,
  with the **ruler proving the crowd's privacy** to each participant. Goal: prove the
  full loop with **real participants** and get the **legal + KYC partner** signed.
  Not revenue yet — validation and the crowd.
- **Beachhead first, pool second.** Sell the **ruler as a compliance API** to the
  same aggregators/desks now (it bills in weeks, needs no license, and opens the
  relationship). Then land the confidential pool on top, using that aggregator's
  KYC'd clients as the crowd. The ruler is the wedge; the pool is the expansion.

## The warmest first door (concrete)

Vineland's fastest qualified lead is inside the founder's own network: **Slippay's
existing B2B / comex relationships**, whose clients already move value cross-border
and already hate exposing counterparties and amounts, with **4P (Mário) / Etherfuse**
as the KYC/settlement partner. That is an aggregator that brings a crowd, has a KYC
path, and comes with a warm intro — the textbook first design partner.
