import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { api } from './store';
export function useBook(id: string, contents = true) {
  const [book, setBook] = useState<any>(null),
    [error, setError] = useState("");
  useFocusEffect(
    useCallback(() => {
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      setBook(null);
      setError("");
      const load = () => api("/books/" + encodeURIComponent(id) + (contents ? '' : '?metadata=1'))
        .then((b) => {
          if (active) { setBook(b); if (['queued','downloading','parsing','validating','review'].includes(b.import_status)) timer=setTimeout(load,8000); }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
      void load();
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [id,contents]),
  );
  return { book, error };
}
