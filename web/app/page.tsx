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
import { SideRails } from '@/components/SideRails';
import { TopBar } from '@/components/TopBar';
import { getMarket, getSnapshot } from '@/lib/data';
import { editionStart, formatDate, issueNumber } from '@/lib/format';
import { isEmptySnapshot } from '@/lib/schema';

export default async function Home() {
  const [snapshot, market] = await Promise.all([getSnapshot(), getMarket()]);
  const hasData = !isEmptySnapshot(snapshot);

  return (
    <>
      <TopBar lastRunAt={snapshot.last_run_at} hasData={hasData} />
      <SideRails
        runningHead={
          hasData
            ? `SAYI ${issueNumber(snapshot.generated_at)}   ${formatDate(editionStart(snapshot.generated_at), { weekday: true }).toLocaleUpperCase('tr-TR')}`
            : 'İLK SAYI HAZIRLANIYOR'
        }
      />
      <main id="top">
        <Hero snapshot={snapshot} />
        <LeadAndFeed snapshot={snapshot} />
        <Numbers stats={snapshot.stats} />
        <CaseTimeline events={snapshot.events} />
        <NewsDensity snapshot={snapshot} />
        <SourceSpread snapshot={snapshot} />
        <TopicTrends snapshot={snapshot} />
        <ActorVoices statements={snapshot.actor_statements} />
        <MarketBrief market={market} />
      </main>
      <Colophon lastRunAt={snapshot.last_run_at} hasData={hasData} />
      <ThemeTriggers />
      <PageEffects />
    </>
  );
}
