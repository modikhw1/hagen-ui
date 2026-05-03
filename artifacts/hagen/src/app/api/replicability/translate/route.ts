import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

export async function POST(request: Request) {
  try {
    const { text } = await request.json();

    const prompt = `
Translate the following text to Swedish. Keep the tone neutral, objective, and professional.
TEXT:
${text}
`;

    const result = await model.generateContent(prompt);
    const translatedText = result.response.text().trim();

    return NextResponse.json({ analysis: translatedText });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
