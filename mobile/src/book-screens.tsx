import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Image,
  Platform,
  Share as NativeShare,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { api, useStore } from "./store";
import { PageReels } from "./reels";
import { Empty, Feedback, RequireAccount, useAction } from "./functional-ui";
import {
  BookCover,
  Button,
  Card,
  Field,
  Header,
  IconButton,
  Page,
  Row,
  Section,
  Title,
  Txt,
} from "./ui";
function useBook(id: string) {
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
export function BookScreen({ navigation, route }: any) {
  const store = useStore(),
    action = useAction();
  const id = route.params?.bookId || "reading-guide";
  const { book, error } = useBook(id);
  const cover = store.books.find((b) => b.id === id);
  const saved = store.library.some((l) => l.book_id === id);
  if (!book)
    return (
      <Page>
        <Header navigation={navigation} />
        <Feedback error={error} busy={!error} />
      </Page>
    );
  return (
    <Page>
      <Header
        navigation={navigation}
        right={
          <IconButton
            name="ellipsis-horizontal"
            label="Book options"
            onPress={() => navigation.navigate("BookActions", { bookId: id })}
          />
        }
      />
      {cover && (
        <View style={{ alignSelf: "center", marginBottom: 24 }}>
          <BookCover book={cover} large />
        </View>
      )}
      <Title>{book.title}</Title>
      <Row
        title={"By " + book.author}
        onPress={() => navigation.navigate("Author", { name: book.author })}
      />
      <Txt style={{ marginVertical: 18 }}>{book.category}</Txt>
      <Txt style={{ lineHeight: 25, marginBottom: 24 }}>{book.description}</Txt>
      {book.available ? (
        <Button
          title="Start Reading"
          onPress={() => navigation.navigate("Reader", { bookId: id })}
        />
      ) : (
        <Card>
          <Txt bold>Full text unavailable</Txt>
          <Txt style={{ marginTop: 8 }}>
            You can save this title and write a review. Reading and purchases
            will become available when licensed content is added.
          </Txt>
        </Card>
      )}
      <Feedback {...action} />
      <Button
        title={saved ? "Saved to library" : "Save to library"}
        secondary
        disabled={saved || action.busy}
        onPress={() =>
          store.user
            ? action.run(() => store.mutate("/library/" + id, "PUT", {}))
            : navigation.navigate("SignIn")
        }
      />
      <Button
        title="Save to collection"
        secondary
        style={{ marginTop: 12 }}
        onPress={() => navigation.navigate("SaveCollection", { bookId: id })}
      />
      <Section title={`Reviews (${book.reviews.length})`}>
        <Button
          title="Write a Review"
          secondary
          onPress={() => navigation.navigate("WriteReview", { bookId: id })}
        />
        {!book.reviews.length && (
          <Empty text="No reviews yet. Share your thoughts." />
        )}
        {book.reviews.map((r: any) => (
          <Card key={r.user_id} style={{ marginTop: 16 }}>
            <Txt bold>
              {r.name} · {r.rating}/5
            </Txt>
            <Txt style={{ marginTop: 8 }}>{r.body}</Txt>
            <Txt size={11} style={{ marginTop: 10 }}>
              {new Date(r.updated_at).toLocaleDateString()}
            </Txt>
          </Card>
        ))}
      </Section>
    </Page>
  );
}
export function Reader({ navigation, route }: any) {
  const store = useStore(),
    action = useAction();
  const id = route.params?.bookId || "reading-guide";
  const { book, error } = useBook(id);
  const entry = store.library.find((l) => l.book_id === id);
  const linkedPage = Number(route.params?.page);
  const [page, setPage] = useState(
      Number.isInteger(linkedPage) && linkedPage >= 0
        ? linkedPage
        : entry?.page || 0,
    ),
    [settings, setSettings] = useState(false),
    [fontSize, setFontSize] = useState(
      store.user?.reader_settings.fontSize || 18,
    ),
    [theme, setTheme] = useState(store.user?.reader_settings.theme || "paper");
  const currentUser = useRef(store.user);
  useEffect(() => {
    if (
      Number.isInteger(linkedPage) &&
      linkedPage >= 0 &&
      book?.chapters?.length
    )
      setPage(Math.min(linkedPage, book.chapters.length - 1));
  }, [id, linkedPage, book?.chapters?.length]);
  currentUser.current = store.user;
  useFocusEffect(
    useCallback(() => {
      if (!book?.available || !store.user) return;
      let seconds = 0,
        active = AppState.currentState === "active",
        last = Date.now();
      const flush = () => {
        const count = seconds;
        seconds = 0;
        if (count)
          api("/reading/" + id, "POST", { seconds: Math.min(count, 60) })
            .then(() => store.refresh())
            .catch((e) =>
              action.setError("Reading time could not be saved: " + e.message),
            );
      };
      const subscription = AppState.addEventListener("change", (state) => {
        active = state === "active";
        last = Date.now();
        if (!active) flush();
      });
      const tick = setInterval(() => {
        const now = Date.now();
        if (
          active &&
          (Platform.OS !== "web" || document.visibilityState === "visible")
        )
          seconds += Math.min(2, Math.floor((now - last) / 1000));
        last = now;
        if (seconds >= 30) flush();
      }, 1000);
      return () => {
        clearInterval(tick);
        subscription.remove();
        flush();
      };
    }, [id, book?.available, store.user?.id]),
  );
  async function move(next: number, finished = false) {
    await store.mutate("/library/" + id, "PUT", { page: next, finished });
    setPage(next);
    navigation.setParams({ page: next });
  }
  const chapter = book?.chapters?.[page];
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header
          navigation={navigation}
          title={book?.title || "Reader"}
          right={
            <IconButton
              name="settings-outline"
              label="Reader settings"
              onPress={() => setSettings(!settings)}
            />
          }
        />
        <Feedback
          error={error || action.error}
          busy={(!book && !error) || action.busy}
        />
        {book && !book.available ? (
          <Empty text="The full text of this book is not available." />
        ) : (
          chapter && (
            <>
              {settings && (
                <Card>
                  <Txt bold>Text size: {fontSize}</Txt>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 10,
                      marginVertical: 12,
                    }}
                  >
                    <Button
                      title="Smaller"
                      secondary
                      disabled={fontSize <= 14}
                      onPress={() => setFontSize(Math.max(14, fontSize - 2))}
                    />
                    <Button
                      title="Larger"
                      secondary
                      disabled={fontSize >= 30}
                      onPress={() => setFontSize(Math.min(30, fontSize + 2))}
                    />
                  </View>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {["paper", "light", "dark"].map((value) => (
                      <Button
                        key={value}
                        title={value}
                        secondary={theme !== value}
                        onPress={() => setTheme(value)}
                      />
                    ))}
                  </View>
                  <Button
                    title="Save reader settings"
                    style={{ marginTop: 12 }}
                    disabled={action.busy}
                    onPress={() =>
                      action.run(async () => {
                        await store.mutate("/me", "PATCH", {
                          reader_settings: { fontSize, theme },
                        });
                        setSettings(false);
                      })
                    }
                  />
                </Card>
              )}
              <View
                style={{
                  backgroundColor:
                    theme === "dark"
                      ? "#202027"
                      : theme === "paper"
                        ? "#F6EEDC"
                        : "#FFFFFF",
                  borderRadius: 22,
                  padding: 24,
                  marginVertical: 20,
                }}
              >
                <Txt size={13} color={theme === "dark" ? "#CDC9DE" : "#655E55"}>
                  Chapter {page + 1} of {book.chapters.length}
                </Txt>
                <Txt
                  bold
                  size={26}
                  color={theme === "dark" ? "#FFFFFF" : "#34303D"}
                  style={{ marginVertical: 20 }}
                >
                  {chapter.title}
                </Txt>
                <Txt
                  size={fontSize}
                  color={theme === "dark" ? "#ECE7F3" : "#34303D"}
                  style={{ lineHeight: fontSize * 1.8 }}
                >
                  {chapter.text}
                </Txt>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <Button
                  title="Previous"
                  secondary
                  disabled={page === 0 || action.busy}
                  onPress={() => action.run(() => move(page - 1))}
                />
                <Button
                  title={
                    page === book.chapters.length - 1
                      ? "Finish book"
                      : "Next chapter"
                  }
                  disabled={action.busy}
                  onPress={() =>
                    action.run(async () => {
                      if (page === book.chapters.length - 1) {
                        await move(page, true);
                        navigation.navigate("Reading", { bookId: id });
                      } else await move(page + 1);
                    })
                  }
                />
              </View>
              <PageReels bookId={id} page={page} navigation={navigation} />
              <Button
                title={
                  entry?.bookmarked ? "Remove bookmark" : "Bookmark this book"
                }
                secondary
                style={{ marginTop: 16 }}
                disabled={action.busy}
                onPress={() =>
                  action.run(() =>
                    store.mutate("/library/" + id, "PUT", {
                      page,
                      bookmarked: !entry?.bookmarked,
                    }),
                  )
                }
              />
              <Txt size={12} style={{ marginTop: 16 }}>
                Your position is saved when you change chapters or bookmark.
                Reading time is saved while this screen is active.
              </Txt>
            </>
          )
        )}
      </Page>
    </RequireAccount>
  );
}
export function Reading({ navigation, route }: any) {
  const store = useStore();
  const id = route.params?.bookId || "reading-guide";
  const b = store.books.find((b) => b.id === id),
    l = store.library.find((l) => l.book_id === id);
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header navigation={navigation} title="Reading progress" />
        <Title>{b?.title}</Title>
        <Txt size={48} bold>
          {l?.finished
            ? 100
            : Math.round(((l?.page || 0) / Math.max(b?.pages || 1, 1)) * 100)}
          %
        </Txt>
        <Txt style={{ marginBottom: 24 }}>
          {l?.finished
            ? "Book completed. Well read!"
            : "Keep going, one chapter at a time."}
        </Txt>
        <Button
          title="Open reader"
          onPress={() => navigation.navigate("Reader", { bookId: id })}
        />
        <Button
          title="Reading goals"
          secondary
          style={{ marginTop: 12 }}
          onPress={() => navigation.navigate("Goals")}
        />
      </Page>
    </RequireAccount>
  );
}
export function WriteReview({ navigation, route }: any) {
  const store = useStore(),
    action = useAction();
  const id = route.params?.bookId || "reading-guide";
  const { book } = useBook(id);
  const [rating, setRating] = useState(5),
    [body, setBody] = useState("");
  useEffect(() => {
    const own = book?.reviews.find((r: any) => r.user_id === store.user?.id);
    if (own) {
      setRating(own.rating);
      setBody(own.body);
    }
  }, [book, store.user?.id]);
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header navigation={navigation} title="Write a review" />
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginVertical: 20,
          }}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <Button
              key={n}
              title={String(n) + " ★"}
              secondary={rating !== n}
              onPress={() => setRating(n)}
            />
          ))}
        </View>
        <Field
          label="Your review"
          multiline
          maxLength={3000}
          value={body}
          onChangeText={setBody}
        />
        <Feedback {...action} />
        <Button
          title="Publish review"
          disabled={action.busy}
          onPress={() =>
            action.run(async () => {
              await store.mutate("/books/" + id + "/review", "PUT", {
                rating,
                body,
              });
              await store.loadBooks();
              navigation.goBack();
            })
          }
        />
        {book?.reviews.some((r: any) => r.user_id === store.user?.id) && (
          <Button
            title="Delete my review"
            secondary
            style={{ marginTop: 16 }}
            onPress={() =>
              action.run(async () => {
                await store.mutate("/books/" + id + "/review", "DELETE");
                await store.loadBooks();
                navigation.goBack();
              })
            }
          />
        )}
      </Page>
    </RequireAccount>
  );
}
export function BookActions({ navigation, route }: any) {
  const store = useStore(),
    action = useAction();
  const id = route.params?.bookId || "reading-guide";
  return (
    <Page>
      <Header navigation={navigation} title="Book options" />
      {[
        ["Save to collection", "SaveCollection"],
        ["Share book", "Share"],
        ["Download book", "Download"],
      ].map(([title, dest]) => (
        <Row
          key={dest}
          title={title}
          onPress={() => navigation.navigate(dest, { bookId: id })}
        />
      ))}
      <Feedback {...action} />
      {store.library.some((l) => l.book_id === id) && (
        <Button
          title="Remove from library and collections"
          secondary
          onPress={() =>
            action.run(async () => {
              await store.mutate("/library/" + id, "DELETE");
              navigation.goBack();
            })
          }
        />
      )}
    </Page>
  );
}
export function SaveCollection({ navigation, route }: any) {
  const store = useStore(),
    action = useAction();
  const id = route.params?.bookId || "reading-guide";
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header navigation={navigation} title="Save to collection" />
        <Feedback {...action} />
        {!store.collections.length && (
          <Empty text="Create a collection to organize your books." />
        )}
        {store.collections.map((c) => (
          <Row
            key={c.id}
            title={c.name + (c.book_ids.includes(id) ? " ✓" : "")}
            onPress={() =>
              action.run(async () => {
                await store.mutate("/collections/" + c.id + "/books", "PUT", {
                  bookIds: [...new Set([...c.book_ids, id])],
                });
                navigation.goBack();
              })
            }
          />
        ))}
        <Button
          title="New Collection"
          style={{ marginTop: 20 }}
          onPress={() => navigation.navigate("NewCollection", { bookId: id })}
        />
      </Page>
    </RequireAccount>
  );
}
export function Share({ navigation, route }: any) {
  const { books } = useStore(),
    action = useAction();
  const b = books.find((b) => b.id === route.params?.bookId);
  const [message, setMessage] = useState("");
  const text = b
    ? `${b.title} by ${b.author} — discover it on iBook.`
    : "Build your reading habit with iBook.";
  return (
    <Page>
      <Header navigation={navigation} title="Share" />
      <Card>
        <Txt size={22}>{text}</Txt>
      </Card>
      <Feedback {...action} message={message} />
      <Button
        title="Share"
        onPress={() =>
          action.run(async () => {
            if (Platform.OS === "web") {
              if (navigator.share) await navigator.share({ text });
              else {
                await navigator.clipboard.writeText(text);
                setMessage("Copied to clipboard.");
              }
            } else await NativeShare.share({ message: text });
          })
        }
      />
    </Page>
  );
}
export function Download({ navigation, route }: any) {
  const action = useAction();
  const { book, error } = useBook(route.params?.bookId || "reading-guide");
  const [message, setMessage] = useState("");
  return (
    <Page>
      <Header navigation={navigation} title="Download book" />
      <Txt>
        {book?.available
          ? "Save a plain-text copy for offline reading."
          : "Only books with available content can be downloaded."}
      </Txt>
      <Feedback {...action} error={error || action.error} message={message} />
      <Button
        title="Download text file"
        disabled={!book?.available || action.busy}
        onPress={() =>
          action.run(async () => {
            const text =
              book.title +
              "\nBy " +
              book.author +
              "\n\n" +
              book.chapters
                .map((c: any) => c.title + "\n\n" + c.text)
                .join("\n\n");
            if (Platform.OS === "web") {
              const url = URL.createObjectURL(
                new Blob([text], { type: "text/plain;charset=utf-8" }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = book.id + ".txt";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } else {
              const file = new File(Paths.cache, book.id + ".txt");
              file.write(text);
              if (await Sharing.isAvailableAsync())
                await Sharing.shareAsync(file.uri, { mimeType: "text/plain" });
              else
                throw new Error("File sharing is unavailable on this device.");
            }
            setMessage("Your download is ready.");
          })
        }
      />
    </Page>
  );
}
export function Purchase({ navigation }: any) {
  return (
    <Page>
      <Header navigation={navigation} title="Purchases unavailable" />
      <Txt>
        No payment provider or licensed book files have been connected. No
        charges can be made. You can read the free iBook guide and save catalog
        titles to your library.
      </Txt>
      <Button
        title="Browse books"
        style={{ marginTop: 24 }}
        onPress={() => navigation.navigate("Main", { screen: "Store" })}
      />
    </Page>
  );
}
export const PaymentMethods = Purchase;
export const AddPayment = Purchase;
export const AppStore = Purchase;
export function Popup({ navigation, route }: any) {
  return (
    <Page>
      <Header navigation={navigation} />
      <Title>{route.params?.title || "iBook"}</Title>
      <Txt>{route.params?.subtitle || ""}</Txt>
      <Button
        title="Done"
        style={{ marginTop: 24 }}
        onPress={() => navigation.goBack()}
      />
    </Page>
  );
}
