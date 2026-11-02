import { Hero } from '@/components/hero/Hero';
import { ThemeTriggers } from '@/components/motion/ThemeTriggers';
import { ActorVoices } from '@/components/sections/ActorVoices';
import { CaseTimeline } from '@/components/sections/CaseTimeline';
import { Colophon } from '@/components/sections/Colophon';
import { NewsDensity, SourceSpread, TopicTrends } from '@/components/sections/DataSections';
import { LeadAndFeed } from '@/components/sections/LeadAndFeed';
import { Numbers } from '@/components/sections/Numbers';
import { TopBar } from '@/components/TopBar';
import { getSnapshot } from '@/lib/data';
import { isEmptySnapshot } from '@/lib/schema';

export default async function Home() {
  const snapshot = await getSnapshot();
  const hasData = !isEmptySnapshot(snapshot);

  return (
    <>
      <TopBar lastRunAt={snapshot.last_run_at} hasData={hasData} />
      <main id="top">
        <Hero />
        <LeadAndFeed snapshot={snapshot} />
        <Numbers stats={snapshot.stats} />
        <CaseTimeline events={snapshot.events} />
        <NewsDensity snapshot={snapshot} />
        <SourceSpread snapshot={snapshot} />
        <TopicTrends snapshot={snapshot} />
        <ActorVoices statements={snapshot.actor_statements} />
      </main>
      <Colophon lastRunAt={snapshot.last_run_at} hasData={hasData} />
      <ThemeTriggers />
    </>
  );
}
