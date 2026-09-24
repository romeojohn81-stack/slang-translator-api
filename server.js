import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from '@google/genai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `
You are an expert American cultural dialect and slang translator.
Your goal is to accurately translate text between American Slang and everyday English variants.

Tone Guidelines:
- "Casual English": Real, natural, everyday conversation between friends. Never sound robotic, outdated, or like a dictionary.
- "Formal English": Professional, polite, workplace-ready phrasing.
- "Slang": Authentic, contemporary usage matching the specified era/region.

Handling Explicit Content:
- If is18Plus is FALSE: Censor all profanity, vulgarity, or sexually suggestive slang with asterisks (e.g., "f***") and translate into clean, family-friendly terms.
- If is18Plus is TRUE: Accurately translate vulgarities, explicit party talk, and adult vernacular without refusal. Flag each explicit item in the breakdown array with "isExplicit: true".
`;

app.post('/api/translate', async (req, res) => {
  try {
    const { 
      text, 
      direction,    // 'to_slang' | 'from_slang'
      slangStyle,   // 'Gen Z' | 'Millennial' | 'NYC' | 'Bay Area' | 'Southern'
      englishStyle, // 'casual' | 'formal'
      is18Plus = false 
    } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text input is required' });
    }

    let targetInstruction = '';
    if (direction === 'to_slang') {
      targetInstruction = `Translate this English into authentic ${slangStyle || 'Gen Z'} American slang:\n"${text}"`;
    } else {
      const mode = englishStyle === 'formal' ? 'Formal / Professional English' : 'Natural Casual English';
      targetInstruction = `Translate this American slang into clear, authentic ${mode}:\n"${text}"`;
    }

    const safetySettings = is18Plus
      ? [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ]
      : [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
        ];

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `User Settings: { is18Plus: ${is18Plus} }\n\nTask: ${targetInstruction}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        safetySettings,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            translatedText: { type: Type.STRING },
            tone: { type: Type.STRING },
            workplaceSafe: { type: Type.BOOLEAN },
            isAdultContent: { type: Type.BOOLEAN },
            breakdown: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  term: { type: Type.STRING },
                  literalMeaning: { type: Type.STRING },
                  casualEquivalent: { type: Type.STRING },
                  isExplicit: { type: Type.BOOLEAN }
                },
                required: ['term', 'literalMeaning', 'casualEquivalent', 'isExplicit']
              }
            }
          },
          required: ['translatedText', 'breakdown', 'workplaceSafe', 'isAdultContent']
        }
      }
    });

    const parsedData = JSON.parse(response.text);
    return res.status(200).json(parsedData);

  } catch (error) {
    console.error('Translation processing error:', error);
    return res.status(500).json({ 
      error: 'Translation failed', 
      details: error.message || 'Content may have triggered severe policy filters.' 
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Slang Translator API running on port ${PORT}`));
