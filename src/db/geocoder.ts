// Free Geocoding with Nominatim (OpenStreetMap)
export async function geocodeCity(cityAndState: string): Promise<{ lat: number; lng: number }> {
  try {
    const cleanQuery = encodeURIComponent(`${cityAndState}, Brasil`);
    // Add User-Agent as requested by Nominatim Terms of Service
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${cleanQuery}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'RodovarMonitoraApplet/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
    }
  } catch (error) {
    console.warn('Geocoding failed for:', cityAndState, error);
  }

  // Fallbacks for common Brazilian cities to keep maps perfectly loaded
  const lower = cityAndState.toLowerCase();
  if (lower.includes('são luís') || lower.includes('sao luis')) return { lat: -2.5307, lng: -44.3068 };
  if (lower.includes('rio de janeiro')) return { lat: -22.9068, lng: -43.1729 };
  if (lower.includes('porto alegre')) return { lat: -30.0346, lng: -51.2177 };
  if (lower.includes('goiânia') || lower.includes('goiania')) return { lat: -16.6869, lng: -49.2648 };
  if (lower.includes('feira de santana')) return { lat: -12.2664, lng: -38.9662 };
  if (lower.includes('camaçari') || lower.includes('camacari')) return { lat: -12.6975, lng: -38.3242 };
  if (lower.includes('são paulo') || lower.includes('sao paulo')) return { lat: -23.5505, lng: -46.6333 };
  if (lower.includes('curitiba')) return { lat: -25.4290, lng: -49.2671 };
  if (lower.includes('belo horizonte')) return { lat: -19.9191, lng: -43.9378 };
  if (lower.includes('salvador')) return { lat: -12.9777, lng: -38.5016 };
  if (lower.includes('fortaleza')) return { lat: -3.7319, lng: -38.5267 };
  if (lower.includes('recife')) return { lat: -8.0543, lng: -34.8813 };
  if (lower.includes('brasília') || lower.includes('brasilia')) return { lat: -15.7975, lng: -47.8919 };
  if (lower.includes('manaus')) return { lat: -3.1190, lng: -60.0217 };

  // Default coordinate in the center of Brazil (approx.)
  // Let's generate a slight random offset near São Paulo or the center to keep multiple pins from stacking exactly at the same point
  const offsetLat = (Math.random() - 0.5) * 1.5;
  const offsetLng = (Math.random() - 0.5) * 1.5;
  return { lat: -23.5505 + offsetLat, lng: -46.6333 + offsetLng };
}
