import * as React from 'react';
import {
  Button,
  Column,
  Heading,
  Img,
  Row,
  Section,
  Text,
} from '@react-email/components';
import { BaseTemplate } from './BaseTemplate';

interface MonthlyRoundupTemplateProps {
  tenantName: string;
  tenantLogoUrl?: string;
  primaryColor?: string;
  unsubscribeUrl: string;
  footerText?: string;
  previewText?: string;
  headerTitle?: string;
  headerSubtitle?: string;
  statsMonth: string;
  adoptionCount?: number;
  rescueCount?: number;
  volunteerHours?: number;
  donationTotal?: number;
  introText?: string;
  spotlightVolunteer?: string;
  spotlightStory?: string;
  spotlightPhotoUrl?: string;
  featuredAnimals?: Array<{
    id: string;
    name: string;
    photoUrl?: string;
    species?: string;
  }>;
  ctaButtonText?: string;
  ctaButtonUrl?: string;
  baseUrl: string;
  headerImageUrl?: string;
  heroImageUrl?: string;
}

export function MonthlyRoundupTemplate({
  tenantName,
  tenantLogoUrl,
  primaryColor = '#5B7B6B',
  unsubscribeUrl,
  footerText,
  previewText,
  headerTitle,
  headerSubtitle,
  statsMonth,
  adoptionCount = 0,
  rescueCount = 0,
  volunteerHours = 0,
  donationTotal = 0,
  introText,
  spotlightVolunteer,
  spotlightStory,
  spotlightPhotoUrl,
  featuredAnimals = [],
  ctaButtonText = 'Support Our Mission',
  ctaButtonUrl,
  baseUrl,
  headerImageUrl,
  heroImageUrl,
}: MonthlyRoundupTemplateProps) {
  const preview = previewText || `${tenantName} ${statsMonth} Newsletter - ${adoptionCount} adoptions and more!`;
  const title = headerTitle || `${statsMonth} Monthly Update`;
  const subtitle = headerSubtitle || 'Your support in action';
  
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
      <Heading style={{ ...heading, color: primaryColor }}>
        {title}
      </Heading>
      
      <Text style={subtitleStyle}>{subtitle}</Text>
      
      {introText && (
        <Text style={paragraph}>{introText}</Text>
      )}
      
      <Section style={statsSection}>
        <Heading as="h2" style={statsSectionTitle}>
          By The Numbers
        </Heading>
        <Section style={statsGrid}>
          <Row>
            <Column style={statCard}>
              <Text style={statNumber}>{adoptionCount}</Text>
              <Text style={statLabel}>Happy Adoptions</Text>
            </Column>
            <Column style={statCard}>
              <Text style={statNumber}>{rescueCount}</Text>
              <Text style={statLabel}>Animals Rescued</Text>
            </Column>
          </Row>
          <Row style={{ marginTop: '12px' }}>
            <Column style={statCard}>
              <Text style={statNumber}>{volunteerHours.toLocaleString()}</Text>
              <Text style={statLabel}>Volunteer Hours</Text>
            </Column>
            <Column style={statCard}>
              <Text style={statNumber}>${donationTotal.toLocaleString()}</Text>
              <Text style={statLabel}>Donations Received</Text>
            </Column>
          </Row>
        </Section>
      </Section>
      
      {spotlightVolunteer && (
        <Section style={spotlightSection}>
          <Heading as="h2" style={sectionTitle}>
            Volunteer Spotlight
          </Heading>
          <Section style={spotlightCard}>
            {spotlightPhotoUrl && (
              <Img
                src={spotlightPhotoUrl}
                alt={spotlightVolunteer}
                width="80"
                height="80"
                style={spotlightPhoto}
              />
            )}
            <Section style={spotlightContent}>
              <Heading as="h3" style={spotlightName}>{spotlightVolunteer}</Heading>
              {spotlightStory && (
                <Text style={spotlightStoryText}>{spotlightStory}</Text>
              )}
            </Section>
          </Section>
        </Section>
      )}
      
      {featuredAnimals.length > 0 && (
        <Section style={animalsSection}>
          <Heading as="h2" style={sectionTitle}>
            Still Looking for Love
          </Heading>
          <Text style={sectionSubtitle}>
            These sweet souls are still waiting for their forever homes
          </Text>
          <Section style={animalsGrid}>
            <Row>
              {featuredAnimals.slice(0, 3).map((animal) => (
                <Column key={animal.id} style={animalColumn}>
                  {animal.photoUrl ? (
                    <Img
                      src={animal.photoUrl}
                      alt={animal.name}
                      width="150"
                      height="150"
                      style={animalPhoto}
                    />
                  ) : (
                    <Section style={animalPlaceholder}>
                      <Text style={animalPlaceholderInitial}>
                        {animal.name.charAt(0).toUpperCase()}
                      </Text>
                    </Section>
                  )}
                  <Text style={animalName}>{animal.name}</Text>
                </Column>
              ))}
            </Row>
          </Section>
          <Button
            href={`${baseUrl}/animals`}
            style={{ ...outlineButton, borderColor: primaryColor, color: primaryColor }}
          >
            View All Available Animals
          </Button>
        </Section>
      )}
      
      {ctaButtonUrl && (
        <Section style={ctaSection}>
          <Heading as="h2" style={ctaTitle}>
            Help Us Continue This Vital Work
          </Heading>
          <Text style={ctaText}>
            Every donation, no matter the size, helps us save more lives.
          </Text>
          <Button
            href={ctaButtonUrl}
            style={{ ...primaryButton, backgroundColor: primaryColor }}
          >
            {ctaButtonText}
          </Button>
        </Section>
      )}
      
      <Section style={thankYouSection}>
        <Text style={thankYouText}>
          Thank you for being part of our rescue family. Together, we're making a difference, one paw at a time.
        </Text>
      </Section>
    </BaseTemplate>
  );
}

