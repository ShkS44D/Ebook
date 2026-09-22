import { CatalogScreen } from './catalog-screen';
import { ReadingGoalIcon } from './reading-goal-icon';
import React from "react";
import { Image, View } from "react-native";
import { art } from "./assets";
import { useStore, CatalogBook, mediaUrl } from "./store";
import { Empty, RequireAccount } from "./functional-ui";
import {
  BookRow,
  Avatar,
  Button,
  Card,
  Glass,
  Icon,
  IconButton,
  Page,
  Row,
  Section,
  Tap,
  Title,
  Txt,
  useTheme,
} from "./ui";

export function CategoryTiles({ navigation }: any) {
  const { books } = useStore();
  const t = useTheme();
  const names = [...new Set(books.map((b) => b.category))];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {names.map((name) => (
        <Tap
          key={name}
          label={"Browse " + name}
          onPress={() => navigation.navigate("Category", { category: name })}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 18,
            backgroundColor: t.card,
            borderWidth: 1,
            borderColor: t.line,
          }}
        >
          <Txt bold size={13} color={t.ink}>
            {name}
          </Txt>
        </Tap>
      ))}
    </View>
  );
}

function BookList({
  items,
  navigation,
}: {
  items: CatalogBook[];
  navigation: any;
}) {
  return (
    <>
      {items.map((b) => (
        <BookRow
          key={b.id}
          book={b}
          onPress={() => navigation.navigate("Book", { bookId: b.id })}
          onMore={() => navigation.navigate("BookActions", { bookId: b.id })}
        />
      ))}
    </>
  );
}

/* Glass "Continue reading" hero. The cover sits beside a serif headline,
   mirroring the reader's paper-and-ink composition. */
