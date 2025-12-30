
import { ExtractionResult, Acordao } from '../types';

/**
 * Service to parse HTML content from https://jurisprudencia.csm.org.pt/
 * Extraction is rule-based as requested.
 */
export const parseCsmHtml = (html: string, url: string): ExtractionResult => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Rule-based extraction based on typical CSM structure.
    // Fix: Standard DOM querySelector does not support :contains. Replaced with Array.find.
    const ecli = doc.querySelector('.ecli-id, .field-name-ecli')?.textContent?.trim() || 
                Array.from(doc.querySelectorAll('h2')).find(h => h.textContent?.includes('ECLI:'))?.textContent?.replace('ECLI:', '').trim() || 
                url.split('/').filter(Boolean).pop() || 'Desconhecido';

    const processo = doc.querySelector('.field-name-processo .field-item, .process-number')?.textContent?.trim() || 'Desconhecido';
    const data = doc.querySelector('.field-name-data-do-acordao .field-item, .judgment-date')?.textContent?.trim() || 'Desconhecida';
    const relator = doc.querySelector('.field-name-relator .field-item, .judge-name')?.textContent?.trim() || 'Desconhecido';
    
    const descritoresRaw = doc.querySelector('.field-name-descritores .field-items')?.textContent || '';
    const descritores = descritoresRaw.split(/[,;]/).map(d => d.trim()).filter(Boolean);

    const sumario = doc.querySelector('.field-name-sumario .field-item, #sumario')?.innerHTML?.trim() || '';
    const textoIntegral = doc.querySelector('.field-name-texto-integral .field-item, #texto-integral')?.innerHTML?.trim() || 
                        doc.body.innerText; // Fallback to full text if specific div not found

    // Extracting adjuncts (Adjuntos)
    // Often found at the end of the text, look for common markers
    const bodyText = doc.body.innerText;
    let adjuntos: string[] = [];
    const adjuntosRegex = /(?:Adjuntos:|Votantes:)\s*([^\n.]+)/i;
    const match = bodyText.match(adjuntosRegex);
    if (match && match[1]) {
      adjuntos = match[1].split(/[,;e]/).map(a => a.trim()).filter(Boolean);
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

/**
 * Helper to fetch content (simulated if CORS is blocked)
 * In a real environment, this might need a proxy or the user to provide the HTML source
 */
export const fetchAcordaoHtml = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Falha ao aceder ao site do CSM');
    return await response.text();
  } catch (e) {
    // If CORS fails, we can't do much from pure client side without a proxy.
    // We inform the user to manually paste the HTML or use a browser extension.
    throw new Error('CORS Error: O navegador bloqueou o acesso direto ao CSM. Pode ser necessário um proxy ou colar o HTML manualmente.');
  }
};
