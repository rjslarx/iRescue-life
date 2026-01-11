import { db } from '../db';
import { customPages } from '@shared/schema';
import { createAnimal } from './animals';

/**
 * Sample custom page templates for new tenants
 */
const CUSTOM_PAGE_TEMPLATES = [
  {
    title: 'Adoption Process',
    slug: 'adoption-process',
    contentMarkdown: `# Our Adoption Process

Thank you for your interest in adopting! We're excited to help you find your perfect companion.

## Steps to Adopt

### 1. Browse Available Animals
Check out our adoptable animals to find one that fits your lifestyle and family.

### 2. Submit an Application
Fill out our adoption application with information about your home, experience, and preferences.

### 3. Meet & Greet
Once approved, we'll schedule a meet and greet with your chosen animal.

### 4. Home Check
For certain animals, we may conduct a home visit to ensure a safe environment.

### 5. Finalize Adoption
Complete the adoption paperwork and bring your new family member home!

## Adoption Fees

Our adoption fees help cover:
- Spay/neuter surgery
- Up-to-date vaccinations
- Microchipping
- Health examination
- Deworming and flea treatment

*Adoption fees vary by animal. Check individual profiles for specific fees.*

## Requirements

- Be at least 21 years old
- Have a valid ID
- If renting, provide proof of landlord approval for pets
- All family members should meet the animal

## Questions?

Contact us at [your email] or call [your phone number]. We're here to help!`,
    excerpt: 'Learn about our simple adoption process and how to bring home your new best friend.',
    isPublished: false, // Draft by default
  },
  {
    title: 'Foster Program',
    slug: 'foster-program',
    contentMarkdown: `# Become a Foster Family

Fostering saves lives by providing temporary homes for animals in need. Whether for a few weeks or months, foster families are essential to our mission.

## Why Foster?

- **Save Lives**: Foster homes free up shelter space for more animals
- **Socialization**: Animals learn to trust and live in a home environment
- **Assessment**: We learn more about their personality and needs
- **Rehabilitation**: Some animals need time to heal or decompress

## What We Provide

- All food and supplies
- Complete medical care
- 24/7 support from our team
- Training and guidance
- The joy of changing a life!

## Foster Commitment

Foster periods vary based on the animal's needs:
- **Short-term**: 2-4 weeks (ideal for adoption-ready animals)
- **Medium-term**: 1-3 months (for animals needing socialization)
- **Long-term**: 3+ months (medical recovery or special needs)

## Requirements

- Secure, pet-friendly home
- Time for daily care and socialization
- Transportation to vet appointments if needed
- Patience and commitment

## Types of Foster Care

### Medical Foster
Care for animals recovering from surgery or illness.

### Behavioral Foster
Help shy or fearful animals build confidence.

### Maternity Foster
Care for pregnant mothers and newborns.

### Emergency Foster
Temporary care during shelter capacity issues.

## Ready to Foster?

Fill out our foster application to get started. We'll match you with an animal that fits your lifestyle and experience level.

**Questions?** Contact our foster coordinator at [your email].`,
    excerpt: 'Open your heart and home to an animal in need. Learn about our foster program and how you can help.',
    isPublished: false,
  },
];

/**
 * Sample animal profile template
 */
const SAMPLE_ANIMAL_TEMPLATE = {
  name: 'Sample Profile',
  species: 'dog' as const,
  breed: 'Mixed Breed',
  age: '3 years',
  gender: 'male' as const,
  size: 'medium' as const,
  color: 'Brown and White',
  description: `This is a sample animal profile to help you get started.

**To add your first real animal:**
1. Click "Animals" in the sidebar
2. Click "Add Animal"
3. Fill in the details
4. Upload photos
5. Publish when ready

**You can delete this sample profile at any time.**

*Replace this text with a compelling description of your animal's personality, history, and ideal home.*`,
  status: 'available' as const,
  adoptionFee: 150,
  isGoodWithKids: true,
  isGoodWithDogs: true,
  isGoodWithCats: false,
  energyLevel: 'medium' as const,
  location: 'Main Shelter',
  imageUrls: [],
  medicalNotes: 'Sample medical notes - replace with actual information',
  behavioralNotes: 'Sample behavioral notes - describe temperament, training needs, etc.',
};

/**
 * Seed template content for a new tenant
 * This runs automatically when a new organization signs up
 * 
 * @param tenantId - The ID of the newly created tenant
 * @param adminUserId - The ID of the admin user who signed up
 */
export async function seedTenantTemplateContent(
  tenantId: string,
  adminUserId: string
): Promise<void> {
  try {
    console.log(`[Template Seeding] Starting template seeding for tenant: ${tenantId}`);

    // Insert sample custom pages (as drafts)
    const pageInserts = CUSTOM_PAGE_TEMPLATES.map(template => ({
      ...template,
      tenantId,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    }));

    await db.insert(customPages).values(pageInserts);
    console.log(`[Template Seeding] Created ${CUSTOM_PAGE_TEMPLATES.length} sample custom pages`);

    // Insert sample animal profile using createAnimal service
    await createAnimal(tenantId, {
      ...SAMPLE_ANIMAL_TEMPLATE,
      intakeDate: new Date(),
    });
    console.log(`[Template Seeding] Created sample animal profile`);

    console.log(`[Template Seeding] Successfully completed template seeding for tenant: ${tenantId}`);
  } catch (error) {
    // Log error but don't fail the signup process if template seeding fails
    console.error(`[Template Seeding] Failed to seed template content for tenant ${tenantId}:`, error);
    // Template seeding is a nice-to-have, not critical for signup
  }
}
