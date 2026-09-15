import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import {
  GlassView,
  isLiquidGlassAvailable,
  isGlassEffectAPIAvailable,
} from "expo-glass-effect";
import { art } from "./assets";
import { Book, purple } from "./data";
export const ThemeContext = createContext({
  dark: false,
  setDark: (_v: boolean) => {},
});
export function useTheme() {
  const { dark, setDark } = useContext(ThemeContext);
  return {
    dark,
    setDark,
    bg: dark ? "#111111" : "#FFFFFF",
    card: dark ? "#282828" : "#F5F5F8",
    ink: dark ? "#E4E2EB" : "#41414F",
    muted: dark ? "#9995A6" : "#9C99AA",
    heading: dark ? purple : "#41414F",
    line: dark ? "#37343F" : "#ECEBF1",
  };
}
export function Txt({
  children,
  size = 14,
  bold = false,
  color,
  style,
  ...rest
}: any) {
  const t = useTheme();
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: bold ? "Poppins_600SemiBold" : "Poppins_400Regular",
          fontSize: size,
          color: color || t.ink,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Tap({
  children,
  onPress,
  style,
  label,
  onLongPress,
  disabled = false,
}: any) {
  const v = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale: v }] }}>
      <Pressable
        disabled={disabled}
        accessibilityState={{ disabled }}
        accessibilityRole="button"
        accessibilityLabel={label}
        onLongPress={onLongPress}
        onPress={onPress}
        onPressIn={() =>
          Animated.spring(v, {
            toValue: 0.96,
            useNativeDriver: Platform.OS !== "web",
            speed: 40,
          }).start()
        }
        onPressOut={() =>
          Animated.spring(v, {
            toValue: 1,
            useNativeDriver: Platform.OS !== "web",
            speed: 30,
            bounciness: 8,
          }).start()
        }
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
export function Icon({
  name = "chevron-back",
  color = purple,
  size = 23,
}: any) {
  return <Ionicons name={name} size={size} color={color} />;
}
export function IconButton({ name, onPress, light = false, label }: any) {
  const t = useTheme();
  return (
    <Tap
      label={label || name}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 24,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: light ? "#00000020" : t.card,
      }}
    >
      <Icon name={name} color={light ? "white" : purple} />
    </Tap>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  icon,
  style,
  disabled = false,
}: any) {
  const t = useTheme();
  return (
    <Tap
      disabled={disabled}
      onPress={onPress}
      label={title}
      style={[
        {
          minHeight: 56,
          paddingVertical: 15,
          paddingHorizontal: 18,
          borderRadius: 18,
          backgroundColor: secondary ? t.card : purple,
          borderWidth: secondary ? 1 : 0,
          borderColor: secondary ? purple : "transparent",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 9,
        },
        style,
      ]}
    >
      {icon && (
        <Icon name={icon} size={20} color={secondary ? purple : "white"} />
      )}
      <Txt bold size={14} color={secondary ? purple : "white"}>
        {title}
      </Txt>
    </Tap>
  );
}
export function Page({
  children,
  purpleBg = false,
  scroll = true,
  style,
  bottom = 30,
}: any) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{ flex: 1, backgroundColor: purpleBg && !t.dark ? purple : t.bg }}
    >
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            {
              paddingTop: insets.top + 16,
              paddingBottom: insets.bottom + bottom,
              paddingHorizontal: 24,
              width: "100%",
              maxWidth: 860,
              alignSelf: "center",
              flexGrow: 1,
            },
            style,
          ]}
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            {
              flex: 1,
              paddingTop: insets.top + 16,
              paddingBottom: insets.bottom + bottom,
              paddingHorizontal: 24,
              width: "100%",
              maxWidth: 860,
              alignSelf: "center",
            },
            style,
          ]}
        >
          {children}
        </View>
      )}
    </View>
  );
}
export function Header({ navigation, title, right, light = false }: any) {
  return (
    <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <IconButton
          name="chevron-back"
          light={light}
          onPress={() =>
            navigation.canGoBack()
              ? navigation.goBack()
              : navigation.navigate("Main")
          }
          label="Back"
        />
        <View style={{ flexDirection: "row", gap: 10 }}>{right}</View>
      </View>
      {title && <Title light={light}>{title}</Title>}
    </>
  );
}
export function Title({ children, light = false }: any) {
  const t = useTheme();
  return (
    <Txt
      size={30}
      bold
      color={light ? "white" : t.heading}
      style={{ marginBottom: 12 }}
    >
      {children}
    </Txt>
  );
}
export function Section({ title, children, light = false, right }: any) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 24 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <Txt bold size={15} color={light ? "white" : t.heading}>
          {title}
        </Txt>
        {right}
      </View>
      {children}
    </View>
  );
}
export const borderlessInputStyle = {
  borderWidth: 0,
  ...(Platform.OS === 'web' ? { outlineStyle: 'none', boxShadow: 'none' } as any : {}),
};
export function Field({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  icon,
  autoFocus = false,
  multiline = false,
  maxLength,
}: any) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  const [hide, setHide] = useState(true);
  return (
    <View style={{ marginBottom: 22 }}>
      {label && (
        <Txt size={13} color={t.muted} style={{ marginBottom: 7 }}>
          {label}
        </Txt>
      )}
      <View
        style={{
          borderWidth: 0,
          borderRadius: 18,
          backgroundColor: focus ? (t.dark ? "#33313B" : t.card) : (t.dark ? t.card : t.bg),
          minHeight: 56,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
        }}
      >
        {icon && <Icon name={icon} size={20} />}
        <TextInput
          underlineColorAndroid="transparent"
          accessibilityLabel={label || placeholder}
          autoFocus={autoFocus}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={t.muted}
          secureTextEntry={secureTextEntry && hide}
          keyboardType={keyboardType}
          autoCapitalize="none"
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          multiline={multiline}
          maxLength={maxLength}
          style={{
            flex: 1,
            paddingVertical: 15,
            paddingHorizontal: icon ? 10 : 0,
            fontFamily: "Poppins_400Regular",
            fontSize: 14,
            color: t.ink,
            ...borderlessInputStyle,
          }}
        />
        {secureTextEntry && (
          <IconButton
            name={hide ? "eye-off-outline" : "eye-outline"}
            onPress={() => setHide(!hide)}
            label="Toggle password visibility"
          />
        )}
      </View>
    </View>
  );
}
export function Avatar({ index = 0, size = 46, source, ring = false }: any) {
  return (
    <View
      style={{
        padding: ring ? 4 : 0,
        borderWidth: ring ? 3 : 0,
        borderColor: purple,
        borderRadius: size,
        alignSelf: "flex-start",
      }}
    >
      <Image
        source={source || art[`avatar${index % 5}` as keyof typeof art]}
        style={{ width: size, height: size, borderRadius: size }}
      />
    </View>
  );
}
export function BookRow({
  book,
  onPress,
  onMore,
  selected,
  selectable = false,
}: {
  book: Book;
  onPress: () => void;
  onMore?: () => void;
  selected?: boolean;
  selectable?: boolean;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 13,
        alignItems: "center",
        marginBottom: 22,
      }}
    >
      {selectable && (
        <Tap onPress={onMore || onPress} label={"Select " + book.title}>
          <Icon
            name={selected ? "checkmark-circle" : "ellipse-outline"}
            size={23}
          />
        </Tap>
      )}
      <Tap onPress={onPress} label={book.title}>
        <BookCover book={book} />
      </Tap>
      <Pressable onPress={onPress} style={{ flex: 1 }}>
        <Txt bold size={14}>
          {book.title}
        </Txt>
        <Txt size={11} color={t.muted}>
          By {book.author}
        </Txt>
        <View
          style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}
        >
          <Icon name="eye-outline" size={15} />
          <Txt size={11} color={t.muted}>
            {" "}
            {"category" in book ? String(book.category) : "Book"}
          </Txt>
        </View>
        {"available" in book && (
          <Txt size={11} color={purple}>
            {book.available ? "Read free" : ('provider' in book && book.provider === 'gutenberg') ? ('import_status' in book && ['queued','review','parsing','downloading'].includes(String(book.import_status)) ? 'Being prepared' : 'Available to prepare') : "Reading list only"}
          </Txt>
        )}
      </Pressable>
      {onMore && !selectable && (
        <Tap
          label={"Options for " + book.title}
          onPress={onMore}
          style={{ padding: 7 }}
        >
          <Icon name="ellipsis-vertical" size={19} color={t.muted} />
        </Tap>
      )}
    </View>
  );
}
export function BookCover({ book, large = false }: any) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[book.id,book.cover_url]);
  const width = large ? 170 : 78;
  const height = large ? 240 : 110;
  if (book.id === "reading-guide")
    return (
      <View
        style={{
          width,
          height,
          backgroundColor: "#47329E",
          borderRadius: 9,
          padding: large ? 18 : 9,
          justifyContent: "space-between",
          borderLeftWidth: 5,
          borderLeftColor: "#A798EF",
        }}
      >
        <Txt size={large ? 12 : 7} color="#DCD4FF">
          THE iBOOK SERIES
        </Txt>
        <Txt size={large ? 24 : 12} bold color="white">
          A Small Guide to Reading
        </Txt>
        <Txt size={large ? 11 : 7} color="#DCD4FF">
          ONE PAGE AT A TIME
        </Txt>
      </View>
    );
  return <View style={{width,height,borderRadius:9,overflow:'hidden',backgroundColor:'#47329E',padding:large?18:9,justifyContent:'space-between'}}><Txt size={large?11:7} color="#DCD4FF">iBOOK CLASSICS</Txt><Txt bold size={large?22:12} color="white" numberOfLines={5}>{book.title}</Txt><Txt size={large?10:7} color="#DCD4FF" numberOfLines={2}>{book.author}</Txt>
    {!!book.image&&!failed&&<Image source={book.image} onError={()=>setFailed(true)} style={{position:'absolute',top:0,left:0,width,height,borderRadius:9}}/>}
  </View>;
}
export function Card({ children, style }: any) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.dark ? t.card : "white",
          borderRadius: 28,
          padding: 20,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Art({ name, size = 200, style }: any) {
  const t = useTheme();
  const key = (name + "-" + (t.dark ? "dark" : "light")) as keyof typeof art;
  return (
    <Image
      source={art[key] || art[name as keyof typeof art]}
      resizeMode="contain"
      style={[
        { width: size, maxWidth: "100%", height: size, alignSelf: "center" },
        style,
      ]}
    />
  );
}
export function FloatArt({ name, size = 200 }: any) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation;
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!reduce && active) {
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(y, {
              toValue: -8,
              duration: 1800,
              useNativeDriver: Platform.OS !== "web",
            }),
            Animated.timing(y, {
              toValue: 0,
              duration: 1800,
              useNativeDriver: Platform.OS !== "web",
            }),
          ]),
        );
        loop.start();
      }
    });
    return () => {
      active = false;
      loop?.stop();
    };
  }, []);
  return (
    <Animated.View
      style={{
        transform: [{ translateY: y }],
        alignSelf: "center",
        maxWidth: "100%",
      }}
    >
      <Art name={name} size={size} />
    </Animated.View>
  );
}
export function Glass({ children, style, dark }: any) {
  const t = useTheme();
  const isDark = dark ?? t.dark;
  if (
    Platform.OS === "ios" &&
    isLiquidGlassAvailable() &&
    isGlassEffectAPIAvailable()
  )
    return (
      <GlassView glassEffectStyle="regular" colorScheme={isDark ? "dark" : "light"} style={style}>
        {children}
      </GlassView>
    );
  return (
    <BlurView
      intensity={65}
      tint={isDark ? "dark" : "light"}
      style={[
        {
          backgroundColor: isDark ? "#282828E8" : "#FFFFFFE8",
          overflow: "hidden",
          borderWidth: 1,
          borderColor: isDark ? "#FFFFFF20" : "#FFFFFFBB",
        },
        style,
      ]}
    >
      {children}
    </BlurView>
  );
}
export function Row({
  title,
  icon = "chevron-forward",
  onPress,
  trailing,
  color,
}: any) {
  const t = useTheme();
  return (
    <Tap
      onPress={onPress}
      label={title}
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: 59,
        borderBottomWidth: 1,
        borderColor: t.line,
        gap: 16,
      }}
    >
      <Icon name={icon} />
      <Txt bold size={14} color={color} style={{ flex: 1 }}>
        {title}
      </Txt>
      {trailing || <Icon name="chevron-forward" size={17} color={t.muted} />}
    </Tap>
  );
}

export function ModalBackdrop({ children, style }: any) {
  return (
    <View style={[{ flex: 1 }, style]}>
      <BlurView
        intensity={35}
        tint="dark"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}
