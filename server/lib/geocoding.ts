const GOOGLE_GEOCODING_KEY = process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

interface GeocodingResult {
  latitude: number;
  longitude: number;
}

export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  if (!GOOGLE_GEOCODING_KEY) {
    console.warn('[Geocoding] No geocoding API key set (GOOGLE_GEOCODING_API_KEY or GOOGLE_MAPS_API_KEY), skipping geocode');
    return null;
  }

  if (!address || address.trim().length < 3) {
    return null;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address.trim())}&key=${GOOGLE_GEOCODING_KEY}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[Geocoding] HTTP error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data.status === 'OK' && data.results?.length > 0) {
      const location = data.results[0].geometry.location;
      return {
        latitude: location.lat,
        longitude: location.lng,
      };
    }

    if (data.status !== 'ZERO_RESULTS') {
      console.error(`[Geocoding] API status: ${data.status} for address: "${address}"${data.error_message ? ` - ${data.error_message}` : ''}`);
    }
    return null;
  } catch (error) {
    console.error('[Geocoding] Error:', error);
    return null;
  }
}
