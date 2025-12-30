
import { ExtractionResult, Acordao } from '../types';

export const parseCsmHtml = (html: string, url: string): ExtractionResult => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 1. ECLI
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
        if (lastPart) ecli = lastPart.replace(/_/g, ':').replace(/\/$/, '').replace(/%3A/g, ':');
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

    // 8. Adjuntos
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
      const potentialAdjuntos = lines.slice(relatorFoundIndex + 1, relatorFoundIndex + 10);
      adjuntos = potentialAdjuntos
        .filter(l => l.length < 80 && l.length > 5 && 
                    !l.toLowerCase().includes('nota') && 
                    !l.toLowerCase().includes('voto') &&
                    !l.toLowerCase().includes('página'))
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

const PROXIES = [
  (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
  (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  (u: string) => `https://thingproxy.freeboard.io/fetch/${u}`
];

export const fetchAcordaoHtml = async (url: string): Promise<string> => {
  let lastError: any;

  for (const proxyGen of PROXIES) {
    try {
      const proxyUrl = proxyGen(url);
      const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) continue;

      let html = '';
      if (proxyUrl.includes('allorigins')) {
        const data = await response.json();
        html = data.contents;
      } else {
        html = await response.text();
      }

      if (html && html.length > 500) return html;
    } catch (e) {
      lastError = e;
      continue;
    }
  }
  throw lastError || new Error("Todos os proxies falharam.");
};
