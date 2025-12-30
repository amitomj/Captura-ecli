
import { ExtractionResult, Acordao } from '../types';

/**
 * Service to parse content from https://jurisprudencia.csm.org.pt/
 * Supports both HTML and Plain Text (pasted via Ctrl+A / Ctrl+V)
 */
export const parseCsmHtml = (content: string, url: string): ExtractionResult => {
  try {
    // 1. Verificar se parece HTML. Se não, tratamos como texto simples.
    const isHtml = content.includes('<div') || content.includes('<span') || content.includes('<p');
    
    let ecli = 'Desconhecido';
    let processo = 'Desconhecido';
    let data = 'Desconhecida';
    let relator = 'Desconhecido';
    let descritores: string[] = [];
    let sumario = '';
    let textoIntegral = '';
    let adjuntos: string[] = [];

    if (isHtml) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');

      ecli = doc.querySelector('.ecli-id, .field-name-ecli')?.textContent?.trim() || 
             Array.from(doc.querySelectorAll('h2, div, span')).find(el => el.textContent?.startsWith('ECLI:'))?.textContent?.trim() || 'Desconhecido';

      processo = doc.querySelector('.field-name-processo .field-item, .process-number')?.textContent?.trim() || 'Desconhecido';
      data = doc.querySelector('.field-name-data-do-acordao .field-item, .judgment-date')?.textContent?.trim() || 'Desconhecida';
      relator = doc.querySelector('.field-name-relator .field-item, .judge-name')?.textContent?.trim() || 'Desconhecido';
      
      const descRaw = doc.querySelector('.field-name-descritores .field-items')?.textContent || '';
      descritores = descRaw.split(/[,;]/).map(d => d.trim()).filter(Boolean);

      sumario = doc.querySelector('.field-name-sumario .field-item, #sumario')?.textContent?.trim() || '';
      textoIntegral = doc.querySelector('.field-name-texto-integral .field-item, #texto-integral')?.textContent?.trim() || doc.body?.textContent?.trim() || '';
    } else {
      // 2. EXTRAÇÃO POR TEXTO SIMPLES (Fallback robusto para Ctrl+V)
      // Normalizar quebras de linha
      const text = content.replace(/\r\n/g, '\n');

      // Helper para extrair via Regex
      const extract = (pattern: RegExp) => {
        const match = text.match(pattern);
        return match ? match[1].trim() : null;
      };

      ecli = extract(/ECLI:\s*(ECLI:PT:[A-Z]+:[0-9]+:[^ \n]+)/i) || 
             extract(/(ECLI:PT:[A-Z]+:[0-9]+:[^ \n]+)/i) || 'Desconhecido';

      processo = extract(/(?:Processo:|N\.[ºº] do Processo:)\s*([^\n]+)/i) || 'Desconhecido';
      data = extract(/(?:Data do Acórdão:|Data:)\s*([^\n]+)/i) || 'Desconhecida';
      relator = extract(/Relator:\s*([^\n]+)/i) || 'Desconhecido';
      
      const descRaw = extract(/Descritores:\s*([^\n]+)/i) || '';
      descritores = descRaw.split(/[,;]/).map(d => d.trim()).filter(Boolean);

      // Extração de blocos maiores (Sumário e Texto Integral)
      const sumarioMatch = text.match(/Sumário:\s*([\s\S]*?)(?=Texto Integral:|Decisão Texto Integral:|$)/i);
      sumario = sumarioMatch ? sumarioMatch[1].trim() : '';

      const textoMatch = text.match(/(?:Texto Integral:|Decisão Texto Integral:)\s*([\s\S]*)/i);
      textoIntegral = textoMatch ? textoMatch[1].trim() : text;
    }

    // Tentar extrair adjuntos do final do texto
    if (relator !== 'Desconhecido') {
      const lines = (textoIntegral || content).split('\n').map(l => l.trim()).filter(l => l.length > 2);
      let rIndex = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].toLowerCase().includes(relator.toLowerCase())) {
          rIndex = i;
          break;
        }
      }
      if (rIndex !== -1) {
        adjuntos = lines.slice(rIndex + 1, rIndex + 6)
          .filter(l => l.length < 100 && !l.toLowerCase().includes('nota'))
          .map(l => l.replace(/^[0-9.\s-]+/, '').trim());
      }
    }

    // Se o ECLI ainda for desconhecido, tentamos tirar da URL
    if (ecli === 'Desconhecido' && url) {
      const urlParts = url.split('/');
      const last = urlParts[urlParts.length - 1];
      if (last.startsWith('ECLI')) ecli = last.replace(/_/g, ':');
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
      id: ecli !== 'Desconhecido' ? ecli : `proc_${processo}_${Date.now()}`
    };

    return { success: true, data: dataObj };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};

export const fetchAcordaoHtml = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Falha ao aceder ao site');
    return await response.text();
  } catch (e) {
    throw new Error('CORS Error');
  }
};
