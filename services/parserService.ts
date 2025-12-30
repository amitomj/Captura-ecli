
import { ExtractionResult, Acordao } from '../types';

/**
 * Service to parse HTML content from https://jurisprudencia.csm.org.pt/
 */
export const parseCsmHtml = (html: string, url: string): ExtractionResult => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 1. ECLI (Tenta encontrar no texto ou extrair do URL se falhar)
    let ecli = 'Desconhecido';
    const ecliElement = doc.querySelector('.ecli-id, .field-name-ecli, .ecli');
    if (ecliElement && ecliElement.textContent) {
      ecli = ecliElement.textContent.trim();
    } else {
      const match = html.match(/ECLI:[A-Z0-9:]+/);
      if (match) ecli = match[0];
      else {
        const urlParts = url.split('/');
        const lastPart = urlParts.find(p => p.includes('ECLI')) || urlParts[urlParts.length - 1];
        if (lastPart) ecli = lastPart.replace(/_/g, ':').replace(/\/$/, '');
      }
    }

    // 2. Processo
    const processo = doc.querySelector('.field-name-processo .field-item, .process-number')?.textContent?.trim() || 
                    html.match(/Processo:\s*([^\s<]+)/)?.[1] || 'Desconhecido';
    
    // 3. Data
    const data = doc.querySelector('.field-name-data-do-acordao .field-item, .judgment-date')?.textContent?.trim() || 
                html.match(/Data do Acórdão:\s*([^\s<]+)/)?.[1] || 'Desconhecida';
    
    // 4. Relator
    const relator = doc.querySelector('.field-name-relator .field-item, .judge-name')?.textContent?.trim() || 
                   html.match(/Relator:\s*([^\n<]+)/)?.[1] || 'Desconhecido';
    
    // 5. Descritores
    const descritoresRaw = doc.querySelector('.field-name-descritores .field-items')?.textContent || '';
    const descritores = descritoresRaw.split(/[,;]/).map(d => d.trim()).filter(d => d.length > 2);

    // 6. Sumário
    const sumario = doc.querySelector('.field-name-sumario .field-item, #sumario')?.textContent?.trim() || '';
    
    // 7. Texto Integral
    const textoIntegral = doc.querySelector('.field-name-texto-integral .field-item, #texto-integral, .content')?.textContent?.trim() || doc.body.textContent?.trim() || '';

    // 8. Adjuntos (Lógica de busca no final do documento)
    let adjuntos: string[] = [];
    const lines = textoIntegral.split('\n').map(l => l.trim()).filter(l => l.length > 3);
    
    let relatorFoundIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].toLowerCase().includes(relator.toLowerCase())) {
        relatorFoundIndex = i;
        break;
      }
    }

    if (relatorFoundIndex !== -1) {
      const potentialAdjuntos = lines.slice(relatorFoundIndex + 1, relatorFoundIndex + 8);
      adjuntos = potentialAdjuntos
        .filter(l => l.length < 80 && l.length > 5 && !l.toLowerCase().includes('nota') && !l.toLowerCase().includes('voto'))
        .map(l => l.replace(/^[0-9.\s-]+/, '').trim());
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
  // AllOrigins é geralmente mais estável que o corsproxy.io para sites governamentais
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
  try {
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
    const data = await response.json();
    const html = data.contents;
    if (!html || html.length < 500) throw new Error("Conteúdo descarregado inválido ou demasiado curto.");
    return html;
  } catch (e) {
    console.error("Fetch error:", e);
    throw new Error('PROXY_FAILURE');
  }
};
