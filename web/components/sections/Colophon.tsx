import { LogoMark, Wordmark } from '@/components/Logo';
import { contactEmail, publisherName, REPO_URL } from '@/lib/site';

import { StaleNotice } from './StaleNotice';

export function Colophon({ lastRunAt, hasData }: { lastRunAt: string; hasData: boolean }) {
  const email = contactEmail();
  const publisher = publisherName();

  return (
    <footer
      id="kunye"
      data-section="colophon"
      data-theme="ink"
      className="px-4 pt-20 pb-12 sm:px-8 sm:pt-24"
    >
      <div className="mx-auto max-w-[1360px]">
        <div className="section-head mb-12">
          <h2 className="section-title mt-4">Bu gazete hakkında</h2>
        </div>

        <div className="grid gap-12 md:grid-cols-3">
          <div className="flex flex-col gap-4">
            <h3 className="font-sans text-lg font-bold">Bağımsızlık</h3>
            <p className="leading-relaxed text-white/85">
              TAGNEWSPAPER, Martı ile ya da herhangi bir tarafla bağlantısı olmayan, gönüllü bir
              bilgi sayfasıdır. Reklam almaz, para kazanmaz. Martı logosu ya da şirket adına konuşan
              bir içerik kullanılmaz.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="font-sans text-lg font-bold">Nasıl çalışır?</h3>
            <p className="leading-relaxed text-white/85">
              Haberler yayın organlarının kendi sitelerinden otomatik olarak toplanır ve yapay zekâ
              ile 2–3 cümlelik özetlere dönüştürülür. Özetler hata içerebilir; asıl bilgi her zaman
              bağlantı verilen kaynaktadır. İddia içeren haberler “İddia” etiketiyle ve kimin ne
              söylediği belirtilerek verilir.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="font-sans text-lg font-bold">Düzeltme ve kaldırma</h3>
            <p className="leading-relaxed text-white/85">
              Hatalı ya da kaldırılması gereken bir içerik görürseniz bize yazın; en kısa sürede
              inceleyip düzeltiriz.
            </p>
            <p className="flex flex-col gap-1 font-sans">
              {email && (
                <a
                  href={`mailto:${email}?subject=TAGNEWSPAPER%20d%C3%BCzeltme%20talebi`}
                  className="link-underline"
                >
                  {email}
                </a>
              )}
              <a
                href={`${REPO_URL}/issues/new?template=correction.yml`}
                target="_blank"
                rel="noopener noreferrer"
                className="link-underline"
              >
                GitHub üzerinden düzeltme talebi aç
              </a>
            </p>
          </div>
        </div>

        <div className="mt-24 flex flex-col gap-6 border-t border-(--line) pt-8 md:flex-row md:items-end md:justify-between">
          <p className="flex items-center gap-4" aria-label="The TAG Newspaper">
            <LogoMark className="size-[clamp(3rem,8vw,6.5rem)]" />
            <Wordmark className="text-[clamp(2.4rem,7vw,6rem)]" />
          </p>
          <div className="meta flex flex-col gap-1 md:items-end">
            {publisher && <p>Yayıncı: {publisher}</p>}
            {hasData && <StaleNotice lastRunAt={lastRunAt} />}
            <p>
              Kaynak kodu{' '}
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="link-underline"
              >
                GitHub
              </a>{' '}
              üzerinde, MIT lisansıyla açık.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
