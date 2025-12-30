
import { GoogleGenAI } from "@google/genai";
import { Acordao, ChatMessage } from "../types";

// Always initialize GoogleGenAI with { apiKey: process.env.API_KEY } directly.
// The model 'gemini-3-pro-preview' is used for complex jurisprudence analysis.

export const analyzeJurisprudence = async (
  question: string,
  history: ChatMessage[],
  acordaos: Acordao[]
): Promise<string> => {
  // CRITICAL: Must use process.env.API_KEY directly in the named parameter.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Context preparation: Only send metadata and summaries if the text is too long
  // We limit the full text part to avoid token overflow while maintaining depth.
  const context = acordaos.map(a => `
DOCUMENTO:
ECLI: ${a.ecli}
Processo: ${a.processo}
Data: ${a.data}
Relator: ${a.relator}
Descritores: ${a.descritores.join(', ')}
URL: ${a.url}
SUMÁRIO: ${a.sumario}
TEXTO INTEGRAL: ${a.textoIntegral.substring(0, 15000)}
---
`).join('\n\n');

  const systemInstruction = `
Você é um assistente jurídico especializado em jurisprudência portuguesa.
Sua tarefa é analisar o conjunto de acórdãos fornecido no contexto e responder à pergunta do utilizador de forma estruturada.

REGRAS DE RESPOSTA:
1. Identifique as diferentes posições (teses) jurisprudenciais ou doutrinárias sobre o assunto.
2. Para cada posição encontrada:
   - Explique os argumentos utilizados.
   - Identifique os acórdãos que seguem essa posição (máximo de 12).
   - A identificação dos acórdãos DEVE ser feita no formato: "[Número do Processo] de [Data]" (Exemplo: 167/15.9T9GRD.C1.S1 de 27/01/2022).
   - Inclua o link (URL) do acórdão como um link Markdown.
3. Se houver divergência, explique o núcleo central da discórdia.
4. Utilize uma linguagem jurídica formal e precisa (Português de Portugal).
5. Se a informação não estiver nos documentos fornecidos, indique claramente.

ESTRUTURA DA RESPOSTA:
- Introdução breve sobre a discussão.
- Lista numerada de Posições (1. Posição X, 2. Posição Y...).
- Conclusão sobre a divergência.
`;

  try {
    // Construct valid message history with strictly alternating roles.
    const contents = [
      ...history.map(msg => ({ 
        role: (msg.role === 'user' ? 'user' : 'model') as 'user' | 'model', 
        parts: [{ text: msg.content }] 
      })),
      { 
        role: 'user' as const, 
        parts: [{ text: `CONTEXTO DE JURISPRUDÊNCIA:\n${context}\n\nPERGUNTA: ${question}` }] 
      }
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents,
      config: {
        systemInstruction,
        temperature: 0.1, // Precision and consistency are required for legal tasks.
      },
    });

    // Access the .text property directly as a string (not a method).
    return response.text || "Não foi possível gerar uma resposta.";
  } catch (error) {
    console.error("Gemini Error:", error);
    throw new Error("Erro na análise da IA: " + (error as Error).message);
  }
};
