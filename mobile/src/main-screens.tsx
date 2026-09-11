import React, { useState } from "react";
import { Image, View } from "react-native";
import { art } from "./assets";
import { purple } from "./data";
import { useStore, CatalogBook } from "./store";
import { Empty, RequireAccount } from "./functional-ui";
import {
  Avatar,
  BookRow,
  Button,
  Card,
  Field,
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
  const names = [...new Set(books.map((b) => b.category))];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {names.map((name) => (
        <Button
          key={name}
          title={name}
          secondary
          onPress={() => navigation.navigate("Category", { category: name })}
        />
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
function Greeting({ navigation }: any) {
  const { user, library } = useStore();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 24,
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
        <Avatar source={art.profile} />
        <View>
          <Txt
            color="white"
            size={21}
            bold
            numberOfLines={1}
            style={{ maxWidth: 215 }}
          >
            Hello, {user?.name || "reader"}
          </Txt>
          <Txt color="white" size={12}>
            {library.length} books in your library
          </Txt>
        </View>
      </Tap>
      <IconButton
        light
        name="notifications-outline"
        label="Notifications"
        onPress={() => navigation.navigate("Notifications")}
      />
    </View>
  );
}
export function Home({ navigation }: any) {
  const { books, library, user, days } = useStore();
  const t = useTheme();
  const recent =
    books.find(
      (b) =>
        b.id ===
        library.find(
          (l) =>
            books.find((b) => b.id === l.book_id)?.available && !l.finished,
        )?.book_id,
    ) || books.find((b) => b.available);
  const today = days.find(
    (d) => d.day === new Date().toISOString().slice(0, 10),
  );
  return (
    <Page purpleBg bottom={120}>
      <Greeting navigation={navigation} />
      <Card>
        <Title>Make time for a good book.</Title>
        <Txt style={{ marginBottom: 20 }}>A little reading, every day.</Txt>
        {recent && (
          <>
            <Section title="Keep reading">
              <BookRow
                book={recent}
                onPress={() =>
                  navigation.navigate("Reader", { bookId: recent.id })
                }
              />
            </Section>
            <Button
              title="Continue reading"
              onPress={() =>
                navigation.navigate("Reader", { bookId: recent.id })
              }
            />
          </>
        )}
      </Card>
      <Section title="Explore by category" light={!t.dark}>
        <CategoryTiles navigation={navigation} />
      </Section>
      <Section title="Discover your next read" light={!t.dark}>
        <Card>
          <BookList items={books.slice(0, 6)} navigation={navigation} />
        </Card>
      </Section>
      <Section title="Your reading goal" light={!t.dark}>
        <Card>
          <Txt bold size={24}>
            {Math.floor((today?.seconds || 0) / 60)} / {user?.goal || 20}{" "}
            minutes
          </Txt>
          <Txt style={{ marginVertical: 12 }}>
            Reading time is counted while the reader is open and active. Daily
            totals use UTC.
          </Txt>
          <Button
            title="Reading goals"
            secondary
            onPress={() => navigation.navigate("Goals")}
          />
        </Card>
      </Section>
      <Section title="Read together" light={!t.dark}>
        <Button
          title="Find friends"
          secondary
          onPress={() => navigation.navigate("Friends")}
        />
      </Section>
    </Page>
  );
}
export function Store({ navigation }: any) {
  const { books } = useStore();
  return (
    <Page bottom={120}>
      <Title>Discover</Title>
      <Txt style={{ marginBottom: 24 }}>
        Explore the catalog. Full text is available for titles marked “Read
        free”.
      </Txt>
      <CategoryTiles navigation={navigation} />
      <Section title="Read free">
        <BookList
          items={books.filter((b) => b.available)}
          navigation={navigation}
        />
      </Section>
      <Section title="Build your reading list">
        <BookList
          items={books.filter((b) => !b.available)}
          navigation={navigation}
        />
      </Section>
    </Page>
  );
}
export function Library({ navigation }: any) {
  const { books, library, collections } = useStore();
  const [filter, setFilter] = useState("All");
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
              <Txt size={12} color={purple} style={{ marginBottom: 20 }}>
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
  const { books } = useStore();
  const [q, setQ] = useState("");
  const items = books.filter((b) =>
    (b.title + " " + b.author).toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <Page bottom={120}>
      <Title>Find your next book</Title>
      <Field
        label="Search books or authors"
        placeholder="Enter a title or author"
        value={q}
        onChangeText={setQ}
        icon="search-outline"
      />
      {q.trim() ? (
        <Section title={`${items.length} results`}>
          {!items.length ? (
            <Empty text="No books found. Try another title or author." />
          ) : (
            <BookList items={items} navigation={navigation} />
          )}
        </Section>
      ) : (
        <>
          <CategoryTiles navigation={navigation} />
          <Section title="All books">
            <BookList items={books} navigation={navigation} />
          </Section>
        </>
      )}
    </Page>
  );
}
export function Category({ navigation, route }: any) {
  const { books } = useStore();
  const name = route.params?.category;
  const items = books.filter((b) => b.category === name);
  return (
    <Page>
      <Row title="Back" onPress={() => navigation.goBack()} />
      <Title>{name || "Categories"}</Title>
      {items.length ? (
        <BookList items={items} navigation={navigation} />
      ) : (
        <Empty text="No books in this category yet." />
      )}
    </Page>
  );
}
