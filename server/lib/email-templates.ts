/**
 * Pre-designed email newsletter templates for rescue organizations
 * Each template uses inline styles for maximum email client compatibility
 * Supports dynamic variable replacement: {{variableName}}
 */

export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  category: 'animal' | 'event' | 'newsletter' | 'donation';
  variables: string[]; // List of available variables
  html: string;
  previewImage?: string; // Optional preview image URL
}

/**
 * Template 1: New Animal Available
 * Perfect for announcing a new adoptable animal
 */
const newAnimalTemplate: EmailTemplate = {
  id: 'new-animal',
  name: 'New Animal Available',
  description: 'Showcase a newly available animal with photo and details',
  category: 'animal',
  variables: ['rescueName', 'animalName', 'animalSpecies', 'animalBreed', 'animalAge', 'animalBio', 'animalImageUrl', 'adoptionUrl', 'websiteUrl'],
  html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meet {{animalName}}!</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f6f9fc;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f6f9fc;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: bold; line-height: 1.2;">Meet {{animalName}}! 🐾</h1>
              <p style="margin: 10px 0 0; color: #ffffff; font-size: 16px; opacity: 0.95;">A new friend is waiting for you</p>
            </td>
          </tr>
          
          <!-- Animal Image -->
          <tr>
            <td style="padding: 0;">
              <img src="{{animalImageUrl}}" alt="{{animalName}}" style="width: 100%; height: auto; display: block; max-height: 400px; object-fit: cover;">
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px; color: #1a202c; font-size: 24px; font-weight: 600;">About {{animalName}}</h2>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 20px;">
                <tr>
                  <td style="padding: 8px 0; color: #4a5568; font-size: 15px;">
                    <strong style="color: #2d3748;">Species:</strong> {{animalSpecies}}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #4a5568; font-size: 15px;">
                    <strong style="color: #2d3748;">Breed:</strong> {{animalBreed}}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #4a5568; font-size: 15px;">
                    <strong style="color: #2d3748;">Age:</strong> {{animalAge}}
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 30px; color: #4a5568; font-size: 16px; line-height: 1.6;">{{animalBio}}</p>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center;">
                    <a href="{{adoptionUrl}}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.4);">Apply to Adopt {{animalName}}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f7fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 10px; color: #718096; font-size: 14px;">
                Thank you for supporting {{rescueName}}!
              </p>
              <p style="margin: 0; color: #a0aec0; font-size: 13px;">
                <a href="{{websiteUrl}}" style="color: #667eea; text-decoration: none;">Visit Our Website</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
};

/**
 * Template 2: Adoption Success Story
 * Celebrate successful adoptions and share happy outcomes
 */
const adoptionSuccessTemplate: EmailTemplate = {
  id: 'adoption-success',
  name: 'Adoption Success Story',
  description: 'Celebrate a successful adoption with before/after story',
  category: 'animal',
  variables: ['rescueName', 'animalName', 'adopterName', 'storyText', 'imageUrl', 'donateUrl', 'websiteUrl'],
  html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Success Story: {{animalName}}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f6f9fc;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f6f9fc;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: bold; line-height: 1.2;">🎉 Happy Tails! 🎉</h1>
              <p style="margin: 10px 0 0; color: #ffffff; font-size: 18px; opacity: 0.95;">{{animalName}} Found a Forever Home!</p>
            </td>
          </tr>
          
          <!-- Success Image -->
          <tr>
            <td style="padding: 0;">
              <img src="{{imageUrl}}" alt="{{animalName}} with new family" style="width: 100%; height: auto; display: block; max-height: 400px; object-fit: cover;">
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px; color: #1a202c; font-size: 24px; font-weight: 600; text-align: center;">A Happy Ending for {{animalName}}</h2>
              
              <p style="margin: 0 0 20px; color: #4a5568; font-size: 16px; line-height: 1.6;">{{storyText}}</p>
              
              <div style="background-color: #f0fff4; border-left: 4px solid #48bb78; padding: 20px; margin: 30px 0; border-radius: 4px;">
                <p style="margin: 0; color: #22543d; font-size: 15px; font-style: italic;">
                  "Thank you {{rescueName}} for bringing {{animalName}} into our lives. We couldn't be happier!" - {{adopterName}}
                </p>
              </div>
              
              <p style="margin: 30px 0 0; color: #4a5568; font-size: 16px; line-height: 1.6; text-align: center;">
                Your support makes stories like this possible. Help us save more lives!
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 30px;">
                <tr>
                  <td style="text-align: center;">
                    <a href="{{donateUrl}}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(72, 187, 120, 0.4);">Support Our Mission</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f7fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 10px; color: #718096; font-size: 14px;">
                Together, we're making a difference at {{rescueName}}
              </p>
              <p style="margin: 0; color: #a0aec0; font-size: 13px;">
                <a href="{{websiteUrl}}" style="color: #48bb78; text-decoration: none;">Visit Our Website</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
};

