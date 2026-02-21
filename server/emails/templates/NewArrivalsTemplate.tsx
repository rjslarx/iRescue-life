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

interface AnimalData {
  id: string;
  name: string;
  species: string;
  breed?: string;
  age?: string;
  photoUrl?: string;
  description?: string;
}

interface NewArrivalsTemplateProps {
  tenantName: string;
  tenantLogoUrl?: string;
  primaryColor?: string;
  unsubscribeUrl: string;
  footerText?: string;
  previewText?: string;
  headerTitle?: string;
  headerSubtitle?: string;
  introText?: string;
  animals: AnimalData[];
  ctaButtonText?: string;
  ctaButtonUrl?: string;
  baseUrl: string;
  headerImageUrl?: string;
  heroImageUrl?: string;
}

export function NewArrivalsTemplate({
  tenantName,
  tenantLogoUrl,
  primaryColor = '#5B7B6B',
  unsubscribeUrl,
  footerText,
  previewText,
  headerTitle = 'Meet Our New Friends!',
  headerSubtitle,
  introText = 'Check out the newest furry faces looking for their forever homes.',
  animals,
  ctaButtonText = 'View All Available Animals',
  ctaButtonUrl,
  baseUrl,
  headerImageUrl,
  heroImageUrl,
}: NewArrivalsTemplateProps) {
  const preview = previewText || `${animals.length} new animals are looking for homes at ${tenantName}!`;
  
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
        {headerTitle}
      </Heading>
      
      {headerSubtitle && (
        <Text style={subtitle}>{headerSubtitle}</Text>
      )}
      
      <Text style={paragraph}>{introText}</Text>
      
      {animals.length === 0 ? (
        <Section style={emptyStateSection}>
          <Text style={emptyStateText}>
            Check out our website to see all our available animals looking for their forever homes.
          </Text>
        </Section>
      ) : (
      <Section style={animalsGrid}>
        {animals.map((animal, index) => (
          <Section key={animal.id} style={animalCard}>
            {animal.photoUrl ? (
              <Img
                src={animal.photoUrl}
                alt={animal.name}
                width="100%"
                height="200"
                style={animalImage}
              />
            ) : (
              <Section style={placeholderImage}>
                <Text style={placeholderInitial}>
                  {animal.name.charAt(0).toUpperCase()}
                </Text>
              </Section>
            )}
            <Section style={animalInfo}>
              <Heading as="h3" style={animalName}>{animal.name}</Heading>
              <Text style={animalDetails}>
                {animal.species}{animal.breed ? ` - ${animal.breed}` : ''}
                {animal.age ? ` | ${animal.age}` : ''}
              </Text>
              {animal.description && (
                <Text style={animalDescription}>
                  {animal.description.length > 100 
                    ? `${animal.description.substring(0, 100)}...` 
                    : animal.description}
                </Text>
              )}
              <Button
                href={`${baseUrl}/animals/${animal.id}`}
                style={{ ...button, backgroundColor: primaryColor }}
              >
                Learn More
              </Button>
            </Section>
          </Section>
        ))}
      </Section>
      )}
      
      {ctaButtonUrl && (
        <Section style={ctaSection}>
          <Button
            href={ctaButtonUrl}
            style={{ ...primaryButton, backgroundColor: primaryColor }}
          >
            {ctaButtonText}
          </Button>
        </Section>
      )}
    </BaseTemplate>
  );
}

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
  lineHeight: '24px',
  margin: '0 0 16px',
  textAlign: 'center' as const,
};

const paragraph = {
  color: '#374151',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '0 0 24px',
  textAlign: 'center' as const,
};

const animalsGrid = {
  marginBottom: '24px',
};

const animalCard = {
  backgroundColor: '#f9fafb',
  borderRadius: '12px',
  overflow: 'hidden' as const,
  marginBottom: '16px',
};

const animalImage = {
  objectFit: 'cover' as const,
  borderRadius: '12px 12px 0 0',
};

const placeholderImage = {
  backgroundColor: '#e5e7eb',
  height: '200px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '12px 12px 0 0',
};

const placeholderInitial = {
  fontSize: '48px',
  fontWeight: '600' as const,
  color: '#9ca3af',
  textAlign: 'center' as const,
  margin: 'auto',
  paddingTop: '70px',
};

const animalInfo = {
  padding: '16px',
};

const animalName = {
  color: '#111827',
  fontSize: '20px',
  fontWeight: '600',
  margin: '0 0 4px',
};

const animalDetails = {
  color: '#6b7280',
  fontSize: '14px',
  margin: '0 0 8px',
};

const animalDescription = {
  color: '#4b5563',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 12px',
};

const button = {
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '14px',
  fontWeight: '600',
  padding: '10px 20px',
  textDecoration: 'none',
};

const ctaSection = {
  textAlign: 'center' as const,
  marginTop: '24px',
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

const emptyStateSection = {
  backgroundColor: '#f3f4f6',
  borderRadius: '12px',
  padding: '32px',
  textAlign: 'center' as const,
  marginBottom: '24px',
};

const emptyStateText = {
  color: '#6b7280',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0',
};

export default NewArrivalsTemplate;
