import OpenAI from "openai";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

export interface ExtractedVaccine {
  itemName: string;
  dateGiven: string;
  dateDue?: string;
  manufacturer?: string;
  lotNumber?: string;
  administeredBy?: string;
  confidence: number;
  sourceText?: string;
}

export interface ExtractedProcedure {
  procedureName: string;
  procedureDate: string;
  veterinarian?: string;
  notes?: string;
  confidence: number;
  sourceText?: string;
}

export interface ExtractedPrescription {
  medicationName: string;
  dosage: string;
  route?: string;
  frequency: string;
  startDate: string;
  endDate?: string;
  notes?: string;
  confidence: number;
  sourceText?: string;
}

export interface ExtractedDiagnostic {
  testName: string;
  testDate: string;
  result: string;
  notes?: string;
  confidence: number;
  sourceText?: string;
}

export interface ExtractedExam {
  examType: string;
  examDate: string;
  performedBy: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  weight?: string;
  temperature?: string;
  confidence: number;
  sourceText?: string;
}

export interface MedicalExtractionResult {
  success: boolean;
  extractedText: string;
  pageCount: number;
  vaccines: ExtractedVaccine[];
  procedures: ExtractedProcedure[];
  prescriptions: ExtractedPrescription[];
  diagnostics: ExtractedDiagnostic[];
  exams: ExtractedExam[];
  overallConfidence: number;
  processingNotes: string;
  error?: string;
}

