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
  try {
    // 1. Convert file to Base64 to send to backend Gemini parser
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip data url prefix if exists
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });

    // 2. Query the backend Gemini PDF parser
    const response = await fetch("/api/parse-rap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fileData: base64Data,
        fileName: file.name,
        fileType: file.type
      })
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        console.log("Successfully parsed RAP via Gemini API:", result);
        return {
          valorAdiantamento: result.valorAdiantamento,
          valorSaldo: result.valorSaldo,
          freteTotal: result.freteTotal,
          contratoNum: result.contratoNum,
          favorecidoPix: result.favorecidoPix,
          motorista: result.motorista,
          success: true
        };
      }
    }
  } catch (err) {
    console.warn("Backend RAP parsing failed, falling back to local text parsing:", err);
  }

  // Fallback to local parsing (runs in-browser for non-PDFs or if offline/demo)
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
        let valorAdiantamento: number | undefined;
        const matchAdiant = text.match(/PAGAMENTO DE ADIANTAMENTO\s*(?:R\$\s*)?([\d\.,]+)/i) ||
                          text.match(/Adiantamento\s*\(\-\)\s*([\d\.,]+)/i);
        if (matchAdiant && matchAdiant[1]) {
          const cleanVal = matchAdiant[1].replace(/\./g, '').replace(',', '.');
          const parsed = parseFloat(cleanVal);
          if (!isNaN(parsed) && parsed > 0) valorAdiantamento = parsed;
        }

        // 2. Parse Valor Saldo
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

        // 6. Filename fallback parsing
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
        console.error('Erro ao ler arquivo RAP localmente:', err);
        resolve({ success: false });
      }
    };

    reader.onerror = () => {
      resolve({ success: false });
    };

    reader.readAsArrayBuffer(file);
  });
}
