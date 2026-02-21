import * as React from 'react';
import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Hr,
  Font,
} from '@react-email/components';

interface BaseTemplateProps {
  previewText: string;
  children: React.ReactNode;
  tenantName: string;
  tenantLogoUrl?: string;
  primaryColor?: string;
  unsubscribeUrl: string;
  footerText?: string;
  headerImageUrl?: string;
  heroImageUrl?: string;
}

export function BaseTemplate({
  previewText,
  children,
  tenantName,
  tenantLogoUrl,
  primaryColor = '#5B7B6B',
  unsubscribeUrl,
  footerText,
  headerImageUrl,
  heroImageUrl,
}: BaseTemplateProps) {
  return (
    <Html>
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Arial"
          webFont={{
            url: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff2',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {headerImageUrl ? (
            <Section style={headerImageSection}>
              <Img
                src={headerImageUrl}
                alt={tenantName}
                width="600"
                height="auto"
                style={headerImage}
              />
            </Section>
          ) : (
            <Section style={{ ...header, backgroundColor: primaryColor }}>
              {tenantLogoUrl ? (
                <Img
                  src={tenantLogoUrl}
                  alt={tenantName}
                  width="120"
                  height="auto"
                  style={logo}
                />
              ) : (
                <Text style={logoText}>{tenantName}</Text>
              )}
            </Section>
          )}

          {heroImageUrl && (
            <Section style={heroSection}>
              <Img
                src={heroImageUrl}
                alt="Featured"
                width="600"
                height="auto"
                style={heroImage}
              />
            </Section>
          )}
          
          <Section style={content}>
            {children}
          </Section>

          <Hr style={divider} />
          
          <Section style={footer}>
            {footerText && <Text style={footerTextStyle}>{footerText}</Text>}
            <Text style={footerTextStyle}>
              You're receiving this email because you subscribed to updates from {tenantName}.
            </Text>
            <Link href={unsubscribeUrl} style={unsubscribeLink}>
              Unsubscribe from these emails
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: 'Inter, Arial, sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '0',
  maxWidth: '600px',
  borderRadius: '8px',
  overflow: 'hidden' as const,
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
};

const header = {
  padding: '32px 24px',
  textAlign: 'center' as const,
};

const headerImageSection = {
  padding: '0',
  margin: '0',
};

const headerImage = {
  width: '100%',
  maxWidth: '600px',
  height: 'auto',
  display: 'block',
  margin: '0',
};

const heroSection = {
  padding: '0',
  margin: '0',
};

const heroImage = {
  width: '100%',
  maxWidth: '600px',
  height: 'auto',
  display: 'block',
  margin: '0',
};

const logo = {
  margin: '0 auto',
};

const logoText = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: '700',
  margin: '0',
};

const content = {
  padding: '32px 24px',
};

const divider = {
  borderColor: '#e6e6e6',
  margin: '0',
};

const footer = {
  padding: '24px',
  textAlign: 'center' as const,
  backgroundColor: '#f9fafb',
};

const footerTextStyle = {
  color: '#6b7280',
  fontSize: '12px',
  lineHeight: '20px',
  margin: '0 0 8px',
};

const unsubscribeLink = {
  color: '#6b7280',
  fontSize: '12px',
  textDecoration: 'underline',
};

export default BaseTemplate;
