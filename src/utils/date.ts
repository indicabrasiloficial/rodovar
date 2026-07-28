/**
 * Helper to convert ISO dates (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...) to Brazilian Format (DD/MM/YYYY)
 */
export const formatDateBR = (isoDateStr: string | null | undefined): string => {
  if (!isoDateStr) return '-';
  
  // If already in DD/MM/YYYY format, return it
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(isoDateStr)) {
    return isoDateStr;
  }
  
  // Strip time part if present
  let datePart = isoDateStr;
  if (isoDateStr.includes('T')) {
    datePart = isoDateStr.split('T')[0];
  }
  
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  
  return isoDateStr;
};

/**
 * Helper to format full date and time in Brazilian format (DD/MM/YYYY HH:mm)
 */
export const formatDateTimeBR = (isoDateStr: string | null | undefined): string => {
  if (!isoDateStr) return '-';
  try {
    const d = new Date(isoDateStr);
    if (isNaN(d.getTime())) {
      return formatDateBR(isoDateStr);
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} às ${hours}:${minutes}`;
  } catch {
    return formatDateBR(isoDateStr);
  }
};

/**
 * Extracts and formats the time (HH:MM) from an ISO timestamp
 */
export const formatRegistrationTime = (createdAtStr: string | null | undefined): string => {
  if (!createdAtStr) return '';
  try {
    const d = new Date(createdAtStr);
    if (isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch (err) {
    return '';
  }
};
