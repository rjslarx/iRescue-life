import * as React from 'react';
import {
  Button,
  Heading,
  Img,
  Section,
  Text,
} from '@react-email/components';
import { BaseTemplate } from './BaseTemplate';

interface UrgentNeedsTemplateProps {
  tenantName: string;
  tenantLogoUrl?: string;
  primaryColor?: string;
  unsubscribeUrl: string;
  footerText?: string;
  previewText?: string;
  headerTitle?: string;
  animalName: string;
  animalPhotoUrl?: string;
  animalSpecies?: string;
  animalBreed?: string;
  urgencyReason: string;
  fundingGoal?: number;
  fundingRaised?: number;
  introText?: string;
  storyText?: string;
  ctaButtonText?: string;
  ctaButtonUrl: string;
  baseUrl: string;
  headerImageUrl?: string;
  heroImageUrl?: string;
}

export function UrgentNeedsTemplate({
  tenantName,
  tenantLogoUrl,
  primaryColor = '#5B7B6B',
  unsubscribeUrl,
  footerText,
  previewText,
  headerTitle,
  animalName,
  animalPhotoUrl,
  animalSpecies = 'pet',
  animalBreed,
  urgencyReason,
  fundingGoal,
  fundingRaised = 0,
  introText,
  storyText,
  ctaButtonText = 'Donate Now',
  ctaButtonUrl,
  baseUrl,
  headerImageUrl,
  heroImageUrl,
}: UrgentNeedsTemplateProps) {
  const preview = previewText || `Urgent: ${animalName} needs your help!`;
  const title = headerTitle || `${animalName} Needs Your Help`;
  const progressPercent = fundingGoal ? Math.min((fundingRaised / fundingGoal) * 100, 100) : 0;
  
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
      <Section style={urgentBanner}>
        <Text style={urgentBannerText}>URGENT APPEAL</Text>
      </Section>
      
      {animalPhotoUrl && (
        <Img
          src={animalPhotoUrl}
          alt={animalName}
          width="100%"
          height="300"
          style={heroImage}
        />
      )}
      
      <Heading style={{ ...heading, color: primaryColor }}>
        {title}
      </Heading>
      
      <Section style={reasonBadge}>
        <Text style={reasonText}>{urgencyReason}</Text>
      </Section>
      
      {introText && (
        <Text style={paragraph}>{introText}</Text>
      )}
      
      {storyText && (
        <Section style={storySection}>
          <Text style={storyParagraph}>{storyText}</Text>
        </Section>
      )}
      
      {fundingGoal && (
        <Section style={progressSection}>
          <Section style={progressLabels}>
            <Text style={progressRaised}>
              ${fundingRaised.toLocaleString()} raised
            </Text>
            <Text style={progressGoal}>
              ${fundingGoal.toLocaleString()} goal
            </Text>
          </Section>
          <Section style={progressBar}>
            <Section 
              style={{ 
                ...progressFill, 
                width: `${progressPercent}%`,
                backgroundColor: primaryColor,
              }} 
            />
          </Section>
          <Text style={progressPercentText}>
            {Math.round(progressPercent)}% of goal reached
          </Text>
        </Section>
      )}
      
      <Section style={ctaSection}>
        <Button
          href={ctaButtonUrl}
          style={{ ...primaryButton, backgroundColor: '#dc2626' }}
        >
          {ctaButtonText}
        </Button>
      </Section>
      
      <Section style={shareSection}>
        <Text style={shareText}>
          Can't donate? You can still help by sharing {animalName}'s story with friends and family. Every share makes a difference!
        </Text>
      </Section>
      
      <Section style={thankYouSection}>
        <Text style={thankYouText}>
          Thank you for being a lifesaver. Every dollar helps us give animals like {animalName} the second chance they deserve.
        </Text>
        <Text style={signatureText}>
          With gratitude,<br />
          The {tenantName} Team
        </Text>
      </Section>
    </BaseTemplate>
  );
}

const urgentBanner = {
  backgroundColor: '#dc2626',
  padding: '8px 16px',
  borderRadius: '4px',
  textAlign: 'center' as const,
  marginBottom: '20px',
};

const urgentBannerText = {
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '700',
  letterSpacing: '1px',
  margin: '0',
};

const heroImage = {
  borderRadius: '12px',
  objectFit: 'cover' as const,
  marginBottom: '24px',
};

const heading = {
  fontSize: '28px',
  fontWeight: '700',
  lineHeight: '36px',
  margin: '0 0 16px',
  textAlign: 'center' as const,
};

const reasonBadge = {
  backgroundColor: '#fef2f2',
  borderRadius: '20px',
  padding: '8px 20px',
  textAlign: 'center' as const,
  marginBottom: '24px',
  display: 'inline-block',
  margin: '0 auto 24px',
};

const reasonText = {
  color: '#dc2626',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0',
};

const paragraph = {
  color: '#374151',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '0 0 24px',
  textAlign: 'center' as const,
};

const storySection = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '24px',
  borderLeft: '4px solid #dc2626',
};

const storyParagraph = {
  color: '#4b5563',
  fontSize: '15px',
  lineHeight: '26px',
  margin: '0',
};

const progressSection = {
  marginBottom: '32px',
};

const progressLabels = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: '8px',
};

const progressRaised = {
  color: '#111827',
  fontSize: '18px',
  fontWeight: '700',
  margin: '0',
};

const progressGoal = {
  color: '#6b7280',
  fontSize: '14px',
  margin: '0',
  textAlign: 'right' as const,
};

const progressBar = {
  backgroundColor: '#e5e7eb',
  borderRadius: '999px',
  height: '12px',
  overflow: 'hidden' as const,
};

const progressFill = {
  height: '100%',
  borderRadius: '999px',
  transition: 'width 0.3s ease',
};

const progressPercentText = {
  color: '#6b7280',
  fontSize: '12px',
  textAlign: 'center' as const,
  marginTop: '8px',
};

const ctaSection = {
  textAlign: 'center' as const,
  marginBottom: '24px',
};

const primaryButton = {
  borderRadius: '8px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '18px',
  fontWeight: '700',
  padding: '16px 48px',
  textDecoration: 'none',
};

const shareSection = {
  backgroundColor: '#f0f9ff',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '24px',
};

const shareText = {
  color: '#0369a1',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
  textAlign: 'center' as const,
};

const thankYouSection = {
  borderTop: '1px solid #e5e7eb',
  paddingTop: '24px',
  marginTop: '24px',
};

const thankYouText = {
  color: '#374151',
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 16px',
  textAlign: 'center' as const,
};

const signatureText = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
  textAlign: 'center' as const,
};

export default UrgentNeedsTemplate;
