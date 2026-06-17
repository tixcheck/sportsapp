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

export interface ConfirmScoreEmailProps {
  competitionName: string;
  url: string;
}

export function ConfirmScoreEmail({
  competitionName,
  url,
}: ConfirmScoreEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>A score needs your confirmation</Preview>
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
          <Heading style={{ fontSize: "22px", margin: "0 0 8px" }}>
            Confirm a score
          </Heading>
          <Text style={{ fontSize: "15px", lineHeight: "1.5" }}>
            A score was submitted for one of your matches in{" "}
            <strong>{competitionName}</strong>. Review it and confirm — or
            dispute it if it&apos;s wrong.
          </Text>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            <Button
              href={url}
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
              Review &amp; confirm
            </Button>
          </Section>
          <Text style={{ fontSize: "13px", color: "#a88b6a" }}>{url}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ConfirmScoreEmail;
