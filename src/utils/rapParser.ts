// Helper to parse RAP PDF/Text files for Rodovar Pagamentos

export interface ParsedRapData {
  valorAdiantamento?: number;
  valorSaldo?: number;
  freteTotal?: number;
  contratoNum?: string;
  favorecidoPix?: string;
  motorista?: string;
  dataEmissao?: string;
  success: boolean;
}

export async function parseRapFile(file: File): Promise<ParsedRapData> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        let text = '';

        if (typeof result === 'string') {
          text = result;
        } else if (result instanceof ArrayBuffer) {
          const decoder = new TextDecoder('latin1');
          text = decoder.decode(result);
        }

        console.log('RAP File raw text sample:', text.slice(0, 500));

        // 1. Parse Valor Adiantamento
        // Matches: "PAGAMENTO DE ADIANTAMENTO R$ 2.800,00" or "Adiantamento (-) 2.800,00"
        let valorAdiantamento: number | undefined;
        const matchAdiant = text.match(/PAGAMENTO DE ADIANTAMENTO\s*(?:R\$\s*)?([\d\.,]+)/i) ||
                          text.match(/Adiantamento\s*\(\-\)\s*([\d\.,]+)/i);
        if (matchAdiant && matchAdiant[1]) {
          const cleanVal = matchAdiant[1].replace(/\./g, '').replace(',', '.');
          const parsed = parseFloat(cleanVal);
          if (!isNaN(parsed) && parsed > 0) valorAdiantamento = parsed;
        }

        // 2. Parse Valor Saldo
        // Matches: "PAGAMENTO DE SALDO R$ 1.200,00" or "Saldo à receber (=) 1.200,00"
        let valorSaldo: number | undefined;
        const matchSaldo = text.match(/PAGAMENTO DE SALDO\s*(?:R\$\s*)?([\d\.,]+)/i) ||
                        text.match(/Saldo\s*(?:[àa]\s*receber)?\s*\(\=\)\s*([\d\.,]+)/i);
        if (matchSaldo && matchSaldo[1]) {
          const cleanVal = matchSaldo[1].replace(/\./g, '').replace(',', '.');
          const parsed = parseFloat(cleanVal);
          if (!isNaN(parsed) && parsed > 0) valorSaldo = parsed;
        }

        // 3. Parse Frete Total Contrato
        let freteTotal: number | undefined;
        const matchFrete = text.match(/Frete Contrato\s*\(\+\)\s*([\d\.,]+)/i);
        if (matchFrete && matchFrete[1]) {
          const cleanVal = matchFrete[1].replace(/\./g, '').replace(',', '.');
          const parsed = parseFloat(cleanVal);
          if (!isNaN(parsed) && parsed > 0) freteTotal = parsed;
        }

        // 4. Parse Contrato / CTRC #
        let contratoNum: string | undefined;
        const matchContrato = text.match(/CONTRATO\s*N[º°]?:\s*(\d+)/i) ||
                              text.match(/N[º°]:\s*(\d+)/i) ||
                              text.match(/CT\(s\):\s*(\d+)/i);
        if (matchContrato && matchContrato[1]) {
          contratoNum = matchContrato[1];
        }

        // 5. Parse Favorecido PIX
        let favorecidoPix: string | undefined;
        const matchFav = text.match(/Favorecido\s+([^,\n\r]+)/i);
        if (matchFav && matchFav[1]) {
          favorecidoPix = matchFav[1].trim();
        }

        // 6. Filename fallback parsing (e.g. "RAP-135 - G2 CONSTRUCOES...")
        if (!contratoNum && file.name) {
          const fileMatch = file.name.match(/(?:RAP|RPA|CTRC)[-_\s]*(\d+)/i);
          if (fileMatch && fileMatch[1]) {
            contratoNum = fileMatch[1];
          }
        }

        resolve({
          valorAdiantamento,
          valorSaldo,
          freteTotal,
          contratoNum,
          favorecidoPix,
          success: true
        });
      } catch (err) {
        console.error('Erro ao ler arquivo RAP:', err);
        resolve({ success: false });
      }
    };

    reader.onerror = () => {
      resolve({ success: false });
    };

    // Read as ArrayBuffer for universal binary/text decoding
    reader.readAsArrayBuffer(file);
  });
}
