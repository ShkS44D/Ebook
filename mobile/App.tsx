import { StoreProvider, useStore } from "./src/store";
import {
  AddReel,
  ReelsScreen,
  ReelScreen,
  ReelComments,
  ReelModeration,
  ModeratorReel,
} from "./src/reels";
import "react-native-gesture-handler";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
const Poppins_400Regular = require("@expo-google-fonts/poppins/400Regular/Poppins_400Regular.ttf");
const Poppins_600SemiBold = require("@expo-google-fonts/poppins/600SemiBold/Poppins_600SemiBold.ttf");
import {
  Glass,
  Button,
  Header,
  Icon,
  Page,
  Row,
  Section,
  Tap,
  ThemeContext,
  Txt,
  useTheme,
} from "./src/ui";
import { purple } from "./src/data";
import { Home, Library, Store, Search, Category } from "./src/main-screens";
import {
  Splash,
  Onboarding,
  Auth,
  Forgot,
  Verification,
} from "./src/auth-screens";
import {
  BookScreen,
  Reading,
  Reader,
  WriteReview,
  BookActions,
  SaveCollection,
  Share,
  Popup,
  Purchase,
  PaymentMethods,
  AddPayment,
  AppStore,
  Download,
} from "./src/book-screens";
import {
  Collections,
  Collection,
  CollectionList,
  NewCollection,
  AddBooks,
  DeleteCollection,
} from "./src/collection-screens";
import {
  Friends,
  Invite,
  Discover,
  FriendSearch,
  Chat,
} from "./src/social-screens";
import {
  Profile,
  Author,
  Membership,
  ProfileMenu,
  FriendActions,
  Settings,
  EditProfile,
  GoalsScreen,
  GoalPicker,
  Notifications,
  Info,
} from "./src/profile-screens";
const Stack = createNativeStackNavigator<any>();
const Tabs = createBottomTabNavigator<any>();
function TabBar({ state, navigation }: any) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: "absolute",
        left: 28,
        right: 28,
        bottom: Math.max(insets.bottom, 16),
        alignItems: "center",
      }}
    >
      <Glass
        style={{
          flexDirection: "row",
          borderRadius: 40,
          padding: 7,
          width: "100%",
          maxWidth: 560,
          shadowColor: "#4A378A",
          shadowOpacity: 0.14,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 7 },
          elevation: 10,
        }}
      >
        {state.routes.map((r: any, i: number) => (
          <View key={r.key} style={{ flex: 1 }}>
            <Tap
              label={r.name + " tab"}
              onPress={() => {
                const e = navigation.emit({
                  type: "tabPress",
                  target: r.key,
                  canPreventDefault: true,
                });
                if (!e.defaultPrevented) navigation.navigate(r.name);
              }}
              style={{
                alignItems: "center",
                justifyContent: "center",
                height: 54,
                borderRadius: 30,
                backgroundColor:
                  state.index === i ? "#6952FF19" : "transparent",
              }}
            >
              <Icon
                name={
                  [
                    "home-outline",
                    "book-outline",
                    "bag-outline",
                    "search-outline",
                  ][i]
                }
                color={state.index === i ? purple : t.muted}
                size={24}
              />
              {state.index === i && (
                <View
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: purple,
                    marginTop: 4,
                  }}
                />
              )}
            </Tap>
          </View>
        ))}
      </Glass>
    </View>
  );
}
function Main() {
  return (
    <Tabs.Navigator
      tabBar={(p) => <TabBar {...p} />}
      screenOptions={{ headerShown: false, animation: "fade" }}
    >
      <Tabs.Screen name="Home" component={Home} />
      <Tabs.Screen name="Library" component={Library} />
      <Tabs.Screen name="Store" component={Store} />
      <Tabs.Screen name="Search" component={Search} />
    </Tabs.Navigator>
  );
}
const screens: any = {
  Reels: ReelsScreen,
  Reel: ReelScreen,
  AddReel,
  ReelComments,
  ReelModeration,
  ModeratorReel,
  Main,

  Splash,
  Onboarding,
  SignIn: Auth,
  SignUp: Auth,
  Forgot,
  Verification,
  Category,
  Book: BookScreen,
  Reading,
  Reader,
  WriteReview,
  BookActions,
  SaveCollection,
  Share,
  Purchase,
  PaymentMethods,
  AddPayment,
  AppStore,
  Download,
  Collections,
  Collection,
  CollectionList,
  NewCollection,
  AddBooks,
  Friends,
  Invite,
  Discover,
  FriendSearch,
  Chat,
  Profile,
  FriendProfile: Profile,
  Author,
  Membership,
  Settings,
  EditProfile,
  Goals: GoalsScreen,
  Notifications,
  Gift: Info,
  Help: Info,
  Terms: Info,
  Privacy: Info,
};
const appLinks: any = {
  prefixes: ["ibook://"],
  config: {
    screens: {
      Main: {
        screens: {
          Home: "home",
          Library: "library",
          Store: "store",
          Search: "search",
        },
      },
      Settings: "settings",
      Reader: "reader/:bookId?",
      Reel: "reels/:reelId",
      Reels: "page-reels/:bookId/:page",
      ReelModeration: "reel-moderation",
      Book: "book/:bookId?",
      Onboarding: "onboarding",
      Profile: "profile",
      Collections: "collections",
      Friends: "friends",
      SignIn: "signin",
      Purchase: "purchase",
    },
  },
};
function AppContent() {
  const store = useStore();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(store.user?.dark || false);
  }, [store.user?.dark]);
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
  });
  if (!store.ready || (!fontsLoaded && !fontError))
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={purple} />
      </View>
    );
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeContext.Provider value={{ dark, setDark }}>
          <StatusBar style={dark ? "light" : "dark"} />
          {store.error ? (
            <Page>
              <TitleFallback />
              <Txt>{store.error}</Txt>
              <Button title="Try again" onPress={store.retry} />
            </Page>
          ) : (
            <NavigationContainer
              theme={dark ? DarkTheme : DefaultTheme}
              linking={appLinks}
            >
              <Stack.Navigator
                initialRouteName={store.user ? "Main" : "Onboarding"}
                screenOptions={{
                  headerShown: false,
                  animation: "slide_from_right",
                  contentStyle: { backgroundColor: dark ? "#111" : "white" },
                  gestureEnabled: true,
                }}
              >
                {Object.entries(screens).map(([name, component]) => (
                  <Stack.Screen
                    key={name}
                    name={name}
                    component={component as any}
                  />
                ))}
                {Object.entries({
                  Popup,
                  DeleteCollection,
                  ProfileMenu,
                  FriendActions,
                  GoalPicker,
                }).map(([name, component]) => (
                  <Stack.Screen
                    key={name}
                    name={name}
                    component={component}
                    options={{
                      presentation: "transparentModal",
                      animation: "fade",
                      contentStyle: { backgroundColor: "transparent" },
                    }}
                  />
                ))}
              </Stack.Navigator>
            </NavigationContainer>
          )}
        </ThemeContext.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
function TitleFallback() {
  return (
    <Txt size={26} bold style={{ marginVertical: 24 }}>
      Unable to connect
    </Txt>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}
