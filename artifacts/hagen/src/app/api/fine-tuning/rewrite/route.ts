import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text) return NextResponse.json({ error: 'Missing text' }, { status: 400 });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' }); // Use a smart base model

    const prompt = `Du är en professionell redaktör. Din uppgift är att skriva om följande analys till en neutral, encyklopedisk och objektiv ton.
    
    Behåll alla insikter om humormekanismer och sociala dynamiker.
    Ta bort alla meta-kommentarer som "AI missade..." eller "Här ser vi...".
    Gör texten koncis och kärnfull.
    
    Text att skriva om:
    "${text}"`;

    const result = await model.generateContent(prompt);
    const rewritten = result.response.text();

    return NextResponse.json({ rewritten });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
