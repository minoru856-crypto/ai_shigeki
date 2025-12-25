
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";
import { RuleFile } from "../types";

export const getGeminiResponseStream = async (
  userMessage: string,
  files: RuleFile[],
  history: { role: 'user' | 'assistant', text: string }[]
) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const formattedSources = files.length > 0 
    ? files.map(f => `FILE:${f.name}\n${f.content}\n`).join('\n')
    : "DOCS_NOT_FOUND";

  const systemContext = `
    ${SYSTEM_INSTRUCTION}
    
    【参照ドキュメント】
    ${formattedSources}
  `;

  try {
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: [
        ...history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] })),
        { role: 'user', parts: [{ text: userMessage }] }
      ],
      config: {
        systemInstruction: systemContext,
        temperature: 0.1,
        topP: 0.8,
      },
    });

    return responseStream;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("通信が不安定なようだ。もう一度頼む。");
  }
};

/**
 * ペルソナ画像を生成する関数
 * @param prompt イメージのプロンプト
 */
export const generatePersonaImage = async (prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        },
      },
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("画像データが見つかりませんでした。");
  } catch (error) {
    console.error("Image Generation Error:", error);
    // 失敗時は高品質なプレースホルダを返す
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(prompt)}`;
  }
};
