type TemplateField = {
  label: string;
  fieldType: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'photo';
  options?: string[];
  required: boolean;
  placeholder?: string;
  helpText?: string;
  textAbove?: string;
  textBelow?: string;
  order: number;
};

export const ADOPTION_FORM_TEMPLATES: Record<string, { name: string; description: string; fields: TemplateField[] }> = {
  comprehensive: {
    name: "Comprehensive Adoption Application",
    description: "A thorough adoption application with 55+ questions covering household info, pet experience, lifestyle, housing, finances, behavioral expectations, and legal acknowledgment. Ideal for rescues that want a detailed screening process.",
    fields: [
      { label: "Address", fieldType: "textarea", required: true, helpText: "Street Address, City, State, Zip Code", order: 0 },
      { label: "Phone Type", fieldType: "radio", required: true, options: ["Cell", "Home", "Work"], order: 1 },
      { label: "Co-Adopter's Name", fieldType: "text", required: false, order: 2 },
      { label: "Co-Adopter's E-mail", fieldType: "text", required: false, order: 3 },
      { label: "Names and ages of all permanent residents of your home (adults/children)", fieldType: "textarea", required: true, order: 4 },
      { label: "Do you currently have any pets?", fieldType: "radio", required: true, options: ["Yes", "No"], order: 5 },
      { label: "If you currently have pets, please list them below.", fieldType: "textarea", required: false, order: 6 },
      { label: "Are your current pets altered?", fieldType: "radio", required: false, options: ["Yes", "No", "Will be within the next 30 days, appointment has been scheduled. (We will call your vet to verify this.)"], order: 7 },
      { label: "If your current pets are not altered, please explain why below.", fieldType: "textarea", required: false, order: 8 },
      { label: "Vet reference (please list the name of the vet clinic you go to, the name of your veterinarian, their phone number, and the name of the owner that the dogs' file is under.)", fieldType: "textarea", required: true, order: 9 },
      { label: "Two Personal References", fieldType: "textarea", required: true, helpText: "Name, email, phone and how they know you.", order: 10 },
      { label: "Are you planning to move in the near future?", fieldType: "radio", required: true, options: ["Yes", "No"], order: 11 },
      { label: "If moving soon, to what city/state?", fieldType: "text", required: false, order: 12 },
      { label: "When will you be ready to adopt this dog?", fieldType: "radio", required: true, options: ["Today", "This weekend", "Within a week", "Within a month", "Not ready yet, just researching"], order: 13 },
      { label: "Are you in contact with any other rescues or shelters about a specific dog?", fieldType: "radio", required: true, options: ["Yes, application is pending", "Yes, just an email inquiry, no app yet", "No, but I am looking at several dogs online", "No, I am only interested in this particular dog"], order: 14 },
      { label: "Are you going to meet another dog?", fieldType: "radio", required: true, options: ["Yes", "No"], order: 15 },
      { label: "If so, when?", fieldType: "text", required: false, order: 16 },
      { label: "Is anyone in your home allergic to dogs?", fieldType: "radio", required: true, options: ["Yes", "No"], order: 17 },
      { label: "Does anyone in your home fear dogs?", fieldType: "radio", required: true, options: ["Yes", "No"], order: 18 },
      { label: "Are you familiar with dog regulations in your area?", fieldType: "radio", required: true, options: ["Yes", "No"], helpText: "If you answered no to the question above, please contact your town/county/condo assoc and ask them what the regulations are.", order: 19 },
      { label: "If yes, please describe local dog regulations and restrictions:", fieldType: "textarea", required: false, order: 20 },
      { label: "I/We live in a", fieldType: "radio", required: true, options: ["Single Family Home", "Duplex/Twin", "Condo/Townhome", "Trailer", "Apartment"], order: 21 },
      { label: "Do you rent or own this property?", fieldType: "radio", required: true, options: ["Rent", "Own"], order: 22 },
      { label: "Renters, have you contacted your landlord to find out if there's any restrictions on the kind or size of dog you can have?", fieldType: "radio", required: false, options: ["Yes", "No", "Not yet, but I will", "It's written in our lease"], helpText: "If you rent, you must show us a written letter from your landlord or a copy of the section of your lease stating that you are allowed to have dogs and showing any limitations.\n\nIf you live in a condo or townhome, you must show us written proof that you are allowed to have a dog there and show any restrictions.", order: 23 },
      { label: "Approximate square footage of your home", fieldType: "radio", required: true, options: ["Less than 800 square feet", "800-1,000 square feet", "1,000-1,500 square feet", "1,500-2,000 square feet", "Over 2,000 square feet"], order: 24 },
      { label: "Do you have a yard?", fieldType: "radio", required: true, options: ["Yard, fenced with a vertical fence", "Yard, fenced with invisible fencing", "Yard, no fence", "No yard (apartment/condo/townhome)"], order: 25 },
      { label: "If vertical fence, what is your fence height?", fieldType: "radio", required: false, options: ["2' high", "3' high", "4' high", "5' high", "6' high"], order: 26 },
      { label: "Approximate dimensions of your lot:", fieldType: "text", required: true, order: 27 },
      { label: "Annual Household Income", fieldType: "radio", required: true, options: ["Under $20,000", "$20,000-$30,000", "$30,001-$50,000", "$50,001-$70,000", "$70,001 or higher"], order: 28 },
      { label: "Do you work outside the home?", fieldType: "radio", required: true, options: ["Yes", "No", "One applicant is home/works from home", "We work different shifts"], order: 29 },
      { label: "If you both work outside the home, how many hours per day are you away?", fieldType: "textarea", required: false, order: 30 },
      { label: "How many hours per day will this dog be alone? Please explain.", fieldType: "textarea", required: true, order: 31 },
      { label: "Have you discussed this adoption with all members of your household?", fieldType: "radio", required: true, options: ["Yes", "No", "Yes, adults have discussed. Kids don't know yet."], helpText: "We will be speaking to all adult residents to confirm everyone is aware of this application process and wants to have a dog added to the family. Please do not submit this application if you are \"trying to talk someone into\" adopting this dog or think \"once they meet the dog, they will want one\" or \"I'm getting this dog as a surprise birthday present for them.\" In those scenarios, you are welcome to email us to discuss the dog, but we would like all adults in the home to be involved in that email discussion.", order: 32 },
      { label: "Based on the description in the dog's bio, do you feel pretty confident that you will be likely to adopt this dog upon meeting it?", fieldType: "radio", required: true, options: ["Yes", "No", "Not sure"], order: 33 },
      { label: "Upon meeting the dog, what would give you cause to not want to adopt it? Please explain.", fieldType: "textarea", required: true, order: 34 },
      { label: "Fantasy question: What would your dream dog be like? (If this dog is not a fit, we may be able to recommend another based on what you say here.)", fieldType: "textarea", required: true, order: 35 },
      { label: "How much do you feel you can reasonably afford and would be willing to spend on your dog per year (for things like veterinary care, licensing, ID tag, food, toys, crate, other supplies, training, pet sitting, etc)?", fieldType: "text", required: true, order: 36 },
      { label: "What activity/energy level do you prefer?", fieldType: "radio", required: true, options: ["Wild and crazy is cool", "Leash trained daily jogging partner would be excellent", "Medium energy, plays a bit then hangs out with you", "Low energy, walks slowly on leash, a total couch potato", "Other"], order: 37 },
      { label: "If you answered 'other' above, please explain:", fieldType: "textarea", required: false, order: 38 },
      { label: "Please check all that apply. I want to adopt this dog...", fieldType: "checkbox", required: true, options: ["As a family pet", "To breed with my dog", "To train/use for hunting", "To train/use for agility", "To train/use as a therapy dog", "To train/use as an assistance dog for the disabled", "To use as a guard dog", "For a jogging/hiking partner", "To interact with lots of friends/family", "As a gift for a friend, partner, or family member", "As a companion for my dog(s)", "As a companion for my cat(s)", "As a companion for my child/children"], order: 39 },
      { label: "Please check all that apply. My adopted dog will...", fieldType: "checkbox", required: true, options: ["Be kept outside most of the time", "Be kept indoors most of the time", "Be left outside during the work day while we are away", "Be kept inside while we are away", "Be crated when we are not home", "Have free reign of the house when we are not home", "Be taken to formal obedience classes", "Be trained by me/us", "Take frequent car rides with us", "Be kept on a lead line/cable in the yard", "Be mostly interacting with adults", "Be interacting frequently with children under 8", "Be interacting frequently with older children", "Must be housebroken prior to adoption", "Will be housetrained by us", "Will be walked more than one mile per day every day", "Will be walked occasionally", "Be attending formal group obedience classes with us", "Be trained by us without the advice of a trainer", "Have private sessions with a trainer as needed", "Be attending agility classes", "Be taking frequent car rides/trips with us", "Be boarded when we go on vacation", "Stay with family when we go on vacation", "Be given away to someone else if we feel it's not a good match for us", "Be turned in to a shelter if we can't keep it", "Be going camping with us", "Be going on boat trips with us", "Be outside with a dog house in a fenced area", "Be outside chained/tethered to a dog house", "Be free roaming on the farm (unfenced)", "Other"], order: 40 },
      { label: "If you answered 'other' above, please explain:", fieldType: "textarea", required: false, order: 41 },
      { label: "Please take time to think, be honest with yourself and us when answering this question. What are you absolutely NOT willing to deal with at the time of adoption or at any time during the life of the dog?", fieldType: "checkbox", required: true, options: ["Housebreaking", "Chewing", "Jumping", "Pulling on leash during walks", "Counter surfing", "Obedience training", "Fear of men", "Fear of women", "Fear of children", "Mouthiness (may sometimes snag your hand or arm instead of the toy in play and will need redirection/training)", "Growling", "Barking", "Rough play with my dog", "High activity level", "Food/toy aggression/not willing to share with other dogs", "Food/toy aggression with people", "Whining/crying", "Blindness", "Limited Sight", "Deafness", "Separation Anxiety", "Diabetes", "Special Diet", "Long Term Medication", "Incontinence / Leaking Urine", "Taking classes with the dog", "Gets stressed/carsick when riding in vehicle", "Doesn't know how to climb stairs", "Can't climb stairs due to age/arthritis/health issues", "Heart condition", "Skin allergies", "Food allergies", "Trimming nails", "Yeast on coat or in ears", "Ear mites", "Fleas", "Ticks", "Heartworm preventative", "Annual heartworm/lyme combo testing", "I will do whatever it takes to help this dog adjust and work with a trainer to help resolve any training needs.", "Other"], order: 42 },
      { label: "If you answered 'other' above, please explain:", fieldType: "textarea", required: false, order: 43 },
      { label: "What would cause you to return a dog?", fieldType: "textarea", required: true, order: 44 },
      { label: "What do you feel is a reasonable amount of time for a dog to adjust to life with you/your family?", fieldType: "textarea", required: true, order: 45 },
      { label: "How do you plan to integrate this dog into your family?", fieldType: "textarea", required: true, order: 46 },
      { label: "What would you do if you discovered after adoption (at any time during the life of the dog) if your vet diagnosed an expensive health condition?", fieldType: "textarea", required: true, order: 47 },
      { label: "Do you plan to get pet health insurance?", fieldType: "radio", required: true, options: ["Yes", "No", "I wasn't aware this was available. I will look into it."], order: 48 },
      { label: "What brand of dog food do you plan to feed?", fieldType: "text", required: true, order: 49 },
      { label: "Grooming (please check all that apply)", fieldType: "checkbox", required: true, options: ["We use a professional groomer", "We trim dog nails ourselves at home", "We bathe our dogs at home once a week", "We bathe our dogs at home once a month", "We bathe our dogs at home once every few months or whenever their coat feels dirty", "We bathe our dog twice a year", "We don't bathe our dog", "We check ears weekly for infection/yeast/mites", "We check coat daily for ticks in spring/summer/fall", "We clean teeth using home methods", "We take our dogs to the vet for dentals whenever the vet recommends this is needed", "Prefer a dog that doesn't shed", "Don't care about shedding"], order: 50 },
      { label: "How long have you been looking for a dog?", fieldType: "text", required: true, order: 51 },
      { label: "Do you plan to take formal obedience classes?", fieldType: "radio", required: true, options: ["Yes", "No"], order: 52 },
      { label: "Additional reference (if desired)", fieldType: "textarea", required: false, order: 53 },
      { label: "Do you have any additional comments, questions or concerns? Anything else you would like us to know to help match you up to a dog?", fieldType: "textarea", required: true, order: 54 },
      { label: "Please read the above, check this box, sign, and click Submit.", fieldType: "checkbox", required: false, options: ["I/We have read and understand all of the above."], textAbove: "I understand that completing this application does not guarantee I will be allowed to adopt a dog, and that the application is a tool to help {{organization_name}} determine if this dog and my family are a good fit for each other. I acknowledge that all information provided on this form is true and correct. I understand that any misrepresentations may result in my not being approved and/or removal of the adopted dog from my possession. I also certify that I have never been convicted of animal cruelty or neglect.\n\nI agree to allow a representative from {{organization_name}} to contact my vet for a reference and also agree to allowing a home visit prior to adopting this dog. If I am approved to adopt a dog, I agree to pay a non-refundable adoption fee and hand sign an adoption contract at the time of adoption.\n\nI understand that all dogs adopted from {{organization_name}} will be spayed/neutered, heartworm tested, fecal tested, and vaccinated prior to adoption.", order: 55 },
      { label: "Applicant's Signature", fieldType: "text", required: true, order: 56 },
      { label: "Co-Applicant's Signature", fieldType: "text", required: false, order: 57 },
      { label: "Signature date", fieldType: "text", required: true, order: 58 },
    ],
  },
};

export function resolveTemplatePlaceholders(text: string | undefined | null, tenantName: string): string | undefined {
  if (!text) return undefined;
  return text.replace(/\{\{organization_name\}\}/g, tenantName);
}
