import { useEffect, useState } from 'react';

const GCLID_STORAGE_KEY = 'gclid';
const GCLID_TIMESTAMP_KEY = 'gclid_timestamp';
const GCLID_MAX_AGE_DAYS = 90;

export function useGoogleClickId() {
  const [gclid, setGclid] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlGclid = params.get('gclid');

    if (urlGclid) {
      localStorage.setItem(GCLID_STORAGE_KEY, urlGclid);
      localStorage.setItem(GCLID_TIMESTAMP_KEY, Date.now().toString());
      setGclid(urlGclid);
    } else {
      const savedGclid = localStorage.getItem(GCLID_STORAGE_KEY);
      const savedTimestamp = localStorage.getItem(GCLID_TIMESTAMP_KEY);
      
      if (savedGclid && savedTimestamp) {
        const timestamp = parseInt(savedTimestamp, 10);
        const ageMs = Date.now() - timestamp;
        const maxAgeMs = GCLID_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
        
        if (ageMs < maxAgeMs) {
          setGclid(savedGclid);
        } else {
          localStorage.removeItem(GCLID_STORAGE_KEY);
          localStorage.removeItem(GCLID_TIMESTAMP_KEY);
        }
      }
    }
  }, []);

  const clearGclid = () => {
    localStorage.removeItem(GCLID_STORAGE_KEY);
    localStorage.removeItem(GCLID_TIMESTAMP_KEY);
    setGclid(null);
  };

  return { gclid, clearGclid };
}

export default useGoogleClickId;
