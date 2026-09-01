import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Security & member data — MySportsApp",
  description:
    "What MySportsApp stores about your members, who can see it, how it's protected, how waivers are captured, and where the data lives.",
};

/**
 * The page to send an organization that asks "how is our members' data
 * handled?" — a question every serious league asks before committing a season.
 *
 * Deliberately more specific than the privacy policy. A policy is written for
 * everyone and has to stay general; this is written for the person doing due
 * diligence, so it names the region, the number of tables, and the one thing we
 * do NOT do. A page that only listed strengths would be the kind of page nobody
 * believes.
 *
 * Every claim here is checkable against the codebase. If one stops being true,
 * this page is wrong and must change with it.
 */
export default function SecurityPage() {
  return (
    <div className="bg-background text-foreground min-h-svh">
      <header className="border-rule border-b">
        <div className="mx-auto max-w-3xl px-5 py-5">
          <Link
            href="/"
            className="text-ink-2 hover:text-ink text-sm font-medium"
          >
            ← Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        <p className="text-claret text-xs font-bold tracking-[0.18em] uppercase">
          MySportsApp
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-balance">
          How we handle your members&rsquo; information
        </h1>
        <p className="text-ink-2 mt-4 leading-relaxed">
          Written for organizers deciding whether to run a season here: what we
          store, who can see it, how it&rsquo;s protected, how waivers work, and
          the one limit we&rsquo;d rather you heard from us than discovered.
        </p>

        <Section title="What we collect">
          <p>
            Only what running a league requires. There is no tracking, no
            advertising, and nothing is sold or shared with third parties.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-3 border-rule border-b text-left text-xs tracking-wide uppercase">
                  <th className="p-2.5 font-semibold">Data</th>
                  <th className="p-2.5 font-semibold">Why we hold it</th>
                </tr>
              </thead>
              <tbody className="text-ink-2">
                {[
                  [
                    "Name and email",
                    "To create an account, send team invitations, and confirm results.",
                  ],
                  [
                    "Phone (optional)",
                    "Only if a player supplies one when registering as an individual. Never required.",
                  ],
                  [
                    "Team and roster",
                    "To build schedules, standings and player statistics.",
                  ],
                  ["Scores and results", "The competition record itself."],
                  [
                    "Payment records",
                    "What was paid, by whom, and when — never the card itself.",
                  ],
                ].map(([what, why]) => (
                  <tr key={what} className="border-rule/60 border-b">
                    <td className="text-ink p-2.5 font-medium whitespace-nowrap">
                      {what}
                    </td>
                    <td className="p-2.5">{why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Who can see it">
          <p>
            Access is enforced by the database, not by the application. Every
            one of our{" "}
            <strong className="text-ink font-semibold">
              44 data tables has row-level security switched on
            </strong>
            , which means a request that isn&rsquo;t entitled to a row does not
            receive it — even if a bug in the website were to ask for it.
          </p>

          <div className="border-rule bg-surface mt-4 rounded-lg border p-4">
            <p className="text-ink font-semibold">
              A player&rsquo;s contact details are visible to:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>The player themselves</li>
              <li>Their own teammates</li>
              <li>The organizer running the competition their team is in</li>
              <li>Other administrators of that organization</li>
            </ul>
            <p className="mt-3">
              That is the complete list. Players in other teams cannot see them,
              players in other leagues cannot see them, and the public pages
              never contain them.
            </p>
          </div>

          <p className="mt-4">
            Individual sign-ups — where someone registers alone rather than with
            a team, and supplies an email and phone number — are tighter still:
            readable only by that person and by the organizers. Not by
            teammates, because at that point they don&rsquo;t have any.
          </p>
        </Section>

        <Section title="How it's protected">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <B>In transit.</B> Every connection to the site and the database
              is encrypted with TLS. The site is HTTPS-only.
            </li>
            <li>
              <B>At rest.</B> The database is encrypted on disk (AES-256) by our
              hosting provider, Supabase, running on Amazon Web Services.
            </li>
            <li>
              <B>Passwords.</B> We never see or store them. Authentication is
              handled by Supabase Auth, which stores only a salted hash.
            </li>
            <li>
              <B>Separation of keys.</B> The key the browser uses is
              low-privilege and bound by the rules above. The privileged key
              exists only on the server and is never sent to a browser.
            </li>
          </ul>
        </Section>

        <Section title="Payments">
          <Flag tone="good" heading="No card details ever reach us">
            Card entry happens on Stripe&rsquo;s own hosted checkout. Card
            numbers, expiry dates and security codes never touch our servers or
            our database — there is no column anywhere in our system capable of
            holding one. We keep only Stripe&rsquo;s reference for the payment,
            the amount, and who it was for.
          </Flag>
          <p className="mt-4">
            Stripe is a PCI Service Provider Level 1 — the highest certification
            in the card industry. Payouts go directly to your own connected
            Stripe account; the money does not sit with us.
          </p>
        </Section>

        <Section title="Waivers">
          <p>
            Your organization writes its own waiver text and approves it. Once
            approved,{" "}
            <strong className="text-ink font-semibold">
              the wording is locked
            </strong>{" "}
            — the database itself refuses an edit. Changing it later creates a
            new version, and every signature already given stays attached to the
            version it was given for. You can never end up having quietly
            amended something a member already agreed to.
          </p>

          <SubHeading>How a member signs</SubHeading>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              The agree button stays disabled until they have scrolled to the
              end of the text. &ldquo;I have read and agree&rdquo; under a box
              nobody opened is the part that falls over in the one conversation
              where it matters.
            </li>
            <li>
              Agreeing means <B>typing their name</B>, not ticking a box. That
              typed name is what we store.
            </li>
            <li>
              We record the name, the exact date and time, and a fingerprint of
              the precise wording they were shown — so the record proves what
              they agreed to, not merely that they agreed.
            </li>
          </ul>

          <SubHeading>How they&rsquo;re stored</SubHeading>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <B>Append-only.</B> A signature record cannot be edited or deleted
              by anyone, including us through the application. Evidence that can
              be altered afterwards is not evidence.
            </li>
            <li>
              <B>Nobody can sign for anybody else.</B> Enforced by the database,
              not by the screen.
            </li>
            <li>
              <B>Visible to the member and to your organizers.</B> Not to their
              teammates — whether somebody has signed a liability waiver is
              between them and you.
            </li>
          </ul>

          <SubHeading>What it gates</SubHeading>
          <p>
            A registered team stays <B>pending</B> until it has the number of
            players you require and <em>every one of them</em> has signed. A
            pending team is not scheduled and does not appear in standings. Add
            a player later and the team goes back to pending until that person
            signs too.
          </p>
        </Section>

        <Section title="Where the data lives, and backups">
          <p>
            Our database is hosted by Supabase on Amazon Web Services in the{" "}
            <strong className="text-ink font-semibold">
              US East region (Northern Virginia)
            </strong>
            . Your members&rsquo; data is therefore stored in the United States.
            This is lawful under Canadian privacy law (PIPEDA) provided members
            are informed, which is why we say it here rather than leaving it in
            a footnote.
          </p>
          <Flag tone="warn" heading="Daily backups, not point-in-time">
            The database is backed up <B>once a day</B>. We do not currently run
            point-in-time recovery, so in the worst case a restore could lose up
            to a day of changes — scores entered that evening, for instance. We
            would rather you knew the shape of that than assumed it is
            continuous.
          </Flag>
        </Section>

        <Section title="Your data stays yours">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <B>You own it.</B> Your rosters, schedules and results belong to
              your organization. We make no claim to them and do not use them
              for anything beyond running your competitions.
            </li>
            <li>
              <B>Export.</B> Ask and we will provide a full export of your
              league&rsquo;s data in a standard format.
            </li>
            <li>
              <B>Deletion.</B> A member can ask for their account to be deleted,
              and you can ask us to remove your organization&rsquo;s data
              entirely. Competition records that other people also appear in are
              handled case by case so we don&rsquo;t erase somebody else&rsquo;s
              season.
            </li>
            <li>
              <B>No selling, ever.</B> We do not sell personal data and we do
              not share it with advertisers.
            </li>
          </ul>
        </Section>

        <Section title="If something goes wrong">
          <p>
            If we became aware of a breach affecting your members, we would tell
            you directly and promptly with what we know, what was affected, and
            what we are doing — not wait for you to notice. We would support you
            in meeting any reporting obligations of your own.
          </p>
        </Section>

        <div className="border-rule text-ink-3 mt-12 border-t pt-6 text-sm">
          <p>
            Questions, or anything here you need in more detail — including a
            review by your own advisors — write to{" "}
            <a
              href="mailto:privacy@mysportsapp.ca"
              className="text-claret hover:underline"
            >
              privacy@mysportsapp.ca
            </a>
            . See also our{" "}
            <Link href="/privacy" className="text-claret hover:underline">
              privacy policy
            </Link>{" "}
            and{" "}
            <Link href="/terms" className="text-claret hover:underline">
              terms
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <h2 className="font-display text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="text-ink-2 mt-3 space-y-3 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-ink mt-6 font-semibold">{children}</h3>;
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="text-ink font-semibold">{children}</strong>;
}

/**
 * A coloured note. The tone carries meaning rather than decoration — green is
 * the reassurance, amber is the caveat — so it stays legible in print too.
 */
function Flag({
  tone,
  heading,
  children,
}: {
  tone: "good" | "warn";
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        tone === "good"
          ? "border-pine/30 bg-pine/8 mt-4 rounded-lg border p-4"
          : "mt-4 rounded-lg border border-amber-300/60 bg-amber-50 p-4"
      }
    >
      <p
        className={
          tone === "good"
            ? "text-pine text-xs font-bold tracking-[0.14em] uppercase"
            : "text-xs font-bold tracking-[0.14em] text-amber-800 uppercase"
        }
      >
        {heading}
      </p>
      <p className="text-ink-2 mt-2 leading-relaxed">{children}</p>
    </div>
  );
}
