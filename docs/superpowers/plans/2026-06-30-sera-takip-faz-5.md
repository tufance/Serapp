# Sera Takip — Faz 5 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development.

**Goal:** Cila. Pano grafikleri (Chart.js) + Satış edit modal + boş durum mesajları cilası. App.js modülerleştirme bu faza dahil değil — kullanıcı görünür iyileştirmelere odak.

**Branch:** `feat/seraapp-faz-5` from `main`

---

## Task 1: Chart.js CDN'i ekle + branch

`seraapp/public/index.html`'a Chart.js CDN script tag'i ekle (mevcut `app.js`'in üstüne):
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js"></script>
```

Commit: `chore(frontend): add Chart.js CDN`

---

## Task 2: Pano grafikleri — aylık tüketim bar + piyasa fiyatı zaman serisi

Pano'ya 2 grafik ekle (`renderPano` extend):
1. **Aylık tüketim grafiği** (bar) — `/api/reports/monthly-consumption?season_id=` × period_month × ay başına total_cost SUM
2. **Piyasa fiyatı zaman serisi** (çoklu çizgi) — `/api/market-prices` her ürünxcins için son N snapshot

CSS: `.chart-wrap { height: 220px; position: relative; }` (styles.css'e).

Commit: `feat(frontend): pano monthly consumption + market price charts`

---

## Task 3: Sales edit modal

`public/app.js`'a generic modal helper + sales için edit ekle.

`openModal(title, formHtml, onSave)`:
- Fixed-position overlay + card içinde form
- Kaydet/İptal butonları
- Save → onSave(formData) → success'te modal kapanır + listeyi render eder
- Mobile-first

`renderSatislar` listesindeki her item'a "Düzenle" butonu ekle → openModal ile sales PATCH formu (tarih, qty, fiyat, alıcı, maliyet, notlar — temel alanlar).

CSS: `.modal-overlay`, `.modal-card`.

Commit: `feat(frontend): generic edit modal + sales edit`

---

## Task 4: Empty state + helper messages cilası

`public/app.js`'taki "Henüz X yok" mesajlarına küçük yönlendirmeler ekle:
- "Henüz alım yok. Yukarıdaki formla ilk alımı ekleyin."
- "Henüz sezon yok. Ayarlar > Sezonlar'dan ekleyin."
- Pano'da aktif sezon yoksa "Sezon oluşturmak için ⚙ Ayarlar > Sezonlar"

Commit: `feat(frontend): friendlier empty states`

---

## Task 5: Deploy + PR + merge

```bash
cd seraapp && npm test  # 97/97 hala geçer
npm run migrate:remote  # 0008-0009 + (zaten Faz 4'te uygulandıysa atla)
npm run deploy
```

```bash
git push -u origin feat/seraapp-faz-5
gh pr create --base main --head feat/seraapp-faz-5 --title "feat(seraapp): Faz 5 — pano grafikleri + sales edit modal + cila" --body "..."
gh pr merge --squash --delete-branch
```

Smoke (tarayıcı): Pano'da iki grafik dolu, satış kayıtlarında "Düzenle" butonu, modal açılıp kapanıyor + güncelleme persist.

---

## Faz 5 tamamlandı

App spec'in tüm kapsamı bitti + temel cila yapıldı. **Sonraki (opsiyonel) Faz 6:** app.js modülerleştirme + her tabloya edit modal yayma + offline mode + Chart.js'in tema renkleriyle entegrasyonu.
