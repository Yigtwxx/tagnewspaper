import { Hero } from '@/components/hero/Hero';
import { PageEffects } from '@/components/motion/PageEffects';
import { ThemeTriggers } from '@/components/motion/ThemeTriggers';
import { ActorVoices } from '@/components/sections/ActorVoices';
import { CaseTimeline } from '@/components/sections/CaseTimeline';
import { Colophon } from '@/components/sections/Colophon';
import { NewsDensity, SourceSpread, TopicTrends } from '@/components/sections/DataSections';
import { LeadAndFeed } from '@/components/sections/LeadAndFeed';
import { MarketBrief } from '@/components/sections/MarketBrief';
import { Numbers } from '@/components/sections/Numbers';
import { TopBar } from '@/components/TopBar';
import { getMarket, getSnapshot } from '@/lib/data';
import { editionStart, formatDate, issueNumber } from '@/lib/format';
import { isEmptySnapshot } from '@/lib/schema';

export default async function Home() {
  const [snapshot, market] = await Promise.all([getSnapshot(), getMarket()]);
  const hasData = !isEmptySnapshot(snapshot);
  const runningHead = hasData
    ? `SAYI ${issueNumber(snapshot.generated_at)}   ${formatDate(editionStart(snapshot.generated_at), { weekday: true }).toLocaleUpperCase('tr-TR')}`
    : 'İLK SAYI HAZIRLANIYOR';

  return (
    <>
      <TopBar lastRunAt={snapshot.last_run_at} hasData={hasData} />

      <main id="icerik">
        <Hero snapshot={snapshot} />
        <LeadAndFeed snapshot={snapshot} runningHead={runningHead} />
        <Numbers stats={snapshot.stats} runningHead={runningHead} />
        <CaseTimeline
          events={snapshot.events}
          articles={snapshot.latest}
          runningHead={runningHead}
        />
        <NewsDensity snapshot={snapshot} runningHead={runningHead} />
        <SourceSpread snapshot={snapshot} runningHead={runningHead} />
        <TopicTrends snapshot={snapshot} runningHead={runningHead} />
        <ActorVoices statements={snapshot.actor_statements} runningHead={runningHead} />
        <MarketBrief market={market} runningHead={runningHead} />
      </main>
      <Colophon lastRunAt={snapshot.last_run_at} hasData={hasData} runningHead={runningHead} />
      <ThemeTriggers />
      <PageEffects />
    </>
  );
}
