import { db } from '../db';
import { pagePermissions } from '@shared/schema';

/**
 * Seed default page permissions for a new tenant
 * This defines which roles can access each page by default
 */
export async function seedDefaultPagePermissions(tenantId: string) {
  const defaultPermissions = [
    {
      pageId: 'dashboard',
      displayName: 'Dashboard',
      description: 'View overview statistics and quick actions',
      allowedRoles: ['admin', 'board_member', 'staff', 'foster', 'volunteer'],
    },
    {
      pageId: 'animals',
      displayName: 'Animals Management',
      description: 'Manage animal profiles, medical records, and adoption status',
      allowedRoles: ['admin', 'board_member', 'staff'],
    },
    {
      pageId: 'medical-tasks',
      displayName: 'Medical Tasks',
      description: 'View and complete daily medical tasks',
      allowedRoles: ['admin', 'board_member', 'staff'],
    },
    {
      pageId: 'applications',
      displayName: 'Applications',
      description: 'Review adoption and foster applications',
      allowedRoles: ['admin', 'board_member', 'staff'],
    },
    {
      pageId: 'foster-management',
      displayName: 'Foster Management',
      description: 'Manage foster families and placements',
      allowedRoles: ['admin', 'board_member', 'staff', 'foster'],
    },
    {
      pageId: 'team',
      displayName: 'Team',
      description: 'Manage team members and user accounts',
      allowedRoles: ['admin', 'board_member'],
    },
    {
      pageId: 'finance',
      displayName: 'Finance',
      description: 'Manage donations, payments, and financial records',
      allowedRoles: ['admin', 'board_member'],
    },
    {
      pageId: 'donors',
      displayName: 'Donors',
      description: 'Manage donor relationships and giving history',
      allowedRoles: ['admin', 'board_member', 'staff'],
    },
    {
      pageId: 'contacts',
      displayName: 'Contacts Directory',
      description: 'Comprehensive directory of all contacts (applicants, donors, team members)',
      allowedRoles: ['admin', 'board_member', 'staff'],
    },
    {
      pageId: 'supply-registry',
      displayName: 'Supply Registry',
      description: 'Manage supply wishlists and donation tracking',
      allowedRoles: ['admin', 'board_member', 'staff'],
    },
    {
      pageId: 'emails',
      displayName: 'Email Campaigns',
      description: 'Send newsletters and email campaigns',
      allowedRoles: ['admin', 'board_member'],
    },
    {
      pageId: 'email-inbox',
      displayName: 'Email Inbox',
      description: 'Process inbound emails and documents',
      allowedRoles: ['admin', 'board_member', 'staff'],
    },
    {
      pageId: 'volunteers',
      displayName: 'Volunteers',
      description: 'Manage volunteer coordination and schedules',
      allowedRoles: ['admin', 'board_member', 'staff', 'volunteer'],
    },
    {
      pageId: 'volunteer-applications',
      displayName: 'Volunteer Applications',
      description: 'Review and manage incoming volunteer applications',
      allowedRoles: ['admin', 'board_member', 'staff'],
    },
    {
      pageId: 'calendar',
      displayName: 'Calendar',
      description: 'View and manage events and schedules',
      allowedRoles: ['admin', 'board_member', 'staff', 'foster', 'volunteer'],
    },
    {
      pageId: 'calendar-permissions',
      displayName: 'Calendar Permissions',
      description: 'Manage calendar access permissions',
      allowedRoles: ['admin'],
    },
    {
      pageId: 'medical-permissions',
      displayName: 'Medical Record Permissions',
      description: 'Manage medical record access permissions',
      allowedRoles: ['admin'],
    },
    {
      pageId: 'page-permissions',
      displayName: 'Page Permissions',
      description: 'Control which roles can access each page',
      allowedRoles: ['admin'],
    },
    {
      pageId: 'documents',
      displayName: 'Documents',
      description: 'Manage organizational documents and files',
      allowedRoles: ['admin', 'board_member', 'staff'],
    },
    {
      pageId: 'branding',
      displayName: 'Branding & Appearance',
      description: 'Customize organization branding and public site',
      allowedRoles: ['admin', 'board_member'],
    },
    {
      pageId: 'custom-pages',
      displayName: 'Custom Pages',
      description: 'Create and manage custom public pages',
      allowedRoles: ['admin', 'board_member'],
    },
    {
      pageId: 'analytics',
      displayName: 'Analytics',
      description: 'View organizational metrics and reports',
      allowedRoles: ['admin', 'board_member', 'staff'],
    },
    {
      pageId: 'platform-integrations',
      displayName: 'Platform Integrations',
      description: 'Configure integrations with adoption platforms',
      allowedRoles: ['admin'],
    },
  ];

  try {
    // Insert all default permissions
    await db.insert(pagePermissions).values(
      defaultPermissions.map(perm => ({
        tenantId,
        pageId: perm.pageId,
        displayName: perm.displayName,
        description: perm.description,
        allowedRoles: perm.allowedRoles as ('admin' | 'board_member' | 'staff' | 'foster' | 'volunteer')[],
        isActive: true,
      }))
    );

    console.log(`Seeded ${defaultPermissions.length} default page permissions for tenant ${tenantId}`);
  } catch (error) {
    console.error('Failed to seed page permissions:', error);
    throw error;
  }
}
