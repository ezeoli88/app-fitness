import { useEffect, useState } from 'react';

const WIDE_QUERY = '(min-width: 1024px)';

export function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return wide;
}