/**
 * Template 3: Upcoming Event
 * Promote rescue events, adoption days, fundraisers
 */
const upcomingEventTemplate: EmailTemplate = {
  id: 'upcoming-event',
  name: 'Upcoming Event',
  description: 'Promote events, adoption days, and fundraisers',
  category: 'event',
  variables: ['rescueName', 'eventTitle', 'eventDate', 'eventTime', 'eventLocation', 'eventDescription', 'eventImageUrl', 'rsvpUrl', 'websiteUrl'],
  html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{eventTitle}}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f6f9fc;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f6f9fc;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: bold; line-height: 1.2;">📅 You're Invited!</h1>
              <p style="margin: 10px 0 0; color: #ffffff; font-size: 16px; opacity: 0.95;">Join us for a special event</p>
            </td>
          </tr>
          
          <!-- Event Image -->
          <tr>
            <td style="padding: 0;">
              <img src="{{eventImageUrl}}" alt="{{eventTitle}}" style="width: 100%; height: auto; display: block; max-height: 300px; object-fit: cover;">
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 30px; color: #1a202c; font-size: 28px; font-weight: 600; text-align: center;">{{eventTitle}}</h2>
              
              <!-- Event Details Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fef5e7; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 25px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 10px 0; color: #2d3748; font-size: 15px;">
                          <strong>📅 Date:</strong> {{eventDate}}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; color: #2d3748; font-size: 15px;">
                          <strong>🕐 Time:</strong> {{eventTime}}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; color: #2d3748; font-size: 15px;">
                          <strong>📍 Location:</strong> {{eventLocation}}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 30px; color: #4a5568; font-size: 16px; line-height: 1.6;">{{eventDescription}}</p>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center;">
                    <a href="{{rsvpUrl}}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(240, 147, 251, 0.4);">RSVP Now</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f7fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 10px; color: #718096; font-size: 14px;">
                We can't wait to see you at {{rescueName}}!
              </p>
              <p style="margin: 0; color: #a0aec0; font-size: 13px;">
                <a href="{{websiteUrl}}" style="color: #f5576c; text-decoration: none;">Visit Our Website</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
};

/**
 * Template 4: Monthly Newsletter
 * General updates, multiple animals, news
 */
const monthlyNewsletterTemplate: EmailTemplate = {
  id: 'monthly-newsletter',
  name: 'Monthly Newsletter',
  description: 'Share updates, news, and featured animals',
  category: 'newsletter',
  variables: ['rescueName', 'month', 'headlineText', 'mainContent', 'featuredAnimalName', 'featuredAnimalImage', 'statsAdoptions', 'statsFosters', 'statsVolunteers', 'websiteUrl'],
  html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{month}} Newsletter - {{rescueName}}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f6f9fc;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f6f9fc;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: bold; line-height: 1.2;">{{month}} Newsletter</h1>
              <p style="margin: 10px 0 0; color: #ffffff; font-size: 16px; opacity: 0.95;">Updates from {{rescueName}}</p>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px; color: #1a202c; font-size: 24px; font-weight: 600;">{{headlineText}}</h2>
              
              <p style="margin: 0 0 30px; color: #4a5568; font-size: 16px; line-height: 1.6;">{{mainContent}}</p>
              
              <!-- Stats Section -->
              <h3 style="margin: 0 0 20px; color: #2d3748; font-size: 20px; font-weight: 600;">This Month's Impact</h3>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 30px;">
                <tr>
                  <td style="width: 33.33%; padding: 15px; text-align: center; background-color: #ebf8ff; border-radius: 8px;">
                    <div style="font-size: 32px; font-weight: bold; color: #2c5282; margin-bottom: 5px;">{{statsAdoptions}}</div>
                    <div style="font-size: 13px; color: #4a5568;">Adoptions</div>
                  </td>
                  <td style="width: 10px;"></td>
                  <td style="width: 33.33%; padding: 15px; text-align: center; background-color: #f0fff4; border-radius: 8px;">
                    <div style="font-size: 32px; font-weight: bold; color: #276749; margin-bottom: 5px;">{{statsFosters}}</div>
                    <div style="font-size: 13px; color: #4a5568;">Fosters</div>
                  </td>
                  <td style="width: 10px;"></td>
                  <td style="width: 33.33%; padding: 15px; text-align: center; background-color: #fef5e7; border-radius: 8px;">
                    <div style="font-size: 32px; font-weight: bold; color: #975a16; margin-bottom: 5px;">{{statsVolunteers}}</div>
                    <div style="font-size: 13px; color: #4a5568;">Volunteers</div>
                  </td>
                </tr>
              </table>
              
              <!-- Featured Animal -->
              <h3 style="margin: 30px 0 20px; color: #2d3748; font-size: 20px; font-weight: 600;">Featured Friend: {{featuredAnimalName}}</h3>
              
              <img src="{{featuredAnimalImage}}" alt="{{featuredAnimalName}}" style="width: 100%; height: auto; display: block; border-radius: 8px; margin-bottom: 20px; max-height: 300px; object-fit: cover;">
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center;">
                    <a href="{{websiteUrl}}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(79, 172, 254, 0.4);">View All Adoptable Animals</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f7fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 10px; color: #718096; font-size: 14px;">
                Thank you for being part of the {{rescueName}} family!
              </p>
              <p style="margin: 0; color: #a0aec0; font-size: 13px;">
                <a href="{{websiteUrl}}" style="color: #4facfe; text-decoration: none;">Visit Our Website</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
};

