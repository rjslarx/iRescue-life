import * as React from 'react';
import { render } from '@react-email/components';
import {
  NewArrivalsTemplate,
  SuccessStoriesTemplate,
  UrgentNeedsTemplate,
  MonthlyRoundupTemplate,
  EventAnnouncementTemplate,
  TemplateType,
} from './templates';
import type { NewsletterCampaign, Animal, HappyTail, Tenant } from '@shared/schema';

interface RenderOptions {
  campaign: NewsletterCampaign;
  tenant: Tenant;
  animals?: Animal[];
  happyTails?: HappyTail[];
  baseUrl: string;
  unsubscribeUrl: string;
}

export async function renderNewsletterTemplate(options: RenderOptions): Promise<{
  html: string;
  text: string;
}> {
  const { campaign, tenant, animals = [], happyTails = [], baseUrl, unsubscribeUrl } = options;
  const content = campaign.content || {};
  
  const commonProps = {
    tenantName: tenant.name,
    tenantLogoUrl: tenant.logoUrl || undefined,
    primaryColor: tenant.branding?.primaryColor || '#5B7B6B',
    unsubscribeUrl,
    footerText: content.footerText || tenant.footerText || undefined,
    previewText: campaign.previewText || undefined,
    baseUrl,
    headerImageUrl: content.headerImageUrl || undefined,
    heroImageUrl: content.heroImageUrl || undefined,
  };

  let element: JSX.Element;

  switch (campaign.templateType as TemplateType) {
    case 'new_arrivals': {
      const selectedAnimals = content.animalIds 
        ? animals.filter(a => content.animalIds?.includes(a.id))
        : animals.slice(0, 6);
      
      element = (
        <NewArrivalsTemplate
          {...commonProps}
          headerTitle={content.headerTitle || 'Meet Our New Friends!'}
          headerSubtitle={content.headerSubtitle}
          introText={content.introText || 'Check out the newest furry faces looking for their forever homes.'}
          animals={selectedAnimals.map(a => ({
            id: a.id,
            name: a.name,
            species: a.species,
            breed: a.breed || undefined,
            age: a.age || undefined,
            photoUrl: a.photoUrls?.[0] || undefined,
            description: a.description || undefined,
          }))}
          ctaButtonText={content.ctaButtonText || 'View All Available Animals'}
          ctaButtonUrl={content.ctaButtonUrl || `${baseUrl}/animals`}
        />
      );
      break;
    }
    
    case 'success_stories': {
      const selectedStories = content.happyTailIds
        ? happyTails.filter(h => content.happyTailIds?.includes(h.id))
        : happyTails.slice(0, 5);
      
      element = (
        <SuccessStoriesTemplate
          {...commonProps}
          headerTitle={content.headerTitle || 'Happy Tails!'}
          headerSubtitle={content.headerSubtitle || 'Stories of Love & New Beginnings'}
          introText={content.introText || 'Nothing makes us happier than seeing our animals thrive in their forever homes.'}
          happyTails={selectedStories.map(h => ({
            id: h.id,
            animalName: h.animalName,
            adopterName: h.adopterName,
            story: h.story,
            photoUrl: h.photoUrl || undefined,
            date: h.date,
          }))}
          ctaButtonText={content.ctaButtonText || 'Read More Success Stories'}
          ctaButtonUrl={content.ctaButtonUrl || `${baseUrl}/happy-tails`}
        />
      );
      break;
    }
    
    case 'urgent_needs': {
      const urgentAnimal = content.urgentAnimalId 
        ? animals.find(a => a.id === content.urgentAnimalId)
        : animals[0];
      
      if (!urgentAnimal) {
        throw new Error('No animal selected for urgent needs campaign');
      }
      
      element = (
        <UrgentNeedsTemplate
          {...commonProps}
          headerTitle={content.headerTitle}
          animalName={urgentAnimal.name}
          animalPhotoUrl={urgentAnimal.photoUrls?.[0] || undefined}
          animalSpecies={urgentAnimal.species}
          animalBreed={urgentAnimal.breed || undefined}
          urgencyReason={content.urgencyReason || 'Emergency Medical Care Needed'}
          fundingGoal={content.fundingGoal}
          fundingRaised={content.fundingRaised || 0}
          introText={content.introText}
          storyText={urgentAnimal.description || undefined}
          ctaButtonText={content.ctaButtonText || 'Donate Now'}
          ctaButtonUrl={content.ctaButtonUrl || `${baseUrl}/donate`}
        />
      );
      break;
    }
    
    case 'monthly_roundup': {
      const featuredAnimals = content.animalIds
        ? animals.filter(a => content.animalIds?.includes(a.id))
        : animals.filter(a => a.status === 'available').slice(0, 3);
      
      element = (
        <MonthlyRoundupTemplate
          {...commonProps}
          headerTitle={content.headerTitle}
          headerSubtitle={content.headerSubtitle}
          statsMonth={content.statsMonth || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          adoptionCount={content.adoptionCount || 0}
          rescueCount={content.rescueCount || 0}
          volunteerHours={content.volunteerHours || 0}
          donationTotal={content.donationTotal || 0}
          introText={content.introText}
          spotlightVolunteer={content.spotlightVolunteer}
          spotlightStory={content.spotlightStory}
          featuredAnimals={featuredAnimals.map(a => ({
            id: a.id,
            name: a.name,
            photoUrl: a.photoUrls?.[0] || undefined,
            species: a.species,
          }))}
          ctaButtonText={content.ctaButtonText || 'Support Our Mission'}
          ctaButtonUrl={content.ctaButtonUrl || `${baseUrl}/donate`}
        />
      );
      break;
    }
    
    case 'event_announcement': {
      element = (
        <EventAnnouncementTemplate
          {...commonProps}
          headerTitle={content.headerTitle || "You're Invited!"}
          headerSubtitle={content.headerSubtitle}
          eventName={content.eventName || 'Upcoming Event'}
          eventDate={content.eventDate || 'TBA'}
          eventTime={content.eventTime}
          eventLocation={content.eventLocation}
          eventDescription={content.eventDescription}
          eventImageUrl={content.eventImageUrl}
          introText={content.introText}
          ctaButtonText={content.ctaButtonText || 'RSVP Now'}
          ctaButtonUrl={content.ctaButtonUrl || `${baseUrl}/events`}
        />
      );
      break;
    }
    
    case 'custom': {
      if (content.customHtml) {
        return {
          html: content.customHtml,
          text: htmlToPlainText(content.customHtml),
        };
      }
      throw new Error('Custom template requires customHtml content');
    }
    
    default:
      throw new Error(`Unknown template type: ${campaign.templateType}`);
  }

  const html = await render(element);
  const text = await render(element, { plainText: true });

  return { html, text };
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li>/gi, '  - ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function renderPreview(
  templateType: TemplateType,
  tenant: Tenant,
  baseUrl: string
): Promise<string> {
  const mockCampaign: Partial<NewsletterCampaign> = {
    templateType,
    subject: 'Preview',
    name: 'Preview',
    content: {
      headerTitle: getDefaultHeaderTitle(templateType),
      introText: getDefaultIntroText(templateType),
      statsMonth: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      adoptionCount: 12,
      rescueCount: 8,
      volunteerHours: 450,
      donationTotal: 2500,
      eventName: 'Adoption Day Event',
      eventDate: 'Saturday, December 14, 2024',
      eventTime: '10:00 AM - 4:00 PM',
      eventLocation: 'Main Street Park',
      urgencyReason: 'Emergency Surgery Required',
      fundingGoal: 3000,
      fundingRaised: 1250,
    },
  };

  const mockAnimals: Partial<Animal>[] = [
    { id: '1', name: 'Luna', species: 'dog', breed: 'Golden Retriever', age: '2 years', status: 'available', description: 'A playful and loving companion looking for her forever home.' },
    { id: '2', name: 'Oliver', species: 'cat', breed: 'Tabby', age: '1 year', status: 'available', description: 'A curious and affectionate kitty who loves to cuddle.' },
    { id: '3', name: 'Max', species: 'dog', breed: 'Labrador Mix', age: '3 years', status: 'available', description: 'A gentle giant with a heart of gold.' },
  ];

  const mockHappyTails: Partial<HappyTail>[] = [
    { id: '1', animalName: 'Bella', adopterName: 'The Johnson Family', story: 'Bella has settled in perfectly and loves her new backyard!', date: '2024-11-15' },
    { id: '2', animalName: 'Charlie', adopterName: 'Sarah M.', story: 'Charlie is now the king of the house and loves his new cat tree.', date: '2024-11-10' },
  ];

  const result = await renderNewsletterTemplate({
    campaign: mockCampaign as NewsletterCampaign,
    tenant,
    animals: mockAnimals as Animal[],
    happyTails: mockHappyTails as HappyTail[],
    baseUrl,
    unsubscribeUrl: `${baseUrl}/unsubscribe?token=preview`,
  });

  return result.html;
}

function getDefaultHeaderTitle(templateType: TemplateType): string {
  switch (templateType) {
    case 'new_arrivals': return 'Meet Our New Friends!';
    case 'success_stories': return 'Happy Tails!';
    case 'urgent_needs': return 'Help Save a Life';
    case 'monthly_roundup': return 'Monthly Update';
    case 'event_announcement': return "You're Invited!";
    default: return 'Newsletter';
  }
}

function getDefaultIntroText(templateType: TemplateType): string {
  switch (templateType) {
    case 'new_arrivals': return 'Check out the newest furry faces looking for their forever homes.';
    case 'success_stories': return 'Nothing makes us happier than seeing our animals thrive in their forever homes.';
    case 'urgent_needs': return 'We have an urgent case that needs your immediate support.';
    case 'monthly_roundup': return "Here's what we've accomplished together this month.";
    case 'event_announcement': return "We're excited to announce an upcoming event!";
    default: return '';
  }
}
