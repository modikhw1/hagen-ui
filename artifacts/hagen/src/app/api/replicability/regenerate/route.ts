import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

export async function POST(request: Request) {
  try {
    const { feedback, current_analysis, signals, notes } = await request.json();

    const prompt = `
Du hjälper till att förfina ett dataset för att träna en modell på analys av videoreplikerbarhet.
Målet är att skapa en neutral, objektiv paragraf som beskriver hur replikerbart ett videokoncept är.

NUVARANDE ANALYS:
${current_analysis}

SIGNALER (Teknisk data):
${JSON.stringify(signals, null, 2)}

ORIGINALANTECKNINGAR:
${notes}

ANVÄNDARFEEDBACK (KRITIK):
${feedback}

UPPGIFT:
Skriv om analysen för att bemöta feedbacken. Håll det neutralt och objektivt. Nämn inte "användaren" eller "feedbacken". Outputta den förbättrade paragrafen på SVENSKA.
`;

    const result = await model.generateContent(prompt);
    const newAnalysis = result.response.text().trim();

    return NextResponse.json({ analysis: newAnalysis });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
