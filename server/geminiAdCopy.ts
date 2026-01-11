import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || '',
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || '',
  },
});

export interface AdCopyResult {
  headlines: string[];
  descriptions: string[];
}

export async function generateAdCopy(
  animalName: string,
  bio: string,
  species: string = 'dog'
): Promise<AdCopyResult | null> {
  const prompt = `
You are a Google Ad Grants expert for Animal Rescues. 
Your goal is to write high-CTR ad copy that strictly follows Google's compliance rules.

INPUT DATA:
Name: ${animalName}
Species: ${species}
Bio: ${bio}

STRICT CONSTRAINTS:
1. Headlines: Must be 30 characters or less.
2. Descriptions: Must be 90 characters or less.
3. NO SINGLE WORD KEYWORDS. (e.g. "Adopt" alone is forbidden. "Adopt ${animalName}" is allowed).
4. TONE: Urgent, emotional, and action-oriented.
5. Call To Action: Clear and direct (e.g., "Meet him today").
6. Include the animal's name in at least 2 headlines.
7. Focus on emotional hooks about rescue, second chances, and finding forever homes.

OUTPUT FORMAT (JSON ONLY, no markdown, no code blocks):
{
  "headlines": ["Headline 1", "Headline 2", "Headline 3", "Headline 4", "Headline 5"],
  "descriptions": ["Description 1", "Description 2"]
}
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = response.text || '';
    const jsonString = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(jsonString) as AdCopyResult;

    const validatedHeadlines = result.headlines.filter(h => {
      const isValid = h.length <= 30 && h.trim().split(/\s+/).length > 1;
      if (!isValid) {
        console.warn(`Filtered out invalid headline: "${h}" (length: ${h.length}, words: ${h.trim().split(/\s+/).length})`);
      }
      return isValid;
    });

    const validatedDescriptions = result.descriptions.filter(d => {
      const isValid = d.length <= 90;
      if (!isValid) {
        console.warn(`Filtered out invalid description: "${d}" (length: ${d.length})`);
      }
      return isValid;
    });

    return {
      headlines: validatedHeadlines.slice(0, 15),
      descriptions: validatedDescriptions.slice(0, 4),
    };
  } catch (error) {
    console.error("AI Ad Copy Generation Failed:", error);
    return null;
  }
}

export async function generateBulkAdCopy(
  animals: Array<{ name: string; bio: string; species: string }>
): Promise<Map<string, AdCopyResult | null>> {
  const results = new Map<string, AdCopyResult | null>();
  
  for (const animal of animals) {
    const result = await generateAdCopy(animal.name, animal.bio, animal.species);
    results.set(animal.name, result);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return results;
}
