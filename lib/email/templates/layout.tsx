import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

// Sunset Sand palette, inlined (email clients don't load external CSS).
const C = {
  bg: "#fbf3e7",
  surface: "#fffdf9",
  border: "#eadcc6",
  text: "#3d2419",
  muted: "#a88b6a",
  coral: "#e8643c",
};

export const emailText: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.5",
  color: C.text,
  margin: "0 0 12px",
};

/**
 * Who the email is from, as the reader understands it.
 *
 * A player signed up for BVL, not for MySportsApp — an organizer asked for
 * their own logo on these for exactly that reason. The platform stays in the
 * footer; the top of the email belongs to whoever is running the league.
 */
export interface EmailBrand {
  name: string;
  /** Organizer-uploaded, so it may be absent — the name alone still brands it. */
  logoUrl?: string | null;
}

/**
 * Shared shell for every transactional/digest email — consistent Sunset Sand
 * look. `unsubscribeUrl` adds the one-click footer (digest only; legal).
 * `brand` puts the organizer's name and logo above the heading.
 */
export function EmailLayout({
  preview,
  heading,
  children,
  unsubscribeUrl,
  brand,
}: {
  preview: string;
  heading: string;
  children: ReactNode;
  unsubscribeUrl?: string;
  brand?: EmailBrand;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: C.bg,
          fontFamily: "Inter, Arial, sans-serif",
          color: C.text,
          margin: 0,
          padding: "24px",
        }}
      >
        <Container
          style={{
            backgroundColor: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: "14px",
            maxWidth: "480px",
            margin: "0 auto",
            padding: "32px",
          }}
        >
          {brand ? (
            <Section style={{ margin: "0 0 20px" }}>
              {brand.logoUrl ? (
                <Img
                  src={brand.logoUrl}
                  alt={brand.name}
                  height="40"
                  style={{ display: "block", maxHeight: "40px", width: "auto" }}
                />
              ) : (
                <Text
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: C.muted,
                    margin: 0,
                  }}
                >
                  {brand.name}
                </Text>
              )}
            </Section>
          ) : null}

          <Heading
            style={{ fontSize: "22px", margin: "0 0 16px", color: C.text }}
          >
            {heading}
          </Heading>
          {children}
          <Hr style={{ borderColor: C.border, margin: "24px 0 12px" }} />
          <Text style={{ fontSize: "12px", color: C.muted, margin: 0 }}>
            {brand ? `${brand.name} · sent via MySportsApp` : "MySportsApp"} ·
            leagues, tournaments and ladders.
            {unsubscribeUrl ? (
              <>
                {" "}
                <Link href={unsubscribeUrl} style={{ color: C.muted }}>
                  Unsubscribe from weekly emails
                </Link>
                .
              </>
            ) : null}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function EmailButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Section style={{ textAlign: "center", margin: "24px 0" }}>
      <Button
        href={href}
        style={{
          backgroundColor: C.coral,
          color: "#ffffff",
          fontSize: "15px",
          fontWeight: 600,
          borderRadius: "10px",
          padding: "12px 24px",
          textDecoration: "none",
        }}
      >
        {children}
      </Button>
    </Section>
  );
}

export function EmailDetails({
  rows,
}: {
  rows: { label: string; value: string }[];
}) {
  if (rows.length === 0) return null;
  return (
    <Section
      style={{
        backgroundColor: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: "10px",
        padding: "12px 16px",
        margin: "0 0 16px",
      }}
    >
      {rows.map((r, i) => (
        <Text
          key={i}
          style={{
            fontSize: "14px",
            color: C.text,
            margin: i === 0 ? "0" : "6px 0 0",
          }}
        >
          <span style={{ color: C.muted }}>{r.label}: </span>
          {r.value}
        </Text>
      ))}
    </Section>
  );
}

export function MutedLink({ url }: { url: string }) {
  return (
    <Text style={{ fontSize: "13px", color: C.muted, lineHeight: "1.5" }}>
      Or paste this link into your browser:
      <br />
      {url}
    </Text>
  );
}

export const emailColors = C;
