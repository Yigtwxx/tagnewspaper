import { z } from 'zod';

/** Runtime schemas mirroring shared/CONTRACT.md. The pipeline is the only writer. */

export const CATEGORIES = [
  'dava',
  'regulasyon',
  'taksici_odasi',
  'sirket',
  'surucu_yolcu',
  'saha',
  'ekonomi',
  'diger',
] as const;

export const ACTORS = [
  'marti',
  'taksici_odasi',
  'ibb_ukome',
  'bakanlik',
  'mahkeme',
  'surucu',
  'yolcu',
  'diger',
] as const;

export const Category = z.enum(CATEGORIES);
export const Actor = z.enum(ACTORS);
export const Display = z.enum(['full', 'headline_only', 'hidden']);
export const RiskLevel = z.enum(['low', 'medium', 'high']);
export const Origin = z.enum(['google_news', 'publisher_rss', 'gdelt']);
export const EventType = z.enum(['court_decision', 'filing', 'regulation', 'statement', 'other']);
export const StatKey = z.enum(['registered_riders', 'drivers', 'drivers_istanbul']);

const IsoDateTime = z.iso.datetime({ offset: true });
const IsoDate = z.iso.date();

export const Source = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
});

export const ArticleView = z.object({
  id: z.string().min(1),
  url: z.url(),
  title: z.string().min(1),
  source: Source,
  published_at: IsoDateTime,
  display: Display,
  summary: z.string().nullable(),
  category: Category,
  actors: z.array(Actor),
  is_allegation: z.boolean(),
  risk_level: RiskLevel,
  cluster_id: z.string(),
  origin: Origin,
});

export const Evidence = z.object({
  url: z.url(),
  source_name: z.string(),
  domain: z.string(),
});

export const CaseEvent = z.object({
  id: z.string(),
  date: IsoDate,
  type: EventType,
  title: z.string(),
  description: z.string(),
  court: z.string().nullable(),
  evidence: z.array(Evidence),
  published: z.boolean(),
  is_seed: z.boolean(),
});

export const Stat = z.object({
  key: StatKey,
  label: z.string(),
  value: z.number().int().nonnegative(),
  as_of: IsoDate,
  scope: z.string(),
  source_name: z.string(),
  source_url: z.url(),
});

export const ActorStatement = z.object({
  actor: Actor,
  summary: z.string(),
  date: IsoDateTime,
  article_id: z.string(),
  source_name: z.string(),
  url: z.url(),
});

export const Snapshot = z.object({
  generated_at: IsoDateTime,
  last_run_at: IsoDateTime,
  lead: z
    .object({
      article: ArticleView,
      sources: z.array(z.object({ name: z.string(), domain: z.string(), url: z.url() })),
    })
    .nullable(),
  latest: z.array(ArticleView),
  events: z.array(CaseEvent),
  stats: z.array(Stat),
  daily_counts: z.array(z.object({ date: IsoDate, count: z.number().int().nonnegative() })),
  source_counts: z.array(
    z.object({
      name: z.string(),
      domain: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  category_weekly: z.array(
    z.object({
      week_start: IsoDate,
      counts: z.record(Category, z.number().int().nonnegative()),
    }),
  ),
  actor_statements: z.array(ActorStatement),
  totals: z.object({
    articles_90d: z.number().int().nonnegative(),
    sources_90d: z.number().int().nonnegative(),
  }),
});

export const NewsPage = z.object({
  items: z.array(ArticleView),
  next_cursor: z.string().nullable(),
});

export type CategoryT = z.infer<typeof Category>;
export type ActorT = z.infer<typeof Actor>;
export type ArticleViewT = z.infer<typeof ArticleView>;
export type CaseEventT = z.infer<typeof CaseEvent>;
export type StatT = z.infer<typeof Stat>;
export type ActorStatementT = z.infer<typeof ActorStatement>;
export type SnapshotT = z.infer<typeof Snapshot>;
export type NewsPageT = z.infer<typeof NewsPage>;

/** Rendered when the database is unreachable or not populated yet. Never fake content. */
export const EMPTY_SNAPSHOT: SnapshotT = {
  generated_at: '1970-01-01T00:00:00Z',
  last_run_at: '1970-01-01T00:00:00Z',
  lead: null,
  latest: [],
  events: [],
  stats: [],
  daily_counts: [],
  source_counts: [],
  category_weekly: [],
  actor_statements: [],
  totals: { articles_90d: 0, sources_90d: 0 },
};

export function isEmptySnapshot(s: SnapshotT): boolean {
  return s.generated_at === EMPTY_SNAPSHOT.generated_at;
}
