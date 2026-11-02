# Katkı rehberi

Katkılarınız memnuniyetle karşılanır: hata düzeltmeleri, yeni veri kaynakları, erişilebilirlik
iyileştirmeleri ve daha iyi grafikler.

## Başlamadan önce

- Büyük bir değişiklik düşünüyorsanız önce bir issue açıp kısaca anlatın.
- İçerik hatası ya da kaldırma talebi için kod değil, **Düzeltme talebi** şablonunu kullanın.

## Geliştirme ortamı

Gereksinimler: Node.js 22+, [uv](https://docs.astral.sh/uv/) ve Python 3.12 (uv kendisi kurar).

```bash
# Web
cd web
cp .env.example .env.local      # veritabanı olmadan da çalışır (boş durum)
npm install
TAGNEWS_DEMO_DATA=1 npm run dev  # kurgusal örnek verilerle

# Pipeline
cd pipeline
cp .env.example .env
uv sync
uv run python -m tagnews run --dry-run   # hiçbir şey yazmadan çeker ve sayar
```

## Kurallar

- Kod, isimler ve yorumlar İngilizce; arayüz metinleri Türkçe.
- Python: tip anotasyonu zorunlu, `ruff check` ve `ruff format` temiz olmalı, `pytest` geçmeli.
- TypeScript: `strict`, `prettier` (tek tırnak), `eslint`, `tsc --noEmit` ve `vitest` temiz olmalı.
- Veri şeklini değiştiren her şey önce `shared/CONTRACT.md` ve `shared/fixtures/` içinde güncellenir;
  iki taraftaki kontrat testleri aynı dosyaları okur.
- Commit mesajları [Conventional Commits](https://www.conventionalcommits.org/) biçiminde:
  `feat(web): …`, `fix(pipeline): …`, `docs: …`.

## İçerik ilkeleri

Kod değişiklikleri şu ilkeleri zayıflatmamalıdır:

1. Özetler 2–3 cümle ve kendi cümlelerimizle; kaynaktan uzun birebir alıntı yok.
2. İddialar “…'ya göre / iddia etti” diliyle ve `İddia` etiketiyle verilir.
3. Özel kişilerin adı, telefonu, plakası, kimlik numarası yayımlanmaz.
4. Dava gelişmeleri en az iki bağımsız kaynakta ya da birincil kaynakta doğrulanır.
5. Her öğe kaynağına bağlantı verir; yayıncı görselleri kullanılmaz.
6. Reklam ve Martı logosu yoktur.

## Güvenlik

Güvenlik açıklarını issue olarak değil, [SECURITY.md](SECURITY.md) içindeki gizli kanaldan bildirin.
Hiçbir koşulda `.env` dosyası, token ya da şifre commit etmeyin.
