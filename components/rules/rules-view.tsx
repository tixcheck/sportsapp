import { Fragment } from "react";

import { isUpdate, ruleLines, type RuleSection } from "@/lib/competition/rules";

/**
 * A league's rules as players read them (0188). Updates — rules that say what
 * they replaced — come first under their own heading, the way Big Shoots lays
 * out its sheet; standing rules follow.
 */
export function RulesView({ rules }: { rules: RuleSection[] }) {
  const updates = rules.filter(isUpdate);
  const others = rules.filter((r) => !isUpdate(r));
  return (
    <div className="space-y-8">
      {updates.length > 0 && (
        <RuleGroup heading="Rule updates" rules={updates} />
      )}
      {others.length > 0 && (
        <RuleGroup
          heading={updates.length > 0 ? "Other rules" : "Rules"}
          rules={others}
        />
      )}
    </div>
  );
}

function RuleGroup({
  heading,
  rules,
}: {
  heading: string;
  rules: RuleSection[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-primary border-primary/40 border-b pb-1 text-sm font-semibold tracking-wide uppercase">
        {heading}
      </h2>
      {rules.map((r, i) => (
        <RuleCard key={`${r.title}-${i}`} rule={r} />
      ))}
    </section>
  );
}

function RuleCard({ rule }: { rule: RuleSection }) {
  const rows = [
    ...(rule.was ? [{ label: "What it was", text: rule.was }] : []),
    ...(rule.now
      ? [{ label: rule.was ? "What it is now" : "", text: rule.now }]
      : []),
    ...rule.details,
  ];
  return (
    <article className="border-border bg-surface overflow-hidden rounded-lg border">
      <header className="bg-muted flex flex-wrap items-center gap-2 px-4 py-2.5">
        <h3 className="text-foreground font-semibold">{rule.title}</h3>
        {rule.houseRule && (
          <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
            House rule
          </span>
        )}
      </header>
      <div className="space-y-3 px-4 py-3">
        {rule.note && (
          <p className="text-muted-foreground text-sm italic">{rule.note}</p>
        )}
        {rows.length > 0 && (
          <dl className="divide-border divide-y">
            {rows.map((row, i) => (
              <div
                key={i}
                className={
                  row.label
                    ? "grid gap-1 py-2 sm:grid-cols-[9rem_1fr] sm:gap-4"
                    : "py-2"
                }
              >
                {row.label && (
                  <dt className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase sm:pt-0.5">
                    {row.label}
                  </dt>
                )}
                <dd className="text-foreground text-sm leading-relaxed">
                  <RuleBody text={row.text} />
                </dd>
              </div>
            ))}
          </dl>
        )}
        {rule.inShort && (
          <p className="bg-foreground text-background rounded-md px-3 py-2 text-sm font-medium">
            <span className="text-background/70 mr-2 text-[11px] font-semibold tracking-wide uppercase">
              In short
            </span>
            {rule.inShort}
          </p>
        )}
      </div>
    </article>
  );
}

/** Plain text with "- " bullets and "1. " steps; never markup. */
function RuleBody({ text }: { text: string }) {
  const lines = ruleLines(text);
  return (
    <div className="space-y-1">
      {lines.map((l, i) => (
        <Fragment key={i}>
          {l.kind === "text" && <p>{l.text}</p>}
          {l.kind === "bullet" && (
            <p className={l.depth ? "flex gap-2 pl-8" : "flex gap-2 pl-3"}>
              <span aria-hidden className="text-muted-foreground">
                {l.depth ? "◦" : "•"}
              </span>
              <span>{l.text}</span>
            </p>
          )}
          {l.kind === "step" && (
            <p className="flex items-start gap-2 pl-1">
              <span className="bg-primary text-primary-foreground inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
                {l.n}
              </span>
              <span>{l.text}</span>
            </p>
          )}
        </Fragment>
      ))}
    </div>
  );
}
