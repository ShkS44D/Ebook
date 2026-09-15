import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { art } from "./assets";
import type { ReaderSettings } from "./reader-model";
export type CatalogBook = {
  cover_url?: string;
  provider?: string;
  import_status?: string;
  id: string;
  title: string;
  author: string;
  category: string;
  description: string;
  available: boolean;
  pages: number;
  rating: number;
  reviews: number;
  image: any;
};
type User = {
  book_admin?: boolean;
  reel_moderator?: boolean;
  id: string;
  email: string;
  name: string;
  bio: string;
  phone: string;
  goal: number;
  dark: boolean;
  notifications: boolean;
  reader_settings: Partial<ReaderSettings> & { fontSize: number; theme: string };
};
export type CollectionData = { id: string; name: string; book_ids: string[] };
type State = {
  user: User | null;
  library: any[];
  collections: CollectionData[];
  days: any[];
  friends: any[];
  notifications: any[];
};
const empty: State = {
  user: null,
  library: [],
  collections: [],
  days: [],
  friends: [],
  notifications: [],
};
let nativeToken: string | null = null;
export const apiBase =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : "http://localhost:3001");
export async function api(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<any> {
  const controller = new AbortController();
  const multipart = body instanceof FormData;
  const timeout = setTimeout(
    () => controller.abort(),
    multipart ? 120000 : 20000,
  );
  try {
    const response = await fetch(`${apiBase}/api${path}`, {
      method,
      credentials: Platform.OS === "web" ? "include" : "omit",
      signal: controller.signal,
      headers: {
        ...(!multipart ? { "Content-Type": "application/json" } : {}),
        ...(Platform.OS !== "web"
          ? {
              "X-iBook-Client": "native",
              ...(nativeToken
                ? { Authorization: `Bearer ${nativeToken}` }
                : {}),
            }
          : {}),
      },
      ...(body !== undefined
        ? { body: multipart ? (body as FormData) : JSON.stringify(body) }
        : {}),
    });
    const data = await response.json();
    if (!response.ok) {
      const error: any = new Error(data.error || "Request failed.");
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error: any) {
    if (error.name === "AbortError")
      throw new Error("The request timed out. Please try again.");
    if (error instanceof TypeError)
      throw new Error(
        "Cannot reach iBook. Check your connection and that the API is running.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
const Context = createContext<any>(null);
export function catalogBook(b: any): CatalogBook {
  return {...b,rating:Number(b.rating || 0),reviews:Number(b.reviews || 0),image:b.cover_url?{uri:b.cover_url}:art[b.id as keyof typeof art]};
}
export function StoreProvider({ children }: any) {
  const [state, setState] = useState<State>(empty),
    [books, setBooks] = useState<CatalogBook[]>([]),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0);
  const refreshSequence = useRef(0);
  async function loadBooks() {
    const result = await api("/books");
    setBooks(
      result.map(catalogBook),
    );
  }
  async function refresh() {
    const current = generation.current;
    const sequence = ++refreshSequence.current;
    try {
      const next = await api("/me");
      if (
        current === generation.current &&
        sequence === refreshSequence.current
      )
        setState(next);
    } catch (error: any) {
      if (error.status === 401 && current === generation.current) {
        generation.current++;
        nativeToken = null;
        setState(empty);
        if (Platform.OS !== "web")
          await SecureStore.deleteItemAsync("ibook-session");
      }
      throw error;
    }
  }
  async function boot() {
    setError("");
    try {
      if (Platform.OS !== "web")
        nativeToken = await SecureStore.getItemAsync("ibook-session");
      await loadBooks();
      try {
        await refresh();
      } catch (e: any) {
        if (e.status !== 401) throw e;
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    void boot();
  }, []);
  async function login(signup: boolean, data: any) {
    const result = await api(
      `/auth/${signup ? "signup" : "login"}`,
      "POST",
      data,
    );
    if (Platform.OS !== "web") {
      nativeToken = result.token;
      await SecureStore.setItemAsync("ibook-session", result.token);
    }
    generation.current++;
    await refresh();
  }
  async function logout() {
    try {
      await api("/logout", "POST", {});
    } catch (error: any) {
      if (error.status !== 401) throw error;
    }
    generation.current++;
    if (Platform.OS !== "web")
      await SecureStore.deleteItemAsync("ibook-session");
    nativeToken = null;
    setState(empty);
  }
  async function mutate(path: string, method = "POST", body: any = {}) {
    let result;
    try {
      result = await api(path, method, body);
    } catch (error: any) {
      if (error.status === 401) {
        generation.current++;
        nativeToken = null;
        setState(empty);
        if (Platform.OS !== "web")
          await SecureStore.deleteItemAsync("ibook-session");
      }
      throw error;
    }
    await refresh();
    return result;
  }
  return (
    <Context.Provider
      value={{
        ...state,
        books,
        ready,
        error,
        refresh,
        loadBooks,
        login,
        logout,
        mutate,
        retry: boot,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStore(): State & {
  books: CatalogBook[];
  ready: boolean;
  error: string;
  refresh: () => Promise<void>;
  loadBooks: () => Promise<void>;
  login: (signup: boolean, data: any) => Promise<void>;
  logout: () => Promise<void>;
  mutate: (path: string, method?: string, body?: any) => Promise<any>;
  retry: () => Promise<void>;
} {
  return useContext(Context);
}
