/**
 * Helper utility for phone number formatting, JID conversion,
 * template substitution, and CSV/text parsing.
 */

function cleanPhone(raw) {
  if (!raw) return '';
  let str = String(raw).trim();
  // Strip JID suffix if present
  if (str.includes('@')) {
    str = str.split('@')[0];
  }
  let cleaned = str.replace(/[^0-9]/g, '');
  
  // If 11 digits starting with 0 (e.g. 09876543210), strip the leading 0
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  // If standard 10-digit Indian mobile number (starts with 6, 7, 8, 9), auto-prepend country code 91
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    cleaned = '91' + cleaned;
  }
  
  return cleaned;
}

function phoneToJid(phone) {
  if (!phone) return null;
  const str = String(phone).trim();
  // Preserve existing full JID (e.g. user@lid or user@s.whatsapp.net)
  if (str.includes('@')) {
    return str;
  }
  
  const cleaned = cleanPhone(str);
  if (!cleaned) return null;

  // LIDs (WhatsApp internal device identifiers, 14+ digits not starting with standard 91)
  if (cleaned.length >= 14 && !cleaned.startsWith('91')) {
    return `${cleaned}@lid`;
  }

  return `${cleaned}@s.whatsapp.net`;
}

function jidToPhone(jid) {
  if (!jid) return '';
  return jid.split('@')[0].split(':')[0]; // strip device suffix if any
}

function formatPairingCode(code) {
  if (!code) return '';
  const str = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (str.length === 8) {
    return `${str.slice(0, 4)}-${str.slice(4)}`;
  }
  return str;
}

/**
 * Extract all {placeholder} names from a template string
 * e.g. "Hi {name}, order {order_id}" => ["name", "order_id"]
 */
function extractPlaceholders(text) {
  if (!text) return [];
  const matches = text.match(/\{([a-zA-Z0-9_]+)\}/g) || [];
  const unique = [...new Set(matches.map(m => m.slice(1, -1).trim()))];
  return unique;
}

/**
 * Replaces all {key} in template with values from data object
 */
function renderTemplate(template, data) {
  if (!template) return '';
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    // Case-insensitive lookup or exact lookup
    if (data[key] !== undefined && data[key] !== null) {
      return String(data[key]);
    }
    const lowerKey = key.toLowerCase();
    for (const [k, v] of Object.entries(data)) {
      if (k.toLowerCase() === lowerKey && v !== undefined && v !== null) {
        return String(v);
      }
    }
    return match; // Keep unchanged if key not found
  });
}

/**
 * Parses user input data which could be:
 * 1. CSV format (comma separated)
 * 2. Pipe separated (e.g. phone | name | order_id)
 * 3. Tab separated (copied from Excel / Google Sheets)
 * 
 * Returns { headers: string[], rows: object[], rawCount: number, validCount: number }
 */
function parseDelimitedData(text) {
  if (!text || typeof text !== 'string') {
    return { headers: [], rows: [], total: 0, valid: 0 };
  }

  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [], total: 0, valid: 0 };
  }

  // Detect delimiter from first line
  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.includes('\t')) {
    delimiter = '\t';
  } else if (firstLine.includes('|')) {
    delimiter = '|';
  } else if (firstLine.includes(';') && !firstLine.includes(',')) {
    delimiter = ';';
  }

  // Parse a single line with respect to quotes if comma
  const splitLine = (line) => {
    if (delimiter === ',') {
      // Basic CSV token parser
      const tokens = [];
      let current = '';
      let insideQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          insideQuotes = !insideQuotes;
        } else if (char === ',' && !insideQuotes) {
          tokens.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      tokens.push(current.trim());
      return tokens;
    }
    return line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
  };

  const rawHeaders = splitLine(lines[0]);
  const headers = rawHeaders.map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));

  // Find phone column
  const phoneIndex = headers.findIndex(h =>
    h === 'phone' || h === 'number' || h === 'mobile' || h === 'whatsapp' || h === 'contact'
  );

  const rows = [];
  const dataLines = lines.slice(1);

  for (let i = 0; i < dataLines.length; i++) {
    const cols = splitLine(dataLines[i]);
    if (cols.length === 0 || cols.every(c => c === '')) continue;

    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = cols[idx] !== undefined ? cols[idx] : '';
    });

    // Determine phone number
    let phone = '';
    if (phoneIndex >= 0 && cols[phoneIndex]) {
      phone = cleanPhone(cols[phoneIndex]);
    } else {
      // Look for the first column that looks like a phone number (>= 10 digits)
      const candidate = cols.find(c => cleanPhone(c).length >= 10);
      if (candidate) phone = cleanPhone(candidate);
    }

    rowObj._phone = phone;
    rowObj._valid = Boolean(phone && phone.length >= 10);
    rows.push(rowObj);
  }

  return {
    headers,
    rows,
    total: rows.length,
    valid: rows.filter(r => r._valid).length
  };
}

module.exports = {
  cleanPhone,
  phoneToJid,
  jidToPhone,
  formatPairingCode,
  extractPlaceholders,
  renderTemplate,
  parseDelimitedData
};