/**
 * Template 5: Donation Appeal
 * Request donations with impact messaging
 */
const donationAppealTemplate: EmailTemplate = {
  id: 'donation-appeal',
  name: 'Donation Appeal',
  description: 'Request donations with emotional appeal and impact stats',
  category: 'donation',
  variables: ['rescueName', 'appealTitle', 'appealMessage', 'impactAmount1', 'impactText1', 'impactAmount2', 'impactText2', 'impactAmount3', 'impactText3', 'heroImageUrl', 'donateUrl', 'websiteUrl'],
  html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{appealTitle}}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f6f9fc;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f6f9fc;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: bold; line-height: 1.2; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">{{appealTitle}}</h1>
              <p style="margin: 10px 0 0; color: #ffffff; font-size: 16px; opacity: 0.95;">Every donation makes a difference</p>
            </td>
          </tr>
          
          <!-- Hero Image -->
          <tr>
            <td style="padding: 0;">
              <img src="{{heroImageUrl}}" alt="Help Us Save Lives" style="width: 100%; height: auto; display: block; max-height: 350px; object-fit: cover;">
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 30px; color: #4a5568; font-size: 17px; line-height: 1.7;">{{appealMessage}}</p>
              
              <h3 style="margin: 0 0 25px; color: #2d3748; font-size: 22px; font-weight: 600; text-align: center;">Your Impact</h3>
              
              <!-- Impact Tiers -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 30px;">
                <tr>
                  <td style="padding: 20px; background-color: #fff5f5; border-left: 4px solid #fc8181; border-radius: 4px; margin-bottom: 15px;">
                    <div style="font-size: 24px; font-weight: bold; color: #c53030; margin-bottom: 8px;">{{impactAmount1}}</div>
                    <div style="font-size: 15px; color: #4a5568; line-height: 1.5;">{{impactText1}}</div>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 30px;">
                <tr>
                  <td style="padding: 20px; background-color: #fef5e7; border-left: 4px solid #f6ad55; border-radius: 4px;">
                    <div style="font-size: 24px; font-weight: bold; color: #c05621; margin-bottom: 8px;">{{impactAmount2}}</div>
                    <div style="font-size: 15px; color: #4a5568; line-height: 1.5;">{{impactText2}}</div>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 30px;">
                <tr>
                  <td style="padding: 20px; background-color: #f0fff4; border-left: 4px solid #68d391; border-radius: 4px;">
                    <div style="font-size: 24px; font-weight: bold; color: #2f855a; margin-bottom: 8px;">{{impactAmount3}}</div>
                    <div style="font-size: 15px; color: #4a5568; line-height: 1.5;">{{impactText3}}</div>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center;">
                    <a href="{{donateUrl}}" style="display: inline-block; padding: 18px 40px; background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: 600; box-shadow: 0 4px 6px rgba(250, 112, 154, 0.4); text-shadow: 0 1px 2px rgba(0,0,0,0.1);">Make a Donation Today</a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #718096; font-size: 14px; text-align: center; line-height: 1.6;">
                Your generosity helps us continue our mission to rescue, rehabilitate, and rehome animals in need.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f7fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 10px; color: #718096; font-size: 14px;">
                Thank you for your compassion and support!
              </p>
              <p style="margin: 0; color: #a0aec0; font-size: 13px;">
                <a href="{{websiteUrl}}" style="color: #fa709a; text-decoration: none;">{{rescueName}}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
};

/**
 * All available templates
 */
export const EMAIL_TEMPLATES: EmailTemplate[] = [
  newAnimalTemplate,
  adoptionSuccessTemplate,
  upcomingEventTemplate,
  monthlyNewsletterTemplate,
  donationAppealTemplate,
];

/**
 * Get template by ID
 */
export function getTemplateById(id: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find(t => t.id === id);
}

/**
 * Replace variables in template HTML
 * Variables should be in format: {{variableName}}
 */
export function replaceTemplateVariables(html: string, variables: Record<string, string>): string {
  let result = html;
  
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value || '');
  }
  
  return result;
}

/**
 * Get list of unreplaced variables in HTML (for validation)
 */
export function getUnreplacedVariables(html: string): string[] {
  const matches = html.match(/{{([^}]+)}}/g);
  if (!matches) return [];
  
  return matches.map(match => match.replace(/{{|}}/g, ''));
}
