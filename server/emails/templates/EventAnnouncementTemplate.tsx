import * as React from 'react';
import {
  Button,
  Heading,
  Img,
  Section,
  Text,
} from '@react-email/components';
import { BaseTemplate } from './BaseTemplate';

interface EventAnnouncementTemplateProps {
  tenantName: string;
  tenantLogoUrl?: string;
  primaryColor?: string;
  unsubscribeUrl: string;
  footerText?: string;
  previewText?: string;
  headerTitle?: string;
  headerSubtitle?: string;
  eventName: string;
  eventDate: string;
  eventTime?: string;
  eventLocation?: string;
  eventDescription?: string;
  eventImageUrl?: string;
  introText?: string;
  highlights?: string[];
  ctaButtonText?: string;
  ctaButtonUrl?: string;
  secondaryCtaText?: string;
  secondaryCtaUrl?: string;
  baseUrl: string;
  headerImageUrl?: string;
  heroImageUrl?: string;
}

export function EventAnnouncementTemplate({
  tenantName,
  tenantLogoUrl,
  primaryColor = '#5B7B6B',
  unsubscribeUrl,
  footerText,
  previewText,
  headerTitle = "You're Invited!",
  headerSubtitle,
  eventName,
  eventDate,
  eventTime,
  eventLocation,
  eventDescription,
  eventImageUrl,
  introText,
  highlights = [],
  ctaButtonText = 'RSVP Now',
  ctaButtonUrl,
  secondaryCtaText,
  secondaryCtaUrl,
  baseUrl,
  headerImageUrl,
  heroImageUrl,
}: EventAnnouncementTemplateProps) {
  const preview = previewText || `Join us for ${eventName} on ${eventDate}!`;
  
  return (
    <BaseTemplate
      previewText={preview}
      tenantName={tenantName}
      tenantLogoUrl={tenantLogoUrl}
      primaryColor={primaryColor}
      unsubscribeUrl={unsubscribeUrl}
      footerText={footerText}
      headerImageUrl={headerImageUrl}
      heroImageUrl={heroImageUrl}
    >
      <Section style={inviteBadge}>
        <Text style={inviteText}>{headerTitle}</Text>
      </Section>
      
      {eventImageUrl && (
        <Img
          src={eventImageUrl}
          alt={eventName}
          width="100%"
          height="250"
          style={eventImage}
        />
      )}
      
      <Heading style={{ ...heading, color: primaryColor }}>
        {eventName}
      </Heading>
      
      {headerSubtitle && (
        <Text style={subtitle}>{headerSubtitle}</Text>
      )}
      
      {introText && (
        <Text style={paragraph}>{introText}</Text>
      )}
      
      <Section style={detailsCard}>
        <Section style={detailRow}>
          <Text style={detailIcon}>📅</Text>
          <Section style={detailContent}>
            <Text style={detailLabel}>Date</Text>
            <Text style={detailValue}>{eventDate}</Text>
          </Section>
        </Section>
        
        {eventTime && (
          <Section style={detailRow}>
            <Text style={detailIcon}>🕐</Text>
            <Section style={detailContent}>
              <Text style={detailLabel}>Time</Text>
              <Text style={detailValue}>{eventTime}</Text>
            </Section>
          </Section>
        )}
        
        {eventLocation && (
          <Section style={detailRow}>
            <Text style={detailIcon}>📍</Text>
            <Section style={detailContent}>
              <Text style={detailLabel}>Location</Text>
              <Text style={detailValue}>{eventLocation}</Text>
            </Section>
          </Section>
        )}
      </Section>
      
      {eventDescription && (
        <Section style={descriptionSection}>
          <Heading as="h3" style={descriptionTitle}>About This Event</Heading>
          <Text style={descriptionText}>{eventDescription}</Text>
        </Section>
      )}
      
      {highlights.length > 0 && (
        <Section style={highlightsSection}>
          <Heading as="h3" style={highlightsTitle}>What to Expect</Heading>
          {highlights.map((highlight, index) => (
            <Section key={index} style={highlightItem}>
              <Text style={highlightBullet}>✓</Text>
              <Text style={highlightText}>{highlight}</Text>
            </Section>
          ))}
        </Section>
      )}
      
      <Section style={ctaSection}>
        {ctaButtonUrl && (
          <Button
            href={ctaButtonUrl}
            style={{ ...primaryButton, backgroundColor: primaryColor }}
          >
            {ctaButtonText}
          </Button>
        )}
        
        {secondaryCtaUrl && secondaryCtaText && (
          <Section style={secondaryCta}>
            <Button
              href={secondaryCtaUrl}
              style={{ ...outlineButton, borderColor: primaryColor, color: primaryColor }}
            >
              {secondaryCtaText}
            </Button>
          </Section>
        )}
      </Section>
      
      <Section style={shareSection}>
        <Text style={shareTitle}>Spread the Word!</Text>
        <Text style={shareText}>
          Know someone who would love to attend? Share this event with friends and family to help us make it a success!
        </Text>
      </Section>
      
      <Section style={contactSection}>
        <Text style={contactText}>
          Questions? Reply to this email or contact us at {tenantName}.
        </Text>
      </Section>
    </BaseTemplate>
  );
}

