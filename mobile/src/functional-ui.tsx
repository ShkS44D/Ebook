import React, { useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useStore } from "./store";
import { Button, FloatArt, Page, Txt } from "./ui";
export function useAction() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const run = async (work: () => Promise<any>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e: any) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return { error, busy, run, setError };
}
export function Feedback({ error, busy, message }: any) {
  return (
    <View accessibilityLiveRegion="polite" style={{ marginVertical: 12 }}>
      {busy && <ActivityIndicator color="#6952FF" />}
      {!!error && <Txt color="#C03845">{error}</Txt>}
      {!!message && <Txt color="#25805E">{message}</Txt>}
    </View>
  );
}
export function RequireAccount({ navigation, children }: any) {
  const { user } = useStore();
  return user ? (
    children
  ) : (
    <Page>
      <FloatArt name="logo" size={150} />
      <Txt bold size={24} style={{ marginVertical: 24 }}>
        Make this library yours
      </Txt>
      <Txt style={{ marginBottom: 24 }}>
        Sign in to save books, build collections, and connect with readers.
      </Txt>
      <Button title="Sign In" onPress={() => navigation.navigate("SignIn")} />
      <Button
        title="Create account"
        secondary
        style={{ marginTop: 12 }}
        onPress={() => navigation.navigate("SignUp")}
      />
    </Page>
  );
}
export function Empty({ text }: any) {
  return <Txt style={{ paddingVertical: 25 }}>{text}</Txt>;
}
