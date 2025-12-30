import { ExtractionResult, Acordao } from '../types';

/**
 * Service to parse HTML content from https://jurisprudencia.csm.org.pt/
 */
export const parseCsmHtml = (html: string, url: string): ExtractionResult => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 1. ECLI (Começa por ECLI:)
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
    // Fix: Using textContent instead of innerText as innerText is not available on basic Element type
    const textoIntegral = doc.querySelector('.field-name-texto-integral .field-item, #texto-integral')?.textContent?.trim() || doc.body?.textContent || '';

    // 8. Adjuntos (Lógica específica: parte final do acórdão, após o relator)
    let adjuntos: string[] = [];
    const textLines = textoIntegral.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    
    // Procurar o nome do relator no fim do texto
    // Fix for findLastIndex: Using manual backwards loop for compatibility with older ES targets
    let relatorIndex = -1;
    for (let i = textLines.length - 1; i >= 0; i--) {
      if (textLines[i].toLowerCase().includes(relator.toLowerCase())) {
        relatorIndex = i;
        break;
      }
    }
    
    if (relatorIndex !== -1) {
      // Os adjuntos normalmente vêm nas linhas imediatamente a seguir ao relator, antes das notas
      const potentialAdjuntos = textLines.slice(relatorIndex + 1, relatorIndex + 5);
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