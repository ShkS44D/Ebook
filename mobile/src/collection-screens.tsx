import React, { useState } from "react";
import { View } from "react-native";
import { useStore } from "./store";
import { Empty, Feedback, RequireAccount, useAction } from "./functional-ui";
import {
  BookRow,
  Button,
  Field,
  Header,
  IconButton,
  Page,
  Row,
  Title,
  Txt,
} from "./ui";
export function Collections({ navigation }: any) {
  const store = useStore();
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header navigation={navigation} title="Collections" />
        <Txt>Your personal shelves, saved across devices.</Txt>
        {!store.collections.length && (
          <Empty text="No collections yet. Create your first shelf." />
        )}
        {store.collections.map((c) => (
          <Row
            key={c.id}
            title={`${c.name} (${c.book_ids.length})`}
            icon="folder-outline"
            onPress={() =>
              navigation.navigate("Collection", { collectionId: c.id })
            }
          />
        ))}
        <Button
          title="New Collection"
          style={{ marginTop: 24 }}
          onPress={() => navigation.navigate("NewCollection")}
        />
      </Page>
    </RequireAccount>
  );
}
export const CollectionList = Collections;
export function Collection({ navigation, route }: any) {
  const store = useStore(),
    action = useAction();
  const c = store.collections.find((c) => c.id === route.params?.collectionId);
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(c?.name || "");
  if (!c)
    return (
      <Page>
        <Header navigation={navigation} />
        <Empty text="This collection no longer exists." />
        <Button
          title="View collections"
          onPress={() => navigation.navigate("Collections")}
        />
      </Page>
    );
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header
          navigation={navigation}
          title={c.name}
          right={
            <IconButton
              name="create-outline"
              label="Rename collection"
              onPress={() => {
                setName(c.name);
                setEditing(!editing);
              }}
            />
          }
        />
        <Feedback {...action} />
        {editing && (
          <>
            <Field
              label="Collection name"
              value={name}
              onChangeText={setName}
              maxLength={80}
            />
            <Button
              title="Save name"
              disabled={action.busy}
              onPress={() =>
                action.run(async () => {
                  await store.mutate("/collections/" + c.id, "PATCH", { name });
                  setEditing(false);
                })
              }
            />
          </>
        )}
        {!c.book_ids.length && (
          <Empty text="No books in this collection yet." />
        )}
        {store.books
          .filter((b) => c.book_ids.includes(b.id))
          .map((b) => (
            <View key={b.id}>
              <BookRow
                book={b}
                onPress={() => navigation.navigate("Book", { bookId: b.id })}
              />
              {editing && (
                <Button
                  title={"Remove " + b.title}
                  secondary
                  disabled={action.busy}
                  style={{ marginBottom: 20 }}
                  onPress={() =>
                    action.run(() =>
                      store.mutate("/collections/" + c.id + "/books", "PUT", {
                        bookIds: c.book_ids.filter((id) => id !== b.id),
                      }),
                    )
                  }
                />
              )}
            </View>
          ))}
        <Button
          title="Add Books"
          style={{ marginTop: 20 }}
          onPress={() =>
            navigation.navigate("AddBooks", { collectionId: c.id })
          }
        />
        <Button
          title="Delete collection"
          secondary
          style={{ marginTop: 12 }}
          onPress={() =>
            navigation.navigate("DeleteCollection", { collectionId: c.id })
          }
        />
      </Page>
    </RequireAccount>
  );
}
export function NewCollection({ navigation, route }: any) {
  const store = useStore(),
    action = useAction();
  const [name, setName] = useState("");
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header navigation={navigation} title="New Collection" />
        <Field
          label="Title"
          placeholder="Name your collection"
          value={name}
          onChangeText={setName}
          maxLength={80}
        />
        <Feedback {...action} />
        <Button
          title="Create collection"
          disabled={action.busy}
          onPress={() =>
            action.run(async () => {
              const c = await store.mutate("/collections", "POST", { name });
              if (route.params?.bookId)
                await store.mutate("/collections/" + c.id + "/books", "PUT", {
                  bookIds: [route.params.bookId],
                });
              navigation.replace("Collection", { collectionId: c.id });
            })
          }
        />
      </Page>
    </RequireAccount>
  );
}
export function AddBooks({ navigation, route }: any) {
  const store = useStore(),
    action = useAction();
  const c = store.collections.find((c) => c.id === route.params?.collectionId);
  const [selected, setSelected] = useState<string[]>(c?.book_ids || []),
    [q, setQ] = useState("");
  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header navigation={navigation} title="Choose books" />
        <Field label="Search books" value={q} onChangeText={setQ} />
        {store.books
          .filter((b) =>
            (b.title + " " + b.author).toLowerCase().includes(q.toLowerCase()),
          )
          .map((b) => (
            <BookRow
              key={b.id}
              book={b}
              selectable
              selected={selected.includes(b.id)}
              onPress={() => toggle(b.id)}
            />
          ))}
        <Feedback {...action} />
        <Button
          title={`Save ${selected.length} books`}
          disabled={!c || action.busy}
          onPress={() =>
            action.run(async () => {
              await store.mutate("/collections/" + c!.id + "/books", "PUT", {
                bookIds: selected,
              });
              navigation.goBack();
            })
          }
        />
      </Page>
    </RequireAccount>
  );
}
export function DeleteCollection({ navigation, route }: any) {
  const store = useStore(),
    action = useAction();
  const c = store.collections.find((c) => c.id === route.params?.collectionId);
  return (
    <Page>
      <Header navigation={navigation} title="Delete collection?" />
      <Title>{c?.name}</Title>
      <Txt>
        The collection will be removed. Its books remain in your library.
      </Txt>
      <Feedback {...action} />
      <Button
        title="Delete collection"
        disabled={!c || action.busy}
        onPress={() =>
          action.run(async () => {
            await store.mutate("/collections/" + c!.id, "DELETE");
            navigation.popTo("Collections");
          })
        }
      />
      <Button
        title="Cancel"
        secondary
        style={{ marginTop: 12 }}
        onPress={() => navigation.goBack()}
      />
    </Page>
  );
}
