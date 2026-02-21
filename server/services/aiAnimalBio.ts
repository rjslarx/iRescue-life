import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

interface AnimalInfo {
  name: string;
  species: string;
  breed?: string;
  age?: string;
  sex?: string;
  childFriendly?: boolean | null;
  dogFriendly?: boolean | null;
  catFriendly?: boolean | null;
  specialNeeds?: boolean | null;
}

export async function generateAnimalBio(
  animalInfo: AnimalInfo,
  personalityTags: string[]
): Promise<{ bio: string } | null> {
  try {
    const tagsText = personalityTags.length > 0 
      ? personalityTags.join(", ") 
      : "friendly, loving";

    const friendlyWith: string[] = [];
    if (animalInfo.childFriendly === true) friendlyWith.push("children");
    if (animalInfo.dogFriendly === true) friendlyWith.push("dogs");
    if (animalInfo.catFriendly === true) friendlyWith.push("cats");
    
    const compatibilityText = friendlyWith.length > 0 
      ? `Known to be good with: ${friendlyWith.join(", ")}.` 
      : "";

    const specialNeedsText = animalInfo.specialNeeds 
      ? "This pet has special needs that require extra care and attention." 
      : "";

    const prompt = `You are an expert animal rescue copywriter who creates heartwarming adoption bios for Petfinder.

Write a 2-paragraph adoption bio for the following pet:

Name: ${animalInfo.name}
Species: ${animalInfo.species}
Breed: ${animalInfo.breed || "Mixed"}
Age: ${animalInfo.age || "Unknown"}
Sex: ${animalInfo.sex || "Unknown"}
Personality Tags: ${tagsText}
${compatibilityText}
${specialNeedsText}

Guidelines:
- First paragraph: Introduce the pet with a warm, engaging opening that captures their personality based on the tags provided
- Second paragraph: Describe what kind of home would be perfect for them and encourage potential adopters to meet them
- Use warm, positive language that creates an emotional connection
- Keep it concise but compelling (150-200 words total)
- Don't use clichés like "fur-ever home" 
- Write in third person
- Make it ready to copy directly to Petfinder

Respond with ONLY the bio text, no additional commentary.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
    });

    const bio = response.choices[0]?.message?.content?.trim();
    
    if (!bio) {
      console.error("AI bio generation returned empty content. Response:", JSON.stringify(response.choices?.[0] ?? {}));
      return null;
    }

    return { bio };
  } catch (error: any) {
    console.error("Error generating animal bio:", error?.message || error, error?.status ? `(status: ${error.status})` : "");
    throw error;
  }
}
