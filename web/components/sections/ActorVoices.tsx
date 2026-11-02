import { formatDate } from '@/lib/format';
import { ACTOR_LABEL } from '@/lib/labels';
import { ACTORS, type ActorStatementT } from '@/lib/schema';

export function ActorVoices({ statements }: { statements: ActorStatementT[] }) {
  const byActor = ACTORS.map((actor) => ({
    actor,
    items: statements.filter((s) => s.actor === actor).slice(0, 3),
  })).filter((g) => g.items.length > 0);

  return (
    <section
      id="taraflar"
      data-section="actors"
      data-theme="paper"
      className="px-4 py-28 sm:px-8 sm:py-36"
    >
      <div className="mx-auto max-w-[1360px]">
        <div className="section-head mb-12 grid gap-4 lg:grid-cols-[1fr_minmax(0,30rem)] lg:items-end">
          <h2 className="section-title mt-4">Kim ne diyor?</h2>
          <p className="dek">
            Tarafların haberlere yansıyan son açıklamaları. Bunlar birebir alıntı değildir; haberi
            yazan yayın organının aktardığı şekliyle özetlenmiştir.
          </p>
        </div>

        {byActor.length === 0 ? (
          <p className="dek">Henüz aktarılmış bir açıklama yok.</p>
        ) : (
          <div className="grid gap-x-10 gap-y-16 sm:grid-cols-2 lg:grid-cols-4">
            {byActor.map(({ actor, items }) => (
              <div key={actor} className="flex flex-col gap-6 border-t border-(--fg) pt-4">
                <h3 className="font-serif text-xl font-bold">{ACTOR_LABEL[actor]}</h3>
                <ul className="flex flex-col gap-7">
                  {items.map((s) => (
                    <li
                      key={`${s.article_id}-${s.summary.slice(0, 12)}`}
                      className="flex flex-col gap-2"
                    >
                      <p className="text-[1.15rem] leading-snug">{s.summary}</p>
                      <p className="meta">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link-underline"
                        >
                          {s.source_name}
                        </a>
                        , {formatDate(s.date)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
