import type { Metadata } from "next";

import { FAQ, PRICE_BANDS } from "@/components/marketing/content";
import { CastPipeline } from "@/components/marketing/home/cast-pipeline";
import { DraftClaimsBanner } from "@/components/marketing/home/draft-banner";
import { Faq } from "@/components/marketing/home/faq";
import { CostStack, SwitchGrid, TeamStrip, WorkGallery } from "@/components/marketing/home/more-sections";
import { QuoteWidget } from "@/components/marketing/home/quote-widget";
import { FinalCta, Hero, HowItWorks, ProofBar, Section } from "@/components/marketing/home/sections";
import { StickyMobileCta } from "@/components/marketing/home/sticky-cta";
import { c } from "@/content/claims";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(
  "Factory-ready jewelry CAD, checked by two experts",
  "Senior designers build every file to cast first time; a master craftsman signs it off. First look within 6 hours of order confirmation, or it's free. From $55 a design, your first $49.",
  "/",
);

const band = (name: string) => PRICE_BANDS.find((b) => b.band === name)?.price ?? "";

/** Home (redesign step 4): the conversion sequence a–l. */
export default function HomePage() {
  const faq: [string, string][] = [
    ["What if the file doesn't cast?", `Every file ships with a signed spec sheet. If a delivered file breaks its own spec, we fix it free and refund the CAD fee. Claims are open for ${c("CLAIM_WINDOW_DAYS")} days.`],
    ["Who sees my designs?", "Only the team on your order. Designers never see who you are or who your customer is, and your work is never shown to anyone. You own the files once paid, under NDA by default."],
    ...FAQ.filter(([q]) => /fast|files do I get|changes/i.test(q)),
    ["Do you use AI to make the CAD?", "No. AI runs our operations: intake, routing, scheduling, checklists and tracking. Every file is modelled by a senior designer and checked by a master craftsman."],
    ["How do I pay?", "Only after you accept the price: by card, or by Wise, bank transfer or PayPal. No retainer and no minimum order."],
    ...FAQ.filter(([q]) => /based/i.test(q)),
  ];
  return (
    <>
      <DraftClaimsBanner />
      <Hero />
      <ProofBar />
      <HowItWorks />
      <Section id="quality" tone="subtle" eyebrow="Quality" title="Every file is made to be cast." lead="Two people sign every file before you see it: the designer who built it, and a master craftsman who checks it against the same list and your factory's own rules.">
        <CastPipeline checkpoints={c("QC_CHECKPOINTS")} years={c("MIN_EXPERIENCE_YEARS")} />
      </Section>
      <Section eyebrow="Why it costs less" title={c("AI_LINE")} lead="AI handles intake, routing, scheduling, checklists and tracking, so you pay for design time, not overhead. Every file is still built and checked by people.">
        <CostStack />
      </Section>
      <Section tone="subtle" eyebrow="Why jewelers switch" title="Fewer remakes. No chasing. Your designs stay yours.">
        <SwitchGrid />
      </Section>
      <Section eyebrow="Work" title="From sketch to castable CAD." lead="Every piece goes from your sketch or photo to a 3DM and STL, with renders to approve.">
        <WorkGallery />
      </Section>
      <Section id="quote" tone="subtle" eyebrow="Pricing" title={`From ${c("ENTRY_PRICE")} a design. Your first ${c("FIRST_DESIGN_PRICE")}.`} lead="Fixed bands, no retainer. Pick the piece and how detailed it is.">
        <QuoteWidget
          bands={{ standard: band("Standard"), complex: band("Complex"), sculpted: band("Sculpted"), firstDesign: band("First design") }}
          firstLookHours={c("FIRST_LOOK_HOURS")}
        />
      </Section>
      <Section eyebrow="The team" title="Senior people on every file." lead="Names stay private, both ways: you don't see who designed your piece, and they never see who you are.">
        <TeamStrip />
      </Section>
      <Section id="faq" eyebrow="Questions" title="What jewelers ask first.">
        <Faq items={faq} />
      </Section>
      <FinalCta />
      <StickyMobileCta phone={c("LIVE_CALL_PHONE")} />
    </>
  );
}
