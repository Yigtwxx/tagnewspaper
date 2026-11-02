# Güvenlik politikası

## Açık bildirme

Bir güvenlik açığı bulduysanız lütfen **herkese açık issue açmayın**. Bunun yerine GitHub'ın
gizli bildirim formunu kullanın:

https://github.com/Yigtwxx/tagnewspaper/security/advisories/new

Bildiriminizde şunları yazmanız yeterli: etkilenen bileşen (`web/` ya da `pipeline/`), açığın
nasıl tekrarlandığı ve olası etkisi. Bildirimler birkaç gün içinde yanıtlanır.

## Kapsam

- `web/`: Next.js uygulaması ve `/api/*` uç noktaları
- `pipeline/`: haber toplama, özetleme ve veritabanı yazma süreci
- `.github/workflows/`: CI ve zamanlanmış görevler

## Uygulanan önlemler

- Secret'lar yalnızca ortam değişkenlerinde (GitHub Secrets, Vercel env) tutulur, depoya girmez.
- Web uygulaması veritabanına **salt okunur** bir kullanıcıyla bağlanır; tek yazan pipeline'dır.
- `/api/revalidate` sabit zamanlı secret karşılaştırması kullanır.
- `/api/news` sorgu parametreleri şema ile doğrulanır, cursor değeri katı bir biçime uymak zorundadır.
- Haber metinleri kişisel verilerden (telefon, plaka, TC kimlik no, e-posta) arındırılır, tam metin saklanmaz.
