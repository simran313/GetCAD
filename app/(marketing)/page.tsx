import type { Metadata } from "next";

import { FAQ, INCLUDED } from "@/components/marketing/content";
import { CastPipeline } from "@/components/marketing/home/cast-pipeline";
import { DraftClaimsBanner } from "@/components/marketing/home/draft-banner";
import { Faq } from "@/components/marketing/home/faq";
import { CostStack, SimplePricing, SwitchGrid, TeamStrip, WorkGallery } from "@/components/marketing/home/more-sections";
import { FinalCta, Hero, HowItWorks, ProofBar, Section } from "@/components/marketing/home/sections";
import { StickyMobileCta } from "@/components/marketing/home/sticky-cta";
import { c, showClaim } from "@/content/claims";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(
  "Factory-ready jewelry CAD, in hours",
  "The AI-native jewelry CAD studio. Our AI models every piece and senior designers check every file. First look within 6 hours, bulk orders included, or it's free. From $35 a design.",
  "/",
);

/** Home (redesign step 4): the conversion sequence a–l. */
export default function HomePage() {
  const faq: [string, string][] = [
    ["What if the file doesn't cast?", `Every file ships with a signed spec sheet. If a delivered file breaks its own spec, we fix it free and refund the CAD fee. Claims are open for ${c("CLAIM_WINDOW_DAYS")} days.`],
    ["Who sees my designs?", "Only the team on your order. Designers never see who you are or who your customer is, and your work is never shown to anyone. You own the files once paid, under NDA by default."],
    ...FAQ.filter(([q]) => /fast|files do I get|changes/i.test(q)),
    ["Do you use AI to make the CAD?", `Yes. Our AI models each piece with methods we built for jewelry CAD, which is how a first look takes hours, not days. A senior designer then checks and finishes every file against your brief and your factory's rules, and a master craftsman signs it off. ${c("FIRST_LOOK_ACCURACY")} of first looks are right first time.`],
    ["How do I pay?", "Only after you accept the price: by card, or by Wise, bank transfer or PayPal. Pay per design, or ask about a retainer for regular orders."],
    ...FAQ.filter(([q]) => /based/i.test(q)),
  ];
  return (
    <>
      <DraftClaimsBanner />
      <Hero />
      <ProofBar />
      <HowItWorks />
      <Section id="quality" tone="subtle" eyebrow="Quality" title="Every file is made to be cast." lead="Two people sign every file before you see it: the designer who built it, and a master craftsman who checks it against the same list and your factory's own rules.">
        <CastPipeline checkpoints={c("QC_CHECKPOINTS")} years={showClaim("MIN_EXPERIENCE_YEARS") ? c("MIN_EXPERIENCE_YEARS") : null} />
      </Section>
      <Section eyebrow="Why it is fast, and costs less" title={c("AI_LINE")} lead="Our AI models each piece and runs intake, routing and tracking, so a first look takes hours and you pay for expertise, not overhead. Senior designers who know factory requirements across countries check every file.">
        <CostStack />
      </Section>
      <Section tone="subtle" eyebrow="Why jewelers switch" title="Fewer remakes. No chasing. Your designs stay yours.">
        <SwitchGrid />
      </Section>
      <Section eyebrow="Work" title="From sketch to castable CAD." lead="Every piece goes from your sketch or photo to a 3DM and STL, with renders to approve.">
        <WorkGallery />
      </Section>
      <Section id="quote" tone="subtle" eyebrow="Pricing" title={`From ${c("ENTRY_PRICE")} a design.`} lead="One simple price to start, and retainers for jewelers who order every week.">
        <SimplePricing entry={c("ENTRY_PRICE")} included={INCLUDED} />
      </Section>
      {showClaim("TEAM") && (
        <Section eyebrow="The team" title="Senior people on every file." lead="Names stay private, both ways: you don't see who designed your piece, and they never see who you are.">
          <TeamStrip />
        </Section>
      )}
      <Section id="faq" eyebrow="Questions" title="What jewelers ask first.">
        <Faq items={faq} />
      </Section>
      <FinalCta />
      <StickyMobileCta phone={c("LIVE_CALL_PHONE")} />
    </>
  );
}
