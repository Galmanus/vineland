# Migração Solana — progresso da madrugada (17/06, autônomo)

Você dormiu, eu trabalhei. Tudo **não-destrutivo**: a Stellar (porquinho no ar, ZK
mainnet, SCF, contratos) está **intacta**. Isto é build novo em paralelo.

## Feito
- **Toolchain Solana**: solana CLI 4.0.2, Rust 1.96, anchor (avm) — instalados.
- **Devnet**: config + keypair `F9neSDGmb6tyPtuSFp4we2zvFA5WAaQYuFjBbagzmvTK` (sem valor real).
- **Workspace** `~/projects/vineland-solana/` (Anchor).
- **Programa `vineland_mandate`** (o MOAT, em Rust/Anchor) — porta a autonomia limitada
  da Stellar: o agente paga SÓ dentro das regras do dono — cap por pagamento, cap mensal,
  allowlist de quem pode receber; pausa; trava tudo fora disso (fail-closed). Non-custodial:
  o dono delega gasto limitado ao PDA via SPL delegate, mantendo a própria conta.
- **Teste** (localnet): paga-dentro-da-regra ✓, acima-do-cap ✗, fora-da-allowlist ✗,
  acima-do-cap-mensal ✗, pausado ✗. (rodando — ver `bt2.log`.)
- **Plano completo**: `vineland/docs/SOLANA_MIGRATION.md`.
- **Carteira escolhida**: Privy embedded Solana (biométrico, sem seed — "tudo na digital").

## O que SÓ você faz (de manhã, destrava o resto)
1. **Conta no Privy** (privy.io) → me passa o App ID. É a carteira biométrica Solana.
2. **Com o contato do Superteam:**
   - **grant/bounty** que a Vineland pega? (qual, quanto, prazo)
   - eles conectam um **ramp Pix→USDC em Solana** licenciado? (ou uso pixbr, que faz Solana)
   - créditos de infra (RPC)?

## O que falta eu construir (com a máquina pronta, em luz do dia)
- carteira biométrica Solana (Privy) — provar criar + receber USDC
- ligar o ramp Solana no /cash
- portar o frontend (porquinho) pra apontar na carteira Solana
- programas: recurring → ZK → agente (na ordem de valor)
- cutover só quando tudo isso funcionar (Stellar de backup até lá)

## Status do build
- ✅ **`vineland_mandate.so` COMPILA em Solana** (target/deploy/, 203KB, anchor-lang 1.0.2).
  O moat (autonomia limitada provada) porta pra Solana e compila. Program id:
  VhvqPBz1qJ1sKEY5tAzsWcyNkFP5GLRjZa8j4eGA8n8.
- ⏳ Teste funcional (localnet): bloqueado por tooling — o anchor-cli prebuilt exige
  GLIBC 2.39 (esta máquina é mais velha). Solução em curso: compilando anchor-cli 1.0.2
  do FONTE (linka glibc local, roda aqui). Quando pronto: `anchor test` roda o teste do moat.
- devnet airdrop com rate-limit (faucet público) — teste vai em localnet (grátis), não precisa.

## ✅ MOAT PROVADO EM RUNTIME NA SOLANA (17/06 10:20)
`vineland_mandate` deployado em validador + **6/6 testes passando**:
- ✓ paga dentro do cap pra vendor na allowlist (15 USDC)
- ✓ bloqueia acima do cap por pagamento
- ✓ bloqueia recipient fora da allowlist
- ✓ segunda cobrança dentro do cap mensal (total 35)
- ✓ bloqueia acima do cap mensal
- ✓ bloqueia quando pausado

Deploy success, program id VhvqPBz1qJ1sKEY5tAzsWcyNkFP5GLRjZa8j4eGA8n8.
A autonomia limitada (fail-closed) — a peça mais difícil/diferenciada do Vineland — COMPILA, DEPLOYA e FUNCIONA em Solana.
