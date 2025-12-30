
import { ExtractionResult, Acordao } from '../types';

/**
 * Service to parse HTML content from https://jurisprudencia.csm.org.pt/
 */
export const parseCsmHtml = (html: string, url: string): ExtractionResult => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 1. ECLI
    const ecli = doc.querySelector('.ecli-id, .field-name-ecli')?.textContent?.trim() || 
                Array.from(doc.querySelectorAll('h2, div, span')).find(el => el.textContent?.startsWith('ECLI:'))?.textContent?.trim() || 
                url.split('/').filter(Boolean).pop()?.replace(/_/g, ':') || 'Desconhecido';

    // 2. Processo
    const processo = doc.querySelector('.field-name-processo .field-item, .process-number')?.textContent?.trim() || 'Desconhecido';
    
    // 3. Data
    const data = doc.querySelector('.field-name-data-do-acordao .field-item, .judgment-date')?.textContent?.trim() || 'Desconhecida';
    
    // 4. Relator
    const relator = doc.querySelector('.field-name-relator .field-item, .judge-name')?.textContent?.trim() || 'Desconhecido';
    
    // 5. Descritores
    const descritoresRaw = doc.querySelector('.field-name-descritores .field-items')?.textContent || '';
    const descritores = descritoresRaw.split(/[,;]/).map(d => d.trim()).filter(Boolean);

    // 6. Sumário
    const sumario = doc.querySelector('.field-name-sumario .field-item, #sumario')?.innerHTML?.trim() || '';
    
    // 7. Texto Integral
    const textoIntegral = doc.querySelector('.field-name-texto-integral .field-item, #texto-integral')?.textContent?.trim() || doc.body?.textContent?.trim() || '';

    // 8. EXTRAÇÃO DA FUNDAMENTAÇÃO DE DIREITO
    // Procuramos marcadores comuns onde termina o relatório/factos e começa a análise jurídica
    const keywordsDireito = [
      /\n\s*(?:II[.\s]+)?(?:Fundamentação|FUNDAMENTAÇÃO)\s+(?:de\s+)?(?:Direito|DIREITO)\s*\n/i,
      /\n\s*(?:III[.\s]+)?(?:Apreciação|APRECIAÇÃO)\s*\n/i,
      /\n\s*(?:O\s+Direito|O\s+DIREITO)\s*\n/i,
      /\n\s*(?:Questões\s+a\s+decidir|QUESTÕES\s+A\s+DECIDIR)\s*\n/i,
      /\n\s*(?:Cumpre\s+apreciar|CUMPRE\s+APRECIAR)\s*\n/i,
      /\n\s*(?:Fundamentação\s+Jurídica|FUNDAMENTAÇÃO\s+JURÍDICA)\s*\n/i,
      /\n\s*(?:Enquadramento\s+jurídico|ENQUADRAMENTO\s+JURÍDICO)\s*\n/i
    ];

    let fundamentacao = "";
    let startIndex = -1;

    for (const regex of keywordsDireito) {
      const match = textoIntegral.match(regex);
      if (match && match.index !== undefined) {
        startIndex = match.index;
        break;
      }
    }

    if (startIndex !== -1) {
      fundamentacao = textoIntegral.substring(startIndex).trim();
      
      // Tentar remover a "Decisão/Dispositivo" final para não estourar tokens com formalidades
      const decisaoKeywords = [
        /\n\s*(?:IV[.\s]+)?(?:Decisão|DECISÃO)\s*\n/i, 
        /\n\s*(?:Dispositivo|DISPOSITIVO)\s*\n/i,
        /\n\s*(?:Pelo\s+exposto|PELO\s+EXPOSTO)\s*[,.]/i
      ];
      
      for (const dRegex of decisaoKeywords) {
        const dMatch = fundamentacao.match(dRegex);
        // Garantimos que não cortamos logo no início se a keyword aparecer por acaso
        if (dMatch && dMatch.index !== undefined && dMatch.index > 800) {
          fundamentacao = fundamentacao.substring(0, dMatch.index).trim();
          break;
        }
      }
    } else {
      // Fallback: Se não encontrar marcadores, salta os primeiros 6000 caracteres 
      // (estimativa conservadora de onde acaba o relatório e factos em acórdãos médios)
      fundamentacao = textoIntegral.length > 6000 ? textoIntegral.substring(6000) : textoIntegral;
    }

    // 9. Adjuntos
    let adjuntos: string[] = [];
    const textLines = textoIntegral.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    let relatorIndex = -1;
    for (let i = textLines.length - 1; i >= 0; i--) {
      if (textLines[i].toLowerCase().includes(relator.toLowerCase())) {
        relatorIndex = i;
        break;
      }
    }
    if (relatorIndex !== -1) {
      const potentialAdjuntos = textLines.slice(relatorIndex + 1, relatorIndex + 6);
      adjuntos = potentialAdjuntos
        .filter(line => !line.toLowerCase().includes('nota') && line.length < 100)
        .map(line => line.replace(/^[0-9.\s-]+/, '').trim());
    }

    const dataObj: Partial<Acordao> = {
      ecli,
      processo,
      data,
      relator,
      descritores,
      sumario,
      textoIntegral,
      fundamentacao, // Novo campo preenchido
      adjuntos,
      url,
      id: ecli
    };

    return { success: true, data: dataObj };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};

export const fetchAcordaoHtml = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Falha ao aceder ao site do CSM');
    return await response.text();
  } catch (e) {
    throw new Error('CORS Error');
  }
};
