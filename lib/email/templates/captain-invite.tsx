import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface CaptainInviteEmailProps {
  teamName: string;
  leagueName: string;
  organizerName: string;
  claimUrl: string;
}

export function CaptainInviteEmail({
  teamName,
  leagueName,
  organizerName,
  claimUrl,
}: CaptainInviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Claim ${teamName} in ${leagueName}`}</Preview>
      <Body
        style={{
          backgroundColor: "#fbf3e7",
          fontFamily: "Inter, Arial, sans-serif",
          color: "#3d2419",
          margin: 0,
          padding: "24px",
        }}
      >
        <Container
          style={{
            backgroundColor: "#fffdf9",
            border: "1px solid #eadcc6",
            borderRadius: "14px",
            maxWidth: "480px",
            margin: "0 auto",
            padding: "32px",
          }}
        >
          <Heading
            style={{ fontSize: "22px", margin: "0 0 8px", color: "#3d2419" }}
          >
            You&apos;re the captain of {teamName}
          </Heading>
          <Text style={{ fontSize: "15px", lineHeight: "1.5" }}>
            {organizerName} invited you to captain <strong>{teamName}</strong>{" "}
            in <strong>{leagueName}</strong>. Claim your team to see your
            schedule, enter scores, and manage your roster.
          </Text>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            <Button
              href={claimUrl}
              style={{
                backgroundColor: "#e8643c",
                color: "#ffffff",
                fontSize: "15px",
                fontWeight: 600,
                borderRadius: "10px",
                padding: "12px 24px",
                textDecoration: "none",
              }}
            >
              Claim your team
            </Button>
          </Section>
          <Text
            style={{ fontSize: "13px", color: "#a88b6a", lineHeight: "1.5" }}
          >
            Or paste this link into your browser:
            <br />
            {claimUrl}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default CaptainInviteEmail;
