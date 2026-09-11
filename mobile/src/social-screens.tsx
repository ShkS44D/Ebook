import React, { useCallback, useState } from "react";
import { Platform, Share, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, useStore } from "./store";
import { Empty, Feedback, RequireAccount, useAction } from "./functional-ui";
import { Button, Card, Field, Header, Page, Row, Section, Txt } from "./ui";
export function Friends({ navigation }: any) {
  const store = useStore(),
    action = useAction();
  useFocusEffect(
    useCallback(() => {
      if (store.user) void action.run(store.refresh);
    }, [store.user?.id]),
  );
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header navigation={navigation} title="Friends" />
        <Button
          title="Find readers"
          onPress={() => navigation.navigate("Discover")}
        />
        <Feedback {...action} />
        {!store.friends.length && (
          <Empty text="No friends yet. Search for another reader by their display name." />
        )}
        {store.friends.map((f) => (
          <Card key={f.id} style={{ marginTop: 16 }}>
            <Txt bold size={18}>
              {f.name}
            </Txt>
            <Txt style={{ marginVertical: 12 }}>
              {f.accepted
                ? f.bio || "Your reading friend"
                : f.sender === store.user?.id
                  ? "Request sent"
                  : "Wants to be your friend"}
            </Txt>
            {f.accepted ? (
              <Button
                title={"Chat with " + f.name}
                onPress={() =>
                  navigation.navigate("Chat", { userId: f.id, name: f.name })
                }
              />
            ) : f.recipient === store.user?.id ? (
              <Button
                title={"Accept " + f.name}
                disabled={action.busy}
                onPress={() =>
                  action.run(() => store.mutate("/friends/" + f.id))
                }
              />
            ) : null}
            <Button
              title={
                f.accepted ? "Manage friendship" : "Cancel or decline request"
              }
              secondary
              disabled={action.busy}
              style={{ marginTop: 12 }}
              onPress={() =>
                f.accepted
                  ? navigation.navigate("FriendActions", {
                      userId: f.id,
                      name: f.name,
                    })
                  : action.run(() => store.mutate("/friends/" + f.id, "DELETE"))
              }
            />
          </Card>
        ))}
      </Page>
    </RequireAccount>
  );
}
export function Discover({ navigation }: any) {
  const store = useStore(),
    action = useAction();
  const [q, setQ] = useState(""),
    [people, setPeople] = useState<any[]>([]),
    [searched, setSearched] = useState(false);
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header navigation={navigation} title="Discover readers" />
        <Field
          label="Reader name"
          placeholder="At least two characters"
          value={q}
          onChangeText={setQ}
        />
        <Button
          title="Search readers"
          disabled={q.trim().length < 2 || action.busy}
          onPress={() =>
            action.run(async () => {
              setPeople(await api("/people?q=" + encodeURIComponent(q)));
              setSearched(true);
            })
          }
        />
        <Feedback {...action} />
        {searched && !people.length && (
          <Empty text="No readers found. Try another name." />
        )}
        {people.map((p) => {
          const f = store.friends.find((f) => f.id === p.id);
          return (
            <Card key={p.id} style={{ marginTop: 16 }}>
              <Txt bold>{p.name}</Txt>
              <Txt style={{ marginVertical: 12 }}>{p.bio}</Txt>
              <Button
                title={
                  f?.accepted
                    ? "Friends"
                    : f
                      ? f.sender === store.user?.id
                        ? "Request sent"
                        : "Accept request"
                      : "Add friend"
                }
                disabled={
                  action.busy || f?.accepted || f?.sender === store.user?.id
                }
                onPress={() =>
                  action.run(() => store.mutate("/friends/" + p.id))
                }
              />
            </Card>
          );
        })}
        <Row
          title="Invite someone to iBook"
          onPress={() => navigation.navigate("Invite")}
        />
      </Page>
    </RequireAccount>
  );
}
export const FriendSearch = Discover;
export function Invite({ navigation }: any) {
  const action = useAction();
  const [message, setMessage] = useState("");
  const text = "Join me on iBook and share your reading journey.";
  return (
    <Page>
      <Header navigation={navigation} title="Invite friends" />
      <Txt style={{ marginBottom: 24 }}>
        Share an invitation using your device. Once your friend has an account,
        search for their display name.
      </Txt>
      <Feedback {...action} message={message} />
      <Button
        title="Share invitation"
        onPress={() =>
          action.run(async () => {
            if (Platform.OS === "web") {
              if (navigator.share) await navigator.share({ text });
              else {
                await navigator.clipboard.writeText(text);
                setMessage("Invitation copied.");
              }
            } else await Share.share({ message: text });
          })
        }
      />
    </Page>
  );
}
export function Chat({ navigation, route }: any) {
  const store = useStore(),
    action = useAction();
  const [messages, setMessages] = useState<any[]>([]),
    [body, setBody] = useState(""),
    [loading, setLoading] = useState(true);
  const id = route.params?.userId;
  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        try {
          if (!id) {
            if (active)
              action.setError("Choose a friend to start a conversation.");
            return;
          }
          const result = await api("/messages/" + id);
          if (active) {
            setMessages(result);
            action.setError("");
          }
        } catch (e: any) {
          if (active) action.setError(e.message);
        } finally {
          if (active) setLoading(false);
        }
      }
      void load();
      const timer = setInterval(load, 5000);
      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [id]),
  );
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header navigation={navigation} title={route.params?.name || "Chat"} />
        <Txt size={12}>Messages refresh every five seconds.</Txt>
        <Feedback {...action} busy={action.busy || loading} />
        {!messages.length && !loading && (
          <Empty text="Start the conversation." />
        )}
        {messages.map((m) => (
          <View
            key={m.id}
            style={{
              alignSelf:
                m.sender === store.user?.id ? "flex-end" : "flex-start",
              backgroundColor:
                m.sender === store.user?.id ? "#6952FF" : "#EEEAF7",
              borderRadius: 18,
              padding: 16,
              marginVertical: 6,
              maxWidth: "85%",
            }}
          >
            <Txt color={m.sender === store.user?.id ? "white" : "#302B42"}>
              {m.body}
            </Txt>
            <Txt
              color={m.sender === store.user?.id ? "#DED7FF" : "#655E77"}
              size={10}
            >
              {new Date(m.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Txt>
          </View>
        ))}
        <Section title="Message">
          <Field
            label="Message"
            multiline
            maxLength={2000}
            value={body}
            onChangeText={setBody}
          />
          <Button
            title="Send message"
            disabled={!id || !body.trim() || action.busy}
            onPress={() =>
              action.run(async () => {
                await api("/messages/" + id, "POST", { body });
                setBody("");
                setMessages(await api("/messages/" + id));
              })
            }
          />
        </Section>
      </Page>
    </RequireAccount>
  );
}