const heading = {
  fontSize: '32px',
  fontWeight: '700',
  lineHeight: '40px',
  margin: '0 0 8px',
  textAlign: 'center' as const,
};

const subtitleStyle = {
  color: '#6b7280',
  fontSize: '18px',
  margin: '0 0 24px',
  textAlign: 'center' as const,
};

const paragraph = {
  color: '#374151',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '0 0 32px',
  textAlign: 'center' as const,
};

const statsSection = {
  backgroundColor: '#f9fafb',
  borderRadius: '12px',
  padding: '24px',
  marginBottom: '32px',
};

const statsSectionTitle = {
  color: '#111827',
  fontSize: '20px',
  fontWeight: '600',
  margin: '0 0 20px',
  textAlign: 'center' as const,
};

const statsGrid = {
  textAlign: 'center' as const,
};

const statCard = {
  padding: '16px',
  textAlign: 'center' as const,
};

const statNumber = {
  color: '#5B7B6B',
  fontSize: '36px',
  fontWeight: '700',
  lineHeight: '1',
  margin: '0 0 4px',
};

const statLabel = {
  color: '#6b7280',
  fontSize: '13px',
  margin: '0',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
};

const spotlightSection = {
  marginBottom: '32px',
};

const sectionTitle = {
  color: '#111827',
  fontSize: '20px',
  fontWeight: '600',
  margin: '0 0 16px',
  textAlign: 'center' as const,
};

const spotlightCard = {
  backgroundColor: '#fef3c7',
  borderRadius: '12px',
  padding: '20px',
  textAlign: 'center' as const,
};

const spotlightPhoto = {
  borderRadius: '50%',
  margin: '0 auto 12px',
};

const spotlightContent = {
};

const spotlightName = {
  color: '#92400e',
  fontSize: '18px',
  fontWeight: '600',
  margin: '0 0 8px',
};

const spotlightStoryText = {
  color: '#78350f',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
};

const animalsSection = {
  marginBottom: '32px',
  textAlign: 'center' as const,
};

const sectionSubtitle = {
  color: '#6b7280',
  fontSize: '14px',
  margin: '0 0 20px',
};

const animalsGrid = {
  marginBottom: '16px',
};

const animalColumn = {
  textAlign: 'center' as const,
  padding: '0 8px',
};

const animalPhoto = {
  borderRadius: '8px',
  objectFit: 'cover' as const,
};

const animalPlaceholder = {
  backgroundColor: '#e5e7eb',
  borderRadius: '8px',
  width: '150px',
  height: '150px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto',
};

const animalPlaceholderInitial = {
  fontSize: '40px',
  fontWeight: '600' as const,
  color: '#9ca3af',
  margin: '0',
  paddingTop: '50px',
};

const animalName = {
  color: '#374151',
  fontSize: '14px',
  fontWeight: '600',
  margin: '8px 0 0',
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

const ctaSection = {
  backgroundColor: '#f0fdf4',
  borderRadius: '12px',
  padding: '32px 24px',
  textAlign: 'center' as const,
  marginBottom: '24px',
};

const ctaTitle = {
  color: '#166534',
  fontSize: '22px',
  fontWeight: '600',
  margin: '0 0 8px',
};

const ctaText = {
  color: '#15803d',
  fontSize: '15px',
  margin: '0 0 20px',
};

const primaryButton = {
  borderRadius: '8px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: '600',
  padding: '14px 32px',
  textDecoration: 'none',
};

const thankYouSection = {
  textAlign: 'center' as const,
};

const thankYouText = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
  fontStyle: 'italic' as const,
};

export default MonthlyRoundupTemplate;