const inviteBadge = {
  textAlign: 'center' as const,
  marginBottom: '16px',
};

const inviteText = {
  backgroundColor: '#fef3c7',
  color: '#92400e',
  display: 'inline-block',
  fontSize: '14px',
  fontWeight: '700',
  letterSpacing: '1px',
  padding: '8px 20px',
  borderRadius: '20px',
  margin: '0',
};

const eventImage = {
  borderRadius: '12px',
  objectFit: 'cover' as const,
  marginBottom: '24px',
};

const heading = {
  fontSize: '28px',
  fontWeight: '700',
  lineHeight: '36px',
  margin: '0 0 8px',
  textAlign: 'center' as const,
};

const subtitle = {
  color: '#6b7280',
  fontSize: '16px',
  margin: '0 0 20px',
  textAlign: 'center' as const,
};

const paragraph = {
  color: '#374151',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '0 0 24px',
  textAlign: 'center' as const,
};

const detailsCard = {
  backgroundColor: '#f9fafb',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '24px',
};

const detailRow = {
  display: 'flex',
  alignItems: 'flex-start',
  marginBottom: '16px',
};

const detailIcon = {
  fontSize: '20px',
  margin: '0 12px 0 0',
  width: '24px',
};

const detailContent = {
  flex: '1',
};

const detailLabel = {
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  margin: '0 0 2px',
};

const detailValue = {
  color: '#111827',
  fontSize: '16px',
  fontWeight: '500',
  margin: '0',
};

const descriptionSection = {
  marginBottom: '24px',
};

const descriptionTitle = {
  color: '#111827',
  fontSize: '18px',
  fontWeight: '600',
  margin: '0 0 12px',
};

const descriptionText = {
  color: '#4b5563',
  fontSize: '15px',
  lineHeight: '26px',
  margin: '0',
};

const highlightsSection = {
  backgroundColor: '#f0fdf4',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '24px',
};

const highlightsTitle = {
  color: '#166534',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 16px',
};

const highlightItem = {
  display: 'flex',
  alignItems: 'flex-start',
  marginBottom: '10px',
};

const highlightBullet = {
  color: '#22c55e',
  fontSize: '16px',
  fontWeight: '700',
  margin: '0 10px 0 0',
  width: '20px',
};

const highlightText = {
  color: '#15803d',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
  flex: '1',
};

const ctaSection = {
  textAlign: 'center' as const,
  marginBottom: '24px',
};

const primaryButton = {
  borderRadius: '8px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: '600',
  padding: '14px 40px',
  textDecoration: 'none',
};

const secondaryCta = {
  marginTop: '12px',
};

const outlineButton = {
  backgroundColor: 'transparent',
  borderRadius: '8px',
  border: '2px solid',
  display: 'inline-block',
  fontSize: '14px',
  fontWeight: '600',
  padding: '10px 24px',
  textDecoration: 'none',
};

const shareSection = {
  backgroundColor: '#eff6ff',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '16px',
  textAlign: 'center' as const,
};

const shareTitle = {
  color: '#1e40af',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0 0 4px',
};

const shareText = {
  color: '#1e40af',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0',
};

const contactSection = {
  textAlign: 'center' as const,
};

const contactText = {
  color: '#9ca3af',
  fontSize: '12px',
  margin: '0',
};

export default EventAnnouncementTemplate;
