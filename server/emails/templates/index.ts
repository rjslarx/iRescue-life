export { BaseTemplate } from './BaseTemplate';
export { NewArrivalsTemplate } from './NewArrivalsTemplate';
export { SuccessStoriesTemplate } from './SuccessStoriesTemplate';
export { UrgentNeedsTemplate } from './UrgentNeedsTemplate';
export { MonthlyRoundupTemplate } from './MonthlyRoundupTemplate';
export { EventAnnouncementTemplate } from './EventAnnouncementTemplate';

export type TemplateType = 
  | 'new_arrivals' 
  | 'success_stories' 
  | 'urgent_needs' 
  | 'monthly_roundup' 
  | 'event_announcement' 
  | 'custom';

export const templateInfo: Record<Exclude<TemplateType, 'custom'>, {
  name: string;
  description: string;
  icon: string;
}> = {
  new_arrivals: {
    name: 'New Arrivals',
    description: 'Showcase newly rescued animals looking for homes',
    icon: 'Sparkles',
  },
  success_stories: {
    name: 'Success Stories',
    description: 'Share heartwarming adoption stories and happy tails',
    icon: 'Heart',
  },
  urgent_needs: {
    name: 'Urgent Appeal',
    description: 'Emergency fundraising for medical cases or special needs',
    icon: 'AlertTriangle',
  },
  monthly_roundup: {
    name: 'Monthly Roundup',
    description: 'Monthly stats, volunteer spotlights, and updates',
    icon: 'Calendar',
  },
  event_announcement: {
    name: 'Event Announcement',
    description: 'Promote adoption events, fundraisers, and gatherings',
    icon: 'CalendarHeart',
  },
};
