
import { GoogleGenAI } from "@google/genai";
import { Acordao, ChatMessage } from "../types";

/**
 * LIMITE DE CARACTERES PARA O DIREITO:
 * 20.000 caracteres de fundamentação jurídica pura.
 * Como agora ignoramos relatório e factos, estes 20k são muito densos em Direito.
 */
const CHAR_LIMIT_FUNDAMENTACAO = 20000;

export const analyzeJurisprudence = async (
  question: string,
  history: ChatMessage[],
  acordaos: Acordao[]
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Preparação do contexto focada no conteúdo jurídico útil
  const context = acordaos.map(a => `
### DOCUMENTO: PROCESSO ${a.processo} (${a.data})
- ECLI: ${a.ecli}
- RELATOR: ${a.relator}
- DESCRITORES: ${a.descritores.join(', ')}
- SUMÁRIO EXECUTIVO: ${a.sumario}
- FUNDAMENTAÇÃO DE DIREITO (EXCERTO RELEVANTE): 
${(a.fundamentacao || a.textoIntegral).substring(0, CHAR_LIMIT_FUNDAMENTACAO)}
---
`).join('\n\n');

  const systemInstruction = `
Você é o "JurisAnalyzer", um especialista em Direito Português de nível Superior.
Sua tarefa é analisar divergências e convergências jurisprudenciais com base na fundamentação de direito fornecida.

REGRAS DE OURO:
1. FOCO NA TESE JURÍDICA: Ignore a narrativa factual (factos provados) e o relatório histórico. Concentre-se em COMO o tribunal aplicou a lei aos conceitos.
2. ANÁLISE COMPARATIVA: Se houver múltiplos acórdãos, identifique onde as interpretações da norma coincidem ou colidem.
3. PRECISÃO JURÍDICA: Use terminologia jurídica portuguesa (ex: "norma injuntiva", "interpretação teleológica", "ratio decidendi").
4. CITAÇÃO DIRETA: Referencie sempre o Processo e Data: "[Processo] de [Data]".
5. LINKS: No final da análise de cada acórdão, insira o link original se disponível.

ESTRUTURA DA RESPOSTA:
- Síntese do Conflito/Questão.
- Análise Individualizada (Foco na fundamentação jurídica).
- Síntese de Divergência/Convergência.
- Parecer Técnico sobre a tendência.
`;

  try {
    const contents = [
      ...history.map(msg => ({ 
        role: (msg.role === 'user' ? 'user' : 'model') as 'user' | 'model', 
        parts: [{ text: msg.content }] 
      })),
      { 
        role: 'user' as const, 
        parts: [{ text: `BASE DE DADOS JURÍDICA:\n${context}\n\nSOLICITAÇÃO DO ADVOGADO: ${question}` }] 
      }
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents,
      config: {
        systemInstruction,
        temperature: 0.2, // Mantemos baixo para evitar invenções (hallucinations)
      },
    });

    return response.text || "Não foi possível gerar a análise. Verifique se os acórdãos possuem texto integral processado.";
  } catch (error) {
    console.error("Gemini Error:", error);
    throw new Error("Erro na comunicação com a IA. O volume de fundamentação jurídica pode ser excessivo para o modelo atual.");
  }
};
