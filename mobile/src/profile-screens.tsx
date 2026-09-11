import React, { useCallback, useState } from "react";
import { Switch, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, useStore } from "./store";
import { Empty, Feedback, RequireAccount, useAction } from "./functional-ui";
import {
  Avatar,
  BookRow,
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
export function Profile({ navigation }: any) {
  const store = useStore();
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header
          navigation={navigation}
          right={
            <IconButton
              name="settings-outline"
              label="Settings"
              onPress={() => navigation.navigate("Settings")}
            />
          }
        />
        <Avatar size={90} />
        <Title>{store.user?.name}</Title>
        <Txt>
          {store.user?.bio || "Tell other readers a little about yourself."}
        </Txt>
        <Section title="Your reading life">
          <Txt bold size={24}>
            {store.library.length} saved ·{" "}
            {store.library.filter((l) => l.finished).length} finished
          </Txt>
        </Section>
        {[
          ["Edit Profile", "EditProfile"],
          ["My collections", "Collections"],
          ["Reading goals", "Goals"],
          ["Friends", "Friends"],
          ["Notifications", "Notifications"],
        ].map(([title, dest]) => (
          <Row
            key={dest}
            title={title}
            onPress={() => navigation.navigate(dest)}
          />
        ))}
      </Page>
    </RequireAccount>
  );
}
export function Author({ navigation, route }: any) {
  const { books } = useStore();
  const name = route.params?.name;
  return (
    <Page>
      <Header navigation={navigation} title={name || "Author"} />
      <Txt>Books by this author in the iBook catalog.</Txt>
      <Section title="Books">
        {books
          .filter((b) => b.author === name)
          .map((b) => (
            <BookRow
              key={b.id}
              book={b}
              onPress={() => navigation.navigate("Book", { bookId: b.id })}
            />
          ))}
      </Section>
    </Page>
  );
}
export function Membership({ navigation }: any) {
  return (
    <Page>
      <Header navigation={navigation} title="Your membership" />
      <Title>Free reader</Title>
      <Txt>
        Your account includes collections, reviews, reading goals, and
        connections with friends. Paid memberships are not available.
      </Txt>
      <Button
        title="Discover books"
        style={{ marginTop: 24 }}
        onPress={() => navigation.navigate("Main", { screen: "Store" })}
      />
    </Page>
  );
}
export function ProfileMenu({ navigation }: any) {
  return (
    <Page>
      <Header navigation={navigation} title="Your account" />
      {[
        ["Profile", "Profile"],
        ["Settings", "Settings"],
        ["Help", "Help"],
      ].map(([title, dest]) => (
        <Row
          key={dest}
          title={title}
          onPress={() => navigation.navigate(dest)}
        />
      ))}
    </Page>
  );
}
export function FriendActions({ navigation, route }: any) {
  const store = useStore(),
    action = useAction();
  const id = route.params?.userId;
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header
          navigation={navigation}
          title={route.params?.name || "Friendship"}
        />
        <Txt>
          Removing a friend ends messaging access. Blocking also prevents new
          requests and hides you from each other in search.
        </Txt>
        <Feedback {...action} />
        <Button
          title="Remove friend"
          disabled={!id || action.busy}
          style={{ marginTop: 20 }}
          onPress={() =>
            action.run(async () => {
              await store.mutate("/friends/" + id, "DELETE");
              navigation.popTo("Friends");
            })
          }
        />
        <Button
          title="Block reader"
          secondary
          disabled={!id || action.busy}
          style={{ marginTop: 16 }}
          onPress={() =>
            action.run(async () => {
              await store.mutate("/blocks/" + id);
              navigation.popTo("Friends");
            })
          }
        />
      </Page>
    </RequireAccount>
  );
}
export function Settings({ navigation }: any) {
  const store = useStore(),
    action = useAction();
  const [blocked, setBlocked] = useState<any[]>([]);
  const [dark, setDark] = useState(store.user?.dark || false),
    [notify, setNotify] = useState(store.user?.notifications || false);
  const toggle = (field: "dark" | "notifications", value: boolean) => {
    const set = field === "dark" ? setDark : setNotify;
    const previous = field === "dark" ? dark : notify;
    set(value);
    void action.run(async () => {
      try {
        await store.mutate("/me", "PATCH", { [field]: value });
      } catch (error) {
        set(previous);
        throw error;
      }
    });
  };
  useFocusEffect(
    useCallback(() => {
      if (store.user)
        api("/blocks")
          .then(setBlocked)
          .catch((e) => action.setError(e.message));
    }, [store.user?.id]),
  );
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header navigation={navigation} title="Settings" />
        <Feedback {...action} />
        <Row
          title="Dark appearance"
          trailing={
            <Switch
              accessibilityLabel="Dark appearance"
              value={dark}
              disabled={action.busy}
              onValueChange={(value) => toggle("dark", value)}
            />
          }
        />
        <Row
          title="In-app notifications"
          trailing={
            <Switch
              accessibilityLabel="In-app notifications"
              value={notify}
              disabled={action.busy}
              onValueChange={(value) => toggle("notifications", value)}
            />
          }
        />
        <Row
          title="Reader settings"
          onPress={() =>
            navigation.navigate("Reader", { bookId: "reading-guide" })
          }
        />
        <Row
          title="Privacy information"
          onPress={() => navigation.navigate("Privacy")}
        />
        {store.user?.reel_moderator && (
          <Row
            title="Review reported reels"
            onPress={() => navigation.navigate("ReelModeration")}
          />
        )}
        <Row title="Help Center" onPress={() => navigation.navigate("Help")} />
        {blocked.length > 0 && (
          <Section title="Blocked readers">
            {blocked.map((b) => (
              <Row
                key={b.id}
                title={"Unblock " + b.name}
                onPress={() =>
                  action.run(async () => {
                    await api("/blocks/" + b.id, "DELETE");
                    setBlocked(await api("/blocks"));
                  })
                }
              />
            ))}
          </Section>
        )}
        <Button
          title="Sign out"
          secondary
          style={{ marginTop: 32 }}
          disabled={action.busy}
          onPress={() =>
            action.run(async () => {
              await store.logout();
              navigation.reset({ index: 0, routes: [{ name: "SignIn" }] });
            })
          }
        />
      </Page>
    </RequireAccount>
  );
}
export function EditProfile({ navigation }: any) {
  const store = useStore(),
    action = useAction();
  const [name, setName] = useState(store.user?.name || ""),
    [bio, setBio] = useState(store.user?.bio || ""),
    [phone, setPhone] = useState(store.user?.phone || "");
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header navigation={navigation} title="Edit Profile" />
        <Field
          label="Name"
          maxLength={80}
          value={name}
          onChangeText={setName}
        />
        <Field
          label="About you"
          multiline
          maxLength={500}
          value={bio}
          onChangeText={setBio}
        />
        <Field
          label="Phone (private, optional)"
          keyboardType="phone-pad"
          maxLength={30}
          value={phone}
          onChangeText={setPhone}
        />
        <Txt size={12}>
          Your display name and bio are visible in reader search. Your email and
          phone are private.
        </Txt>
        <Feedback {...action} />
        <Button
          title="Save profile"
          disabled={action.busy}
          onPress={() =>
            action.run(async () => {
              await store.mutate("/me", "PATCH", { name, bio, phone });
              navigation.goBack();
            })
          }
        />
      </Page>
    </RequireAccount>
  );
}
export function GoalsScreen({ navigation }: any) {
  const store = useStore(),
    action = useAction();
  useFocusEffect(
    useCallback(() => {
      if (store.user) void action.run(store.refresh);
    }, [store.user?.id]),
  );
  const today = new Date().toISOString().slice(0, 10),
    seconds = store.days.find((d) => d.day === today)?.seconds || 0;
  let longest = 0,
    run = 0,
    previous = 0;
  for (const d of [...store.days].reverse()) {
    const date = Date.parse(d.day);
    if (d.seconds > 0) {
      run = date - previous === 86400000 ? run + 1 : 1;
      longest = Math.max(longest, run);
      previous = date;
    }
  }
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header navigation={navigation} title="Reading goals" />
        <Feedback {...action} />
        <Card>
          <Txt size={48} bold>
            {Math.floor(seconds / 60)} min
          </Txt>
          <Txt>of your {store.user?.goal}-minute daily goal</Txt>
          <Txt style={{ marginTop: 16 }}>
            {seconds >= (store.user?.goal || 20) * 60
              ? "Daily goal reached!"
              : "A few pages today will move you forward."}
          </Txt>
        </Card>
        <Button
          title="Change daily goal"
          style={{ marginTop: 20 }}
          onPress={() => navigation.navigate("GoalPicker")}
        />
        <Section title="Reading history">
          <Txt bold>{longest} days · longest streak in the last year</Txt>
          <Txt size={12}>
            A reading day counts when you spend time in the reader. Dates use
            UTC.
          </Txt>
          {!store.days.length && (
            <Empty text="Your first reading session will appear here." />
          )}
          {store.days.slice(0, 30).map((d) => (
            <Row
              key={d.day}
              title={d.day}
              trailing={
                <Txt>
                  {Math.floor(d.seconds / 60)}m {d.seconds % 60}s
                </Txt>
              }
            />
          ))}
        </Section>
        <Button
          title="Read now"
          onPress={() =>
            navigation.navigate("Reader", { bookId: "reading-guide" })
          }
        />
      </Page>
    </RequireAccount>
  );
}
export function GoalPicker({ navigation }: any) {
  const store = useStore(),
    action = useAction();
  const [goal, setGoal] = useState(store.user?.goal || 20);
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header navigation={navigation} title="Daily reading goal" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {[5, 10, 15, 20, 30, 40, 60].map((n) => (
            <Button
              key={n}
              title={`${n} min`}
              secondary={n !== goal}
              onPress={() => setGoal(n)}
            />
          ))}
        </View>
        <Feedback {...action} />
        <Button
          title="Save goal"
          disabled={action.busy}
          onPress={() =>
            action.run(async () => {
              await store.mutate("/me", "PATCH", { goal });
              navigation.goBack();
            })
          }
        />
      </Page>
    </RequireAccount>
  );
}
export function Notifications({ navigation }: any) {
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
        <Header navigation={navigation} title="Notifications" />
        <Feedback {...action} />
        {!store.notifications.length && (
          <Empty text="You have no notifications yet." />
        )}
        {store.notifications.length > 0 && (
          <Button
            title="Mark all as read"
            secondary
            disabled={action.busy}
            onPress={() =>
              action.run(() => store.mutate("/notifications/read"))
            }
          />
        )}{" "}
        {store.notifications.map((n) => (
          <Card key={n.id} style={{ marginTop: 14 }}>
            <Txt bold={!n.read}>{n.body}</Txt>
            <Txt size={11} style={{ marginTop: 10 }}>
              {new Date(n.created_at).toLocaleString()} ·{" "}
              {n.read ? "Read" : "New"}
            </Txt>
          </Card>
        ))}
        <Row
          title="Open friends and conversations"
          onPress={() => navigation.navigate("Friends")}
        />
      </Page>
    </RequireAccount>
  );
}
export function Info({ navigation, route }: any) {
  const name = route.name;
  return (
    <Page>
      <Header
        navigation={navigation}
        title={
          name === "Help"
            ? "Help Center"
            : name === "Gift"
              ? "Gift codes"
              : name === "Privacy"
                ? "Privacy information"
                : "Using iBook"
        }
      />
      {name === "Help" ? (
        <>
          {[
            ["How to read: open the free guide", "Reader"],
            ["Save books into collections", "Collections"],
            ["Find friends and send messages", "Friends"],
          ].map(([title, dest]) => (
            <Row
              key={dest}
              title={title}
              onPress={() => navigation.navigate(dest)}
            />
          ))}
        </>
      ) : (
        <Txt style={{ lineHeight: 26 }}>
          {name === "Gift"
            ? "Gift codes are unavailable until a payment service is connected."
            : name === "Privacy"
              ? "iBook stores your account, saved books, collections, reading time, reviews, settings, messages and reel interactions in its PostgreSQL database. Published reels, captions and comments are public, including through shared links. Uploaded videos are stored by the service. Watch time, likes, saves and shares personalize page reels; reset watch history from the reels screen. Reports are reviewed by appointed moderators. Your display name, bio, and published reviews are visible to other readers. Your library and collections are private. Passwords are stored as salted hashes. Messages are accessible to their participants and the service operator; they are not end-to-end encrypted. No card details are collected."
              : "Use the free reading guide and organize catalog titles in your library. Catalog entries do not grant access to the full copyrighted books. Publish reviews in your own words and respect other readers. Payments and paid memberships are unavailable. The service operator must publish applicable terms and contact details before a public launch."}
        </Txt>
      )}
    </Page>
  );
}