function ContinueReading({ navigation }: any) {
  const { books, library } = useStore();
  const t = useTheme();
  const entry = library.find(
    (l) => books.find((b) => b.id === l.book_id)?.available && !l.finished,
  );
  const recent =
    books.find((b) => b.id === entry?.book_id) || books.find((b) => b.available);
  if (!recent) return null;
  const percent = entry
    ? Math.round((entry.page / Math.max(recent.pages, 1)) * 100)
    : 0;
  return (
    <Glass style={{ borderRadius: 28, padding: 18, borderWidth: 0 }}>
      <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
        <Tap
          label={"Open " + recent.title}
          onPress={() => navigation.navigate("Reader", { bookId: recent.id })}
        >
          <View
            style={{
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "0 8px 20px #241B1029",
            }}
          >
            <BookCoverLarge book={recent} />
          </View>
        </Tap>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={12} color={t.muted}>
            {entry ? "KEEP READING" : "START READING"}
          </Txt>
          <Txt bold size={17} numberOfLines={2} style={{ marginTop: 4 }}>
            {recent.title}
          </Txt>
          <Txt size={12} color={t.muted} numberOfLines={1} style={{ marginTop: 2 }}>
            {recent.author}
          </Txt>
          <View
            style={{
              marginTop: 12,
              height: 4,
              borderRadius: 2,
              backgroundColor: t.dark ? "#3A372F" : "#E7E2D6",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${Math.max(4, percent)}%`,
                height: "100%",
                borderRadius: 2,
                backgroundColor: t.accent,
              }}
            />
          </View>
          <Txt size={11} color={t.muted} style={{ marginTop: 6 }}>
            {entry ? `${percent}% through` : "Ready in your reader"}
          </Txt>
        </View>
      </View>
      <Button
        title="Continue reading"
        onPress={() => navigation.navigate("Reader", { bookId: recent.id })}
        style={{ marginTop: 16 }}
      />
    </Glass>
  );
}

function BookCoverLarge({ book }: any) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [book.id, book.cover_url]);
  return (
    <View style={{ width: 76, height: 112 }}>
      {!!book.image && !failed && (
        <Image
          source={book.image}
          onError={() => setFailed(true)}
          style={{ width: 76, height: 112, borderRadius: 14 }}
        />
      )}
      {(!book.image || failed) && (
        <View
          style={{
            width: 76,
            height: 112,
            borderRadius: 14,
            backgroundColor: "#2E241A",
            padding: 9,
            justifyContent: "space-between",
          }}
        >
          <Txt size={7} color="#EFE3CC">
            iBOOK CLASSICS
          </Txt>
          <Txt bold size={12} color="white" numberOfLines={4}>
            {book.title}
          </Txt>
        </View>
      )}
    </View>
  );
}

/* Daily goal presented as a glass card with the existing progress ring. */
function GoalCard({ navigation }: any) {
  const { user, days } = useStore();
  const t = useTheme();
  const today = days.find((d) => d.day === new Date().toISOString().slice(0, 10));
  const minutes = Math.floor((today?.seconds || 0) / 60);
  const goal = user?.goal || 20;
  return (
    <Glass style={{ borderRadius: 28, padding: 20, borderWidth: 0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
        <ReadingGoalIcon progress={(today?.seconds || 0) / (goal * 60)} />
        <View style={{ flex: 1 }}>
          <Txt bold size={16}>
            {minutes} of {goal} minutes
          </Txt>
          <Txt size={12} color={t.muted} style={{ marginTop: 4, lineHeight: 19 }}>
            {today?.seconds
              ? today.seconds >= goal * 60
                ? "Daily goal reached. Well read."
                : "A few pages today will move you forward."
              : "Open the reader and the timer starts itself."}
          </Txt>
          <Tap
            label="Reading goals"
            onPress={() => navigation.navigate("Goals")}
            style={{ marginTop: 10, alignSelf: "flex-start" }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Txt bold size={13} color={t.accent}>
                Reading goals
              </Txt>
              <Icon name="chevron-forward" size={15} color={t.accent} />
            </View>
          </Tap>
        </View>
      </View>
    </Glass>
  );
}

function Greeting({ navigation }: any) {
  const { user, library } = useStore();
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20,
      }}
    >
      <Tap
        label="Open profile"
        onPress={() => navigation.navigate("Profile")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          maxWidth: 290,
        }}
      >
        <Avatar size={46} index={user?.avatar_preset || 0} source={user?.avatar_url?{uri:mediaUrl(user.avatar_url)}:undefined}/>
        <View>
          <Txt bold size={20} color={t.heading} numberOfLines={1} style={{ maxWidth: 215 }}>
            Hello, {user?.name || "reader"}
          </Txt>
          <Txt size={12} color={t.muted}>
            {library.length} {library.length === 1 ? "book" : "books"} in your library
          </Txt>
        </View>
      </Tap>
      <IconButton
        name="notifications-outline"
        label="Notifications"
        onPress={() => navigation.navigate("Notifications")}
      />
    </View>
  );
}

export function Home({ navigation }: any) {
  const { books } = useStore();
  const t = useTheme();
  return (
    <Page bottom={120}>
      <Greeting navigation={navigation} />
      <ContinueReading navigation={navigation} />
      <Section title="Your reading goal">
        <GoalCard navigation={navigation} />
      </Section>
      <Section title="Explore by category">
        <CategoryTiles navigation={navigation} />
      </Section>
      <Section
        title="Discover your next read"
        right={
          <Tap label="Open the store" onPress={() => navigation.navigate("Store")}>
            <Txt bold size={13} color={t.accent}>
              See all
            </Txt>
          </Tap>
        }
      >
        <Card style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <BookList items={books.slice(0, 4)} navigation={navigation} />
        </Card>
      </Section>
      <Section title="Read together">
        <Button
          title="Find friends"
          secondary
          onPress={() => navigation.navigate("Friends")}
        />
      </Section>
      <View style={{ height: 8 }} />
    </Page>
  );
}
export function Store({ navigation }: any) {
  return <CatalogScreen navigation={navigation} title="Discover" />;
}
export function Library({ navigation }: any) {
  const { books, library, collections } = useStore();
  const t = useTheme();
  const [filter, setFilter] = React.useState("All");
  const items = library.filter(
    (l) =>
      filter === "All" || (filter === "Finished" ? l.finished : !l.finished),
  );
  return (
    <RequireAccount navigation={navigation}>
      <Page bottom={120}>
        <Title>Library</Title>
        <Row
          title={`Collections (${collections.length})`}
          icon="folder-outline"
          onPress={() => navigation.navigate("Collections")}
        />
        <View style={{ flexDirection: "row", gap: 8, marginVertical: 24 }}>
          {["All", "Reading list", "Finished"].map((f) => (
            <Button
              key={f}
              title={f}
              secondary={filter !== f}
              onPress={() => setFilter(f)}
            />
          ))}
        </View>
        {!items.length && (
          <Empty text="Your library is waiting. Discover a book and save it here." />
        )}
        {items.map((l) => {
          const b = books.find((b) => b.id === l.book_id);
          return b ? (
            <View key={b.id}>
              <BookRow
                book={b}
                onPress={() => navigation.navigate("Book", { bookId: b.id })}
                onMore={() =>
                  navigation.navigate("BookActions", { bookId: b.id })
                }
              />
              <Txt size={12} color={t.accent} style={{ marginBottom: 20 }}>
                {l.finished
                  ? "Finished"
                  : b.available
                    ? `${Math.round((l.page / Math.max(b.pages, 1)) * 100)}% read`
                    : "Saved to reading list"}
                {l.bookmarked ? " • Bookmarked" : ""}
              </Txt>
            </View>
          ) : null;
        })}
        <Button
          title="Discover books"
          secondary
          onPress={() => navigation.navigate("Store")}
        />
      </Page>
    </RequireAccount>
  );
}
export function Search({ navigation }: any) {
  return <CatalogScreen navigation={navigation} title="Find your next book" />;
}
export function Category({ navigation, route }: any) {
  return <CatalogScreen navigation={navigation} title="Browse books" topic={route.params?.category || ''} />;
}