export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<{ text: string; pageCount: number }> {
  try {
    const data = await pdfParse(pdfBuffer);
    return {
      text: data.text,
      pageCount: data.numpages
    };
  } catch (error) {
    console.error("PDF parsing error:", error);
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function parseMedicalRecordsWithAI(
  extractedText: string,
  animalName: string,
  animalType: string
): Promise<MedicalExtractionResult> {
  const systemPrompt = `You are an expert veterinary medical records parser. Your task is to extract structured medical information from veterinary clinic documents.

Extract the following types of records when present:
1. VACCINES: vaccination records with dates, vaccine names, manufacturers, lot numbers
2. PROCEDURES: surgical procedures, spay/neuter, dental cleanings, etc.
3. PRESCRIPTIONS: medications with dosages, routes, frequencies
4. DIAGNOSTICS: lab tests, blood work, fecal tests, heartworm tests with results
5. EXAMS: physical examinations with findings

Guidelines:
- Parse dates in ISO format (YYYY-MM-DD) when possible
- If a date only has month/year, use the first of the month
- Extract vaccine due dates when available
- For procedures, include any surgical notes
- For prescriptions, identify route (PO, SQ, IM, IV, Topical) when mentioned
- For diagnostics, always capture the result (positive/negative/normal/abnormal with values)
- Assign a confidence score (0-100) for each extracted item based on clarity of the source text
- Include the original source text snippet for each extraction

Return your response as valid JSON matching this exact structure:
{
  "vaccines": [
    {
      "itemName": "string",
      "dateGiven": "YYYY-MM-DD",
      "dateDue": "YYYY-MM-DD or null",
      "manufacturer": "string or null",
      "lotNumber": "string or null",
      "administeredBy": "string or null",
      "confidence": 0-100,
      "sourceText": "original text snippet"
    }
  ],
  "procedures": [
    {
      "procedureName": "string",
      "procedureDate": "YYYY-MM-DD",
      "veterinarian": "string or null",
      "notes": "string or null",
      "confidence": 0-100,
      "sourceText": "original text snippet"
    }
  ],
  "prescriptions": [
    {
      "medicationName": "string",
      "dosage": "string",
      "route": "PO|SQ|IM|IV|Topical|Other or null",
      "frequency": "string",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD or null",
      "notes": "string or null",
      "confidence": 0-100,
      "sourceText": "original text snippet"
    }
  ],
  "diagnostics": [
    {
      "testName": "string",
      "testDate": "YYYY-MM-DD",
      "result": "string",
      "notes": "string or null",
      "confidence": 0-100,
      "sourceText": "original text snippet"
    }
  ],
  "exams": [
    {
      "examType": "intake|recheck|adoption|wellness|emergency|other",
      "examDate": "YYYY-MM-DD",
      "performedBy": "string",
      "subjective": "string or null",
      "objective": "string or null",
      "assessment": "string or null",
      "plan": "string or null",
      "weight": "string with unit or null",
      "temperature": "string with unit or null",
      "confidence": 0-100,
      "sourceText": "original text snippet"
    }
  ],
  "overallConfidence": 0-100,
  "processingNotes": "Notes about extraction quality, any unclear sections, or missing information"
}

Be thorough but accurate. Only extract information that is clearly present in the document. Do not hallucinate or guess values.`;

  const userPrompt = `Parse the following veterinary medical records for ${animalName} (a ${animalType}).

DOCUMENT TEXT:
${extractedText}

Extract all medical records present and return the structured JSON.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    let parsed: Record<string, unknown>;
    try {
      const trimmedContent = content.trim();
      parsed = JSON.parse(trimmedContent);
    } catch (parseError) {
      console.error("JSON parse error:", parseError, "Content:", content.substring(0, 200));
      throw new Error("AI response was not valid JSON");
    }

    const validateArray = <T>(arr: unknown, validator: (item: unknown) => T | null): T[] => {
      if (!Array.isArray(arr)) return [];
      return arr.map(validator).filter((item): item is T => item !== null);
    };

    const validateVaccine = (item: unknown): ExtractedVaccine | null => {
      if (!item || typeof item !== 'object') return null;
      const v = item as Record<string, unknown>;
      if (!v.itemName || !v.dateGiven) return null;
      return {
        itemName: String(v.itemName),
        dateGiven: String(v.dateGiven),
        dateDue: v.dateDue ? String(v.dateDue) : undefined,
        manufacturer: v.manufacturer ? String(v.manufacturer) : undefined,
        lotNumber: v.lotNumber ? String(v.lotNumber) : undefined,
        administeredBy: v.administeredBy ? String(v.administeredBy) : undefined,
        confidence: typeof v.confidence === 'number' ? v.confidence : 50,
        sourceText: v.sourceText ? String(v.sourceText) : undefined
      };
    };

    const validateProcedure = (item: unknown): ExtractedProcedure | null => {
      if (!item || typeof item !== 'object') return null;
      const p = item as Record<string, unknown>;
      if (!p.procedureName || !p.procedureDate) return null;
      return {
        procedureName: String(p.procedureName),
        procedureDate: String(p.procedureDate),
        veterinarian: p.veterinarian ? String(p.veterinarian) : undefined,
        notes: p.notes ? String(p.notes) : undefined,
        confidence: typeof p.confidence === 'number' ? p.confidence : 50,
        sourceText: p.sourceText ? String(p.sourceText) : undefined
      };
    };

    const validatePrescription = (item: unknown): ExtractedPrescription | null => {
      if (!item || typeof item !== 'object') return null;
      const p = item as Record<string, unknown>;
      if (!p.medicationName || !p.dosage || !p.frequency || !p.startDate) return null;
      return {
        medicationName: String(p.medicationName),
        dosage: String(p.dosage),
        route: p.route ? String(p.route) : undefined,
        frequency: String(p.frequency),
        startDate: String(p.startDate),
        endDate: p.endDate ? String(p.endDate) : undefined,
        notes: p.notes ? String(p.notes) : undefined,
        confidence: typeof p.confidence === 'number' ? p.confidence : 50,
        sourceText: p.sourceText ? String(p.sourceText) : undefined
      };
    };

    const validateDiagnostic = (item: unknown): ExtractedDiagnostic | null => {
      if (!item || typeof item !== 'object') return null;
      const d = item as Record<string, unknown>;
      if (!d.testName || !d.testDate || !d.result) return null;
      return {
        testName: String(d.testName),
        testDate: String(d.testDate),
        result: String(d.result),
        notes: d.notes ? String(d.notes) : undefined,
        confidence: typeof d.confidence === 'number' ? d.confidence : 50,
        sourceText: d.sourceText ? String(d.sourceText) : undefined
      };
    };

    const validateExam = (item: unknown): ExtractedExam | null => {
      if (!item || typeof item !== 'object') return null;
      const e = item as Record<string, unknown>;
      if (!e.examDate || !e.performedBy) return null;
      const validExamTypes = ['intake', 'recheck', 'adoption', 'wellness', 'emergency', 'other'];
      return {
        examType: validExamTypes.includes(String(e.examType)) ? String(e.examType) : 'other',
        examDate: String(e.examDate),
        performedBy: String(e.performedBy),
        subjective: e.subjective ? String(e.subjective) : undefined,
        objective: e.objective ? String(e.objective) : undefined,
        assessment: e.assessment ? String(e.assessment) : undefined,
        plan: e.plan ? String(e.plan) : undefined,
        weight: e.weight ? String(e.weight) : undefined,
        temperature: e.temperature ? String(e.temperature) : undefined,
        confidence: typeof e.confidence === 'number' ? e.confidence : 50,
        sourceText: e.sourceText ? String(e.sourceText) : undefined
      };
    };

    return {
      success: true,
      extractedText,
      pageCount: 0,
      vaccines: validateArray(parsed.vaccines, validateVaccine),
      procedures: validateArray(parsed.procedures, validateProcedure),
      prescriptions: validateArray(parsed.prescriptions, validatePrescription),
      diagnostics: validateArray(parsed.diagnostics, validateDiagnostic),
      exams: validateArray(parsed.exams, validateExam),
      overallConfidence: typeof parsed.overallConfidence === 'number' ? parsed.overallConfidence : 0,
      processingNotes: typeof parsed.processingNotes === 'string' ? parsed.processingNotes : ""
    };
  } catch (error) {
    console.error("AI parsing error:", error);
    return {
      success: false,
      extractedText,
      pageCount: 0,
      vaccines: [],
      procedures: [],
      prescriptions: [],
      diagnostics: [],
      exams: [],
      overallConfidence: 0,
      processingNotes: "",
      error: error instanceof Error ? error.message : "Unknown AI parsing error"
    };
  }
}

export async function processMedicalDocument(
  pdfBuffer: Buffer,
  animalName: string,
  animalType: string
): Promise<MedicalExtractionResult> {
  const { text, pageCount } = await extractTextFromPdf(pdfBuffer);
  
  if (!text || text.trim().length < 50) {
    return {
      success: false,
      extractedText: text,
      pageCount,
      vaccines: [],
      procedures: [],
      prescriptions: [],
      diagnostics: [],
      exams: [],
      overallConfidence: 0,
      processingNotes: "Document appears to be empty or contains very little extractable text. This may be a scanned image that requires OCR.",
      error: "Insufficient text extracted from document"
    };
  }

  const result = await parseMedicalRecordsWithAI(text, animalName, animalType);
  result.pageCount = pageCount;
  result.extractedText = text;
  
  return result;
}
