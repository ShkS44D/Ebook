import { useStore, api } from "./store";
import { Feedback, useAction } from "./functional-ui";
import React, { useEffect, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  View,
  useWindowDimensions,
} from "react-native";
import { art } from "./assets";
import { purple } from "./data";
import {
  Button,
  Field,
  FloatArt,
  Header,
  Icon,
  Page,
  Tap,
  Title,
  Txt,
  useTheme,
} from "./ui";
export function Splash({ navigation }: any) {
  const store = useStore();
  useEffect(() => {
    const id = setTimeout(
      () => navigation.replace(store.user ? "Main" : "Onboarding"),
      1600,
    );
    return () => clearTimeout(id);
  }, [store.user]);
  return (
    <Page scroll={false}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <FloatArt name="logo" size={155} />
        <Txt bold color={purple} size={36}>
          iBook
        </Txt>
      </View>
      <Txt color={purple} style={{ textAlign: "center" }}>
        Where every page is an adventure
      </Txt>
      <Txt size={12} style={{ textAlign: "center", marginTop: 9 }}>
        App version 1.24.0
      </Txt>
    </Page>
  );
}
export function Onboarding({ navigation }: any) {
  const [step, setStep] = useState(0);
  const t = useTheme();
  const { height, width } = useWindowDimensions();
  return (
    <Page>
      <View
        style={{
          flexDirection: "row",
          gap: 12,
          marginTop: 16,
          marginBottom: 24,
        }}
      >
        {[0, 1, 2].map((i) => (
          <Tap
            key={i}
            label={"Onboarding " + (i + 1)}
            onPress={() => setStep(i)}
            style={{
              width: Math.min((width - 72) / 3, 245),
              height: 4,
              borderRadius: 4,
              backgroundColor: i <= step ? purple : t.line,
            }}
          />
        ))}
      </View>
      <Image
        source={
          art[`onboard${step + 1}${t.dark ? "-dark" : ""}` as keyof typeof art]
        }
        style={{
          width: "100%",
          height: Math.min(height * 0.47, 480),
          marginBottom: 32,
        }}
        resizeMode="contain"
      />
      <Title>
        {
          [
            "Track your daily\nprogress",
            "Challenge with\nFriends",
            "Join the Weekly\nChallenge",
          ][step]
        }
      </Title>
      <Txt
        size={15}
        color={t.muted}
        style={{ lineHeight: 25, marginBottom: 36 }}
      >
        {step === 0
          ? "Save your progress in one application, and track your reading journey."
          : "Let’s start the week with a challenge with your best friends"}
      </Txt>
      <View style={{ flex: 1 }} />
      <Button
        title="Get Started"
        onPress={() =>
          step < 2 ? setStep(step + 1) : navigation.replace("SignIn")
        }
      />
      <Tap
        onPress={() => navigation.replace("Main")}
        style={{ paddingTop: 18, alignItems: "center" }}
      >
        <Txt color={purple} size={12}>
          Explore the app
        </Txt>
      </Tap>
    </Page>
  );
}
export function Auth({ navigation, route }: any) {
  const signup = route.name === "SignUp";
  const store = useStore(),
    action = useAction();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState("");
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Page>
        <Header navigation={navigation} />
        <Title>{signup ? "Create your account" : "Welcome back"}</Title>
        <Txt style={{ marginBottom: 30 }}>
          Your books, progress, and conversations in one place.
        </Txt>
        {signup && (
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            maxLength={80}
          />
        )}
        <Field
          label="Email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Field
          label="Password"
          placeholder="At least 10 characters"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Feedback {...action} />
        <Button
          title={
            action.busy ? "Please wait…" : signup ? "Sign Up Now" : "Sign In"
          }
          disabled={action.busy}
          onPress={() =>
            action.run(async () => {
              await store.login(signup, {
                email,
                password,
                ...(signup ? { name } : {}),
              });
              navigation.reset({ index: 0, routes: [{ name: "Main" }] });
            })
          }
        />
        <Button
          title={signup ? "Already have an account? Sign In" : "Create account"}
          secondary
          style={{ marginTop: 16 }}
          onPress={() => navigation.replace(signup ? "SignIn" : "SignUp")}
        />
        {!signup && (
          <Button
            title="Forgot password?"
            secondary
            style={{ marginTop: 16 }}
            onPress={() => navigation.navigate("Forgot")}
          />
        )}
      </Page>
    </KeyboardAvoidingView>
  );
}
export function Forgot({ navigation }: any) {
  const [email, setEmail] = useState(""),
    [message, setMessage] = useState("");
  const action = useAction();
  return (
    <Page>
      <Header navigation={navigation} title="Reset password" />
      <Txt style={{ marginBottom: 24 }}>
        Password reset requires the app owner to configure email delivery. No
        reset message will be sent until that service is connected.
      </Txt>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />
      <Feedback {...action} message={message} />
      <Button
        title="Request reset code"
        disabled={action.busy}
        onPress={() =>
          action.run(async () => {
            const r = await api("/auth/forgot", "POST", { email });
            setMessage(r.message);
          })
        }
      />
      <Button
        title="I have a reset code"
        secondary
        style={{ marginTop: 16 }}
        onPress={() => navigation.navigate("Verification")}
      />
    </Page>
  );
}
export function Verification({ navigation }: any) {
  const [token, setToken] = useState(""),
    [password, setPassword] = useState("");
  const action = useAction();
  return (
    <Page>
      <Header navigation={navigation} title="Set a new password" />
      <Field label="Reset code" value={token} onChangeText={setToken} />
      <Field
        label="New password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Feedback {...action} />
      <Button
        title="Reset password"
        disabled={action.busy}
        onPress={() =>
          action.run(async () => {
            await api("/auth/reset", "POST", { token: token.trim(), password });
            navigation.replace("SignIn");
          })
        }
      />
    </Page>
  );
}
