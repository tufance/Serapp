# Sera Takip Uygulaması

Cloudflare Pages + Workers + D1 üzerinde, mobil-first sera takip aracı.

Spec: `../docs/superpowers/specs/2026-06-30-sera-takip-design.md`
Plan: `../docs/superpowers/plans/2026-06-30-sera-takip-faz-0-1.md`

## Kurulum

1. `npm install`
2. `npx wrangler login`
3. D1 ve KV oluştur, ID'leri `wrangler.toml`'a yaz (bkz. plan Task 3)
4. Migration: `npm run migrate:remote`
5. Deploy: `npm run deploy`
6. Tarayıcıdan ilk açılışta parola belirle

## Komutlar

- `npm run dev` — lokal (miniflare) sunucu
- `npm test` — vitest
- `npm run migrate:local` / `migrate:remote` — D1 migration
- `npm run seed:local` / `seed:remote` — opsiyonel master data seed

## Sonraki fazlar

Modül 1-6 hareket tabloları sonraki planlarda eklenecek:
- Faz 2: Fidan/sarf/ilaç alımları + stok
- Faz 3: Tüketim + aylık rapor
- Faz 4: Satış + piyasa snapshot + ortak mutabakat
- Faz 5: Grafikler, modaller, cila
