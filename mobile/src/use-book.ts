import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { api } from './store';
export function useBook(id: string) {
  const [book, setBook] = useState<any>(null),
    [error, setError] = useState("");
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setError("");
      api("/books/" + encodeURIComponent(id))
        .then((b) => {
          if (active) setBook(b);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
      return () => {
        active = false;
      };
    }, [id]),
  );
  return { book, error };
}
