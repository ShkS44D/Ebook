import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      const update = () => setReduced(media.matches);
      update(); media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduced(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return reduced;
}
