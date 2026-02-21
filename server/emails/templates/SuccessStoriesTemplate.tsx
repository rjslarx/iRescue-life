import * as React from 'react';
import {
  Button,
  Heading,
  Img,
  Section,
  Text,
} from '@react-email/components';
import { BaseTemplate } from './BaseTemplate';

interface HappyTailData {
  id: string;
  animalName: string;
  adopterName: string;
  story: string;
  photoUrl?: string;
  date: string;
}

interface SuccessStoriesTemplateProps {
  tenantName: string;
  tenantLogoUrl?: string;
  primaryColor?: string;
  unsubscribeUrl: string;
  footerText?: string;
  previewText?: string;
  headerTitle?: string;
  headerSubtitle?: string;
  introText?: string;
  happyTails: HappyTailData[];
  ctaButtonText?: string;
  ctaButtonUrl?: string;
  baseUrl: string;
  headerImageUrl?: string;
  heroImageUrl?: string;
}

export function SuccessStoriesTemplate({
  tenantName,
  tenantLogoUrl,
  primaryColor = '#5B7B6B',
  unsubscribeUrl,
  footerText,
  previewText,
  headerTitle = 'Happy Tails!',
  headerSubtitle = 'Stories of Love & New Beginnings',
  introText = 'Nothing makes us happier than seeing our animals thrive in their forever homes. Here are some heartwarming updates from recent adopters.',
  happyTails,
  ctaButtonText = 'Read More Success Stories',
  ctaButtonUrl,
  baseUrl,
  headerImageUrl,
  heroImageUrl,
}: SuccessStoriesTemplateProps) {
  const preview = previewText || `Heartwarming adoption stories from ${tenantName}`;
  
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
      <Section style={decoratorContainer}>
        <Section style={decoratorCircle}>
          <Text style={decoratorText}>SUCCESS</Text>
        </Section>
      </Section>
      
      <Heading style={{ ...heading, color: primaryColor }}>
        {headerTitle}
      </Heading>
      
      {headerSubtitle && (
        <Text style={subtitle}>{headerSubtitle}</Text>
      )}
      
      <Text style={paragraph}>{introText}</Text>
      
      {happyTails.length === 0 ? (
        <Section style={emptyStateSection}>
          <Text style={emptyStateText}>
            We have many heartwarming adoption stories to share. Visit our website to read about the happy endings made possible by wonderful adopters like you.
          </Text>
        </Section>
      ) : (
      happyTails.map((story, index) => (
        <Section key={story.id} style={storyCard}>
          {story.photoUrl && (
            <Img
              src={story.photoUrl}
              alt={story.animalName}
              width="100%"
              height="250"
              style={storyImage}
            />
          )}
          <Section style={storyContent}>
            <Heading as="h3" style={storyTitle}>
              {story.animalName}'s Story
            </Heading>
            <Text style={storyMeta}>
              Adopted by {story.adopterName} on {story.date}
            </Text>
            <Text style={storyText}>
              "{story.story.length > 300 
                ? `${story.story.substring(0, 300)}...` 
                : story.story}"
            </Text>
          </Section>
          {index < happyTails.length - 1 && <Section style={divider} />}
        </Section>
      ))
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
      
      <Section style={thankYouSection}>
        <Text style={thankYouText}>
          Every adoption is a success story, and none of this would be possible without supporters like you. Thank you for being part of our rescue family!
        </Text>
      </Section>
    </BaseTemplate>
  );
}

const decoratorContainer = {
  textAlign: 'center' as const,
  marginBottom: '16px',
};

const decoratorCircle = {
  display: 'inline-block',
  backgroundColor: '#5B7B6B',
  borderRadius: '24px',
  padding: '8px 20px',
};

const decoratorText = {
  fontSize: '12px',
  fontWeight: '700' as const,
  color: '#ffffff',
  margin: '0',
  letterSpacing: '2px',
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
  lineHeight: '24px',
  margin: '0 0 16px',
  textAlign: 'center' as const,
};

const paragraph = {
  color: '#374151',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '0 0 32px',
  textAlign: 'center' as const,
};

const storyCard = {
  marginBottom: '24px',
};

const storyImage = {
  borderRadius: '12px',
  objectFit: 'cover' as const,
  marginBottom: '16px',
};

const storyContent = {
  padding: '0 8px',
};

const storyTitle = {
  color: '#111827',
  fontSize: '22px',
  fontWeight: '600',
  margin: '0 0 8px',
};

const storyMeta = {
  color: '#6b7280',
  fontSize: '14px',
  fontStyle: 'italic' as const,
  margin: '0 0 12px',
};

const storyText = {
  color: '#4b5563',
  fontSize: '15px',
  lineHeight: '26px',
  margin: '0',
};

const divider = {
  borderTop: '1px solid #e5e7eb',
  marginTop: '24px',
};

const ctaSection = {
  textAlign: 'center' as const,
  marginTop: '32px',
  marginBottom: '24px',
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
  backgroundColor: '#f0fdf4',
  borderRadius: '8px',
  padding: '20px',
  marginTop: '24px',
};

const thankYouText = {
  color: '#166534',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
  textAlign: 'center' as const,
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

export default SuccessStoriesTemplate;
