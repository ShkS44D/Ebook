import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Linking,
  Platform,
  ScrollView,
  Share,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useVideoPlayer, VideoView } from "expo-video";
import * as DocumentPicker from "expo-document-picker";
import { File } from 'expo-file-system';
import { LinearGradient } from "expo-linear-gradient";
import { api, apiBase, useStore } from "./store";
import {
  Button,
  Card,
  Field,
  Header,
  Icon,
  Page,
  Section,
  Tap,
  Txt,
} from "./ui";
import { Empty, Feedback, RequireAccount, useAction } from "./functional-ui";

type Reel = {
  id: string;
  book_id: string;
  page: number;
  chapter_id?: string;
  start_offset?: number;
  end_offset?: number;
  reel_scope?: 'passage' | 'chapter' | 'book';
  status?: string;
  book_title: string;
  title: string;
  caption: string;
  creator_id: string | null;
  creator_name: string;
  attribution: string;
  license: string;
  source_url: string;
  playback_url: string | null;
  external_url: string | null;
  duration_seconds: number;
  tags: string[];
  liked: boolean;
  saved: boolean;
  likes: number;
  reason?: string;
};
const gap = { gap: 10, marginVertical: 12 };
const wrap = {
  flexDirection: "row" as const,
  flexWrap: "wrap" as const,
  gap: 8,
};
const pagePath = (bookId: string, page: number, startOffset = 0, endOffset = startOffset) =>
  `/page-reels/${encodeURIComponent(bookId)}/${page}?startOffset=${startOffset}&endOffset=${endOffset}`;

export function PageReels({ bookId, page, startOffset = 0, endOffset = startOffset, navigation }: any) {
  const [items, setItems] = useState<Reel[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setError("");
      setItems([]);
      api(pagePath(bookId, page, startOffset, endOffset) + "&mode=page")
        .then((data) => {
          if (active) setItems(data.items);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [bookId, page, startOffset, endOffset, reload]),
  );
  return (
    <Section title="See this page come alive">
      <Txt style={{ marginBottom: 14 }}>
        Watch a perspective connected to this passage.
      </Txt>
      <Feedback error={error} busy={loading} />
      {error && (
        <Button
          title="Retry reels"
          secondary
          onPress={() => setReload((n) => n + 1)}
        />
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
      >
        {items.slice(0, 6).map((r, i) => (
          <Tap
            key={r.id}
            label={"Watch " + r.title}
            onPress={() =>
              navigation.navigate("Reels", { bookId, page, startOffset, endOffset, startId: r.id })
            }
          >
            <LinearGradient
              colors={i % 2 ? ["#3E4A3F", "#16241C"] : ["#4A3B2A", "#221A10"]}
              style={{
                width: 190,
                height: 245,
                borderRadius: 22,
                padding: 18,
                justifyContent: "space-between",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Txt size={11} color="#F2ECDD">
                  PAGE {page + 1}
                </Txt>
                <Icon name="play-circle" color="white" size={32} />
              </View>
              <View>
                <Txt color="white" bold size={18}>
                  {r.title}
                </Txt>
                <Txt color="#E9E2D2" size={11} style={{ marginTop: 12 }}>
                  {r.creator_name}
                </Txt>
                <Txt color="#E9E2D2" size={11}>
                  {r.external_url
                    ? "External reel"
                    : `${Math.round(r.duration_seconds)} sec`}{" "}
                  · {r.creator_id ? "Editorial" : "iBook"}
                </Txt>
              </View>
            </LinearGradient>
          </Tap>
        ))}
      </ScrollView>
      {!loading && !error && !items.length && <Empty text="No published reel is attached to this passage yet." />}
      <View style={{ ...gap, marginBottom: 24 }}>
        <Button
          title="Explore page reels"
          icon="play-circle-outline"
          onPress={() => navigation.navigate("Reels", { bookId, page, startOffset, endOffset })}
        />
      </View>
    </Section>
  );
}

// Only the active reel mounts a player. Time is counted from playback deltas,
// excluding seeks, pauses and background time; the server applies its own caps.
function ReelPlayer({
  reel,
  authenticated,
}: {
  reel: Reel;
  authenticated: boolean;
}) {
  const focused = useIsFocused();
  const { height } = useWindowDimensions();
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const source = reel.playback_url?.startsWith("/")
    ? apiBase + reel.playback_url
    : reel.playback_url;
  const player = useVideoPlayer(source, (p) => {
    p.timeUpdateEventInterval = 1;
    p.loop = false;
  });
  useEffect(() => {
    let active = true,
      viewId = "",
      creating = false,
      seconds = 0,
      last = 0,
      sent = 0,
      pending = false;
    const visible = () =>
      AppState.currentState === "active" &&
      (Platform.OS !== "web" || document.visibilityState === "visible");
    const flush = async () => {
      if (!viewId || pending || seconds <= sent) return;
      pending = true;
      const total = Math.min(seconds, 90);
      try {
        await api("/reel-views/" + viewId, "PUT", { seconds: total });
        sent = total;
      } catch {
        /* Playback remains available if optional engagement telemetry fails. */
      } finally {
        pending = false;
      }
    };
    const playing = player.addListener("playingChange", ({ isPlaying }) => {
      last = player.currentTime;
      if (!isPlaying) {
        void flush();
        return;
      }
      if (!focused || !visible()) {
        player.pause();
        return;
      }
      if (authenticated && !viewId && !creating) {
        creating = true;
        api(`/reels/${reel.id}/view`, "POST", {})
          .then((data) => {
            viewId = data.viewId;
            if (!active) void flush();
          })
          .catch(() => {})
          .finally(() => {
            creating = false;
          });
      }
    });
    const time = player.addListener("timeUpdate", ({ currentTime }) => {
      const delta = currentTime - last;
      last = currentTime;
      if (player.playing && focused && visible() && delta > 0 && delta <= 2)
        seconds += delta;
      if (seconds - sent >= 5) void flush();
    });
    const ended = player.addListener("playToEnd", () => {
      void flush();
    });
    const status = player.addListener("statusChange", ({ status, error }) => {
      setLoading(status === "loading");
      if (status === "error")
        setError(
          error?.message || "This video is unavailable. Try another reel.",
        );
      if (status === "readyToPlay") setError("");
    });
    const pause = () => {
      if (!visible()) {
        player.pause();
        void flush();
      }
    };
    const appState = AppState.addEventListener("change", pause);
    if (Platform.OS === "web")
      document.addEventListener("visibilitychange", pause);
    if (!focused) player.pause();
    setLoading(player.status === "loading");
    return () => {
      active = false;
      void flush();
      playing.remove();
      time.remove();
      ended.remove();
      status.remove();
      appState.remove();
      if (Platform.OS === "web")
        document.removeEventListener("visibilitychange", pause);
    };
  }, [player, reel.id, authenticated, focused]);
  return (
    <View>
      <View
        style={{
          borderRadius: 22,
          overflow: "hidden",
          backgroundColor: "#15111E",
          marginVertical: 12,
        }}
      >
        <VideoView
          player={player}
          nativeControls
          contentFit="contain"
          fullscreenOptions={{ enable: true }}
          style={{ width: "100%", height: Math.min(480, height * 0.52) }}
        />
      </View>
      <Feedback busy={loading} error={error} />
      <Button
        title="Play video"
        icon="play"
        secondary
        onPress={() => {
          if (focused) player.play();
        }}
      />
    </View>
  );
}

function ReelContent({
  initial,
  navigation,
  onRemove,
}: {
  initial: Reel;
  navigation: any;
  onRemove: () => void;
}) {
  const { user } = useStore(),
    action = useAction();
  const focused = useIsFocused();
  const [reel, setReel] = useState(initial),
    [options, setOptions] = useState(false),
    [reporting, setReporting] = useState(false),
    [deleting, setDeleting] = useState(false),
    [message, setMessage] = useState("");
  async function reaction(key: "liked" | "saved") {
    if (!user) {
      navigation.navigate("SignIn");
      return;
    }
    await api(`/reels/${reel.id}/reaction`, "PUT", { [key]: !reel[key] });
    setReel((r) => ({
      ...r,
      [key]: !r[key],
      likes:
        key === "liked" ? Number(r.likes || 0) + (r.liked ? -1 : 1) : r.likes,
    }));
  }
  async function share(copyOnly = false) {
    const base =
      process.env.EXPO_PUBLIC_WEB_URL ||
      (Platform.OS === "web" ? window.location.origin : "");
    const url = base
      ? `${base.replace(/\/$/, "")}/reels/${reel.id}`
      : `ibook://reels/${reel.id}`;
    const text = `${reel.title} — ${reel.book_title}`;
    if (Platform.OS === "web") {
      if (navigator.share && !copyOnly)
        await navigator.share({ title: reel.title, text, url });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setMessage("Reel link copied.");
      }
    } else {
      const result = await Share.share({ message: `${text}\n${url}` });
      if (result.action === Share.dismissedAction) return;
    }
    if (user) await api(`/reels/${reel.id}/reaction`, "PUT", { shared: true });
  }
  return (
    <View>
      <Txt size={12} color="#8A8273">
        {reel.reason || "Shared for this page"}
      </Txt>
      <Txt size={23} bold style={{ marginTop: 6 }}>
        {reel.title}
      </Txt>
      <Txt size={12} style={{ marginTop: 6 }}>
        {reel.creator_name} · Page {reel.page + 1}
      </Txt>
      {reel.external_url ? (
        <Card style={{ backgroundColor: "#EFECE4", marginVertical: 16 }}>
          <Txt color="#3A322A">
            This creator’s reel plays on its original platform.
          </Txt>
          <Button
            style={{ marginTop: 12 }}
            title="Open original reel"
            onPress={() =>
              action.run(() => Linking.openURL(reel.external_url!))
            }
          />
        </Card>
      ) : (
        focused && <ReelPlayer reel={reel} authenticated={!!user} />
      )}
      <Txt style={{ lineHeight: 24, marginVertical: 16 }}>{reel.caption}</Txt>
      <View style={wrap}>
        {reel.tags.map((tag) => (
          <Txt key={tag} size={12} color="#8A8273">
            #{tag}
          </Txt>
        ))}
      </View>
      <Feedback {...action} message={message} />
      <View style={wrap}>
        <Button
          title={`${reel.liked ? "Liked" : "Like"} · ${reel.likes || 0}`}
          secondary={!reel.liked}
          icon={reel.liked ? "heart" : "heart-outline"}
          disabled={action.busy}
          onPress={() => action.run(() => reaction("liked"))}
        />
        <Button
          title={reel.saved ? "Saved" : "Save"}
          secondary={!reel.saved}
          icon="bookmark-outline"
          disabled={action.busy}
          onPress={() => action.run(() => reaction("saved"))}
        />
        <Button
          title="Share reel"
          secondary
          icon="share-outline"
          disabled={action.busy}
          onPress={() => action.run(() => share())}
        />
        {Platform.OS === "web" && (
          <Button
            title="Copy reel link"
            secondary
            disabled={action.busy}
            onPress={() => action.run(() => share(true))}
          />
        )}
        <Button title="More" secondary onPress={() => setOptions(!options)} />
      </View>
      {options && (
        <Card style={{ marginTop: 16 }}>
          <Txt size={12}>{reel.attribution}</Txt>
          <Txt size={11} style={{ marginVertical: 8 }}>
            {reel.license}
          </Txt>
          {!!reel.source_url && (
            <Button
              title="View source and creator"
              secondary
              onPress={() => action.run(() => Linking.openURL(reel.source_url))}
            />
          )}
          {!!user && (
            <View style={gap}>
              <Button
                title="Not interested"
                secondary
                disabled={action.busy}
                onPress={() =>
                  action.run(async () => {
                    await api(`/reels/${reel.id}/reaction`, "PUT", {
                      hidden: true,
                    });
                    onRemove();
                  })
                }
              />
              <Button
                title="Report reel"
                secondary
                onPress={() => setReporting(!reporting)}
              />
              {reporting &&
                [
                  "Unrelated to page",
                  "Spoilers",
                  "Copyright",
                  "Harassment or unsafe content",
                  "Spam",
                ].map((reason) => (
                  <Button
                    key={reason}
                    title={reason}
                    secondary
                    disabled={action.busy}
                    onPress={() =>
                      action.run(async () => {
                        await api(`/reels/${reel.id}/report`, "POST", {
                          reason,
                        });
                        onRemove();
                      })
                    }
                  />
                ))}
              {reel.creator_id === user.id && (
                <Button
                  title="Delete my reel"
                  secondary
                  onPress={() => setDeleting(true)}
                />
              )}
              {deleting && (
                <>
                  <Txt>Delete this reel and its comments permanently?</Txt>
                  <Button
                    title="Confirm delete reel"
                    disabled={action.busy}
                    onPress={() =>
                      action.run(async () => {
                        await api(`/reels/${reel.id}`, "DELETE");
                        onRemove();
                      })
                    }
                  />
                  <Button
                    title="Keep reel"
                    secondary
                    onPress={() => setDeleting(false)}
                  />
                </>
              )}
            </View>
          )}
        </Card>
      )}
      <Button
        title="Read the linked passage"
        secondary
        style={{ marginTop: 20 }}
        onPress={() =>
          navigation.navigate("Reader", {
            bookId: reel.book_id,
            page: reel.page,
            offset: reel.start_offset || 0,
          })
        }
      />
    </View>
  );
}

export function ReelsScreen({ navigation, route }: any) {
  const bookId = route.params?.bookId || "reading-guide",
    page = Number(route.params?.page || 0),
    startOffset = Number(route.params?.startOffset || 0),
    endOffset = Number(route.params?.endOffset || startOffset);
  const [mode, setMode] = useState("for-you"),
    [items, setItems] = useState<Reel[]>([]),
    [index, setIndex] = useState(0),
    [hasMore, setHasMore] = useState(false),
    [title, setTitle] = useState(""),
    [reset, setReset] = useState(false),
    [reload, setReload] = useState(0);
  const action = useAction();
  const loadSequence = useRef(0);
  const activeReelId = useRef(route.params?.startId);
  const [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState("");
  const busy = action.busy || loading;
  useFocusEffect(
    useCallback(() => {
      const sequence = ++loadSequence.current;
      setLoading(true);
      setLoadError("");
      api(pagePath(bookId, page, startOffset, endOffset) + "&mode=" + mode)
        .then((data) => {
          if (sequence !== loadSequence.current) return;
          setItems(data.items);
          setIndex(
            Math.max(
              0,
              data.items.findIndex((r: Reel) => r.id === activeReelId.current),
            ),
          );
          setHasMore(data.hasMore);
          setTitle(data.pageTitle);
        })
        .catch((error) => {
          if (sequence === loadSequence.current) setLoadError(error.message);
        })
        .finally(() => {
          if (sequence === loadSequence.current) setLoading(false);
        });
      return () => {
        loadSequence.current++;
      };
    }, [bookId, page, startOffset, endOffset, mode, reload]),
  );
  async function next() {
    if (index < items.length - 1) {
      setIndex(index + 1);
      return;
    }
    if (!hasMore || items.length >= 100) return;
    const data = await api(
      pagePath(bookId, page, startOffset, endOffset) +
        `&mode=${mode}&exclude=${items.map((r) => r.id).join(",")}`,
    );
    const fresh = data.items
      .filter((r: Reel) => !items.some((x) => x.id === r.id))
      .slice(0, 100 - items.length);
    setItems((old) => [...old, ...fresh]);
    setHasMore(
      data.hasMore && fresh.length > 0 && items.length + fresh.length < 100,
    );
    if (fresh.length) setIndex(items.length);
  }
  const current = items[index];
  if (current) activeReelId.current = current.id;
  return (
    <RequireAccount navigation={navigation}>
      <Page key={current?.id || mode}>
        <Header navigation={navigation} title="Page reels" />
        <Txt style={{ marginBottom: 16 }}>
          Page {page + 1} · {title}
        </Txt>
        <View style={wrap}>
          {[
            ["for-you", "For you"],
            ["page", "This page"],
            ["saved", "Saved"],
          ].map(([value, label]) => (
            <Button
              key={value}
              title={label}
              secondary={mode !== value}
              disabled={busy}
              onPress={() => {
                if (mode === value) return;
                activeReelId.current = undefined;
                setItems([]);
                setMode(value);
              }}
            />
          ))}
        </View>
        <Feedback busy={busy} error={loadError || action.error} />
        {!!(loadError || action.error) && (
          <Button
            title="Retry feed"
            secondary
            onPress={() => setReload((n) => n + 1)}
          />
        )}
        {current && (
          <ReelContent
            key={current.id}
            initial={current}
            navigation={navigation}
            onRemove={() => {
              setItems((all) => all.filter((r) => r.id !== current.id));
              setIndex(0);
            }}
          />
        )}
        {!current && !busy && !action.error && !loadError && (
          <Empty
            text={
              mode === "saved"
                ? "No saved reels related to this page yet."
                : "You’re all caught up. Add a perspective of your own."
            }
          />
        )}
        <View style={{ ...wrap, marginVertical: 24 }}>
          <Button
            title="Previous reel"
            secondary
            disabled={index === 0 || busy}
            onPress={() => setIndex((n) => n - 1)}
          />
          <Button
            title="Next reel"
            disabled={busy || (!hasMore && index >= items.length - 1)}
            onPress={() => action.run(next)}
          />
        </View>
        <Section title="Made for this page">
          <Txt size={12}>
            Recommendations use page content, watch time, likes, saves and
            shares. New perspectives get a chance too.
          </Txt>
          <Button
            style={{ marginTop: 12 }}
            title="Reset watch history and hidden reels"
            secondary
            onPress={() => setReset(!reset)}
          />
          {reset && (
            <View style={gap}>
              <Txt>
                Your likes and saved reels will stay. Hidden reels will return.
              </Txt>
              <Button
                title="Confirm reset"
                disabled={action.busy}
                onPress={() =>
                  action.run(async () => {
                    await api("/reels/reset-preferences", "POST", {});
                    setReset(false);
                    setReload((n) => n + 1);
                  })
                }
              />
            </View>
          )}
        </Section>
      </Page>
    </RequireAccount>
  );
}

export function ReelScreen({ navigation, route }: any) {
  const { user } = useStore(),
    action = useAction();
  const [reel, setReel] = useState<Reel | null>(null),
    [reload, setReload] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      action.run(async () => {
        const data = await api(
          (user ? "/reels/" : "/reel-public/") +
            encodeURIComponent(route.params.reelId),
        );
        if (active) setReel(data);
      });
      return () => {
        active = false;
      };
    }, [route.params.reelId, user?.id, reload]),
  );
  return (
    <Page>
      <Header navigation={navigation} title="A page, brought to life" />
      <Feedback {...action} />
      {action.error && (
        <Button title="Retry reel" onPress={() => setReload((n) => n + 1)} />
      )}
      {reel && !action.error && (
        <ReelContent
          key={reel.id + String(reload)}
          initial={reel}
          navigation={navigation}
          onRemove={() => {
            setReel(null);
            navigation.navigate("Reels", {
              bookId: reel.book_id,
              page: reel.page,
            });
          }}
        />
      )}
    </Page>
  );
}

export function AddReel({ navigation, route }: any) {
  const action = useAction(), { user } = useStore();
  const bookId = route.params?.bookId || "reading-guide",
    page = Number(route.params?.page || 0),
    chapterId = route.params?.chapterId,
    startOffset = Number(route.params?.startOffset || 0),
    endOffset = Number(route.params?.endOffset || startOffset),
    passagePreview = String(route.params?.passagePreview || '');
  const [title, setTitle] = useState(""),
    [caption, setCaption] = useState(""),
    [tags, setTags] = useState(""),
    [externalUrl, setExternalUrl] = useState(""),
    [mode, setMode] = useState("upload"),
    [scope, setScope] = useState<'passage'|'chapter'|'book'>('passage'),
    [spoilerLevel, setSpoilerLevel] = useState<'none'|'through_current_passage'|'chapter_spoiler'|'book_spoiler'>('through_current_passage'),
    [rights, setRights] = useState(false),
    [media, setMedia] = useState<{ id: string; name: string } | null>(null),
    [pageTitle, setPageTitle] = useState("");
  const uploadId = useRef<string | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    api(`/books/${encodeURIComponent(bookId)}`)
      .then((b) => {
        if (mounted.current) setPageTitle(b.chapters?.[page]?.title || "");
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
      if (uploadId.current)
        void api("/reel-upload/" + uploadId.current, "DELETE").catch(() => {});
    };
  }, [bookId, page]);
  async function pick() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["video/mp4", "video/webm", "video/quicktime"],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const file = result.assets[0];
    if ((file.size || 0) > 50 * 1024 * 1024)
      throw new Error("Choose a video smaller than 50 MB.");
    const form = new FormData();
    if (Platform.OS === "web" && file.file) form.append("video", file.file);
    else
      form.append("video", {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || "video/mp4",
      } as any);
    const config = await api('/reel-upload-config');
    let data;
    if (config.provider === 'cloudinary') {
      const signed = await api('/reel-upload-token', 'POST', {});
      const cloudForm = new FormData();
      if (Platform.OS === 'web' && file.file) cloudForm.append('file', file.file);
      else cloudForm.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'video/mp4' } as any);
      Object.entries(signed.fields).forEach(([key, value]) => cloudForm.append(key, String(value)));
      const response = await fetch(signed.uploadUrl, { method: 'POST', body: cloudForm });
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.error?.message || 'Cloudinary could not upload this video.');
      }
      data = await api('/reel-upload-complete', 'POST', { id: signed.id });
    } else data = await api("/reel-upload", "POST", form);
    if (!mounted.current) {
      await api("/reel-upload/" + data.id, "DELETE");
      return;
    }
    const previous = uploadId.current;
    uploadId.current = data.id;
    setMedia({ id: data.id, name: file.name });
    if (previous) await api("/reel-upload/" + previous, "DELETE");
  }
  async function publish() {
    if (mode === "upload" && !media)
      throw new Error("Choose and upload a video first.");
    const data = await api("/reels", "POST", {
      bookId,
      page,
      chapterId,
      startOffset,
      endOffset,
      scope,
      spoilerLevel,
      title,
      caption,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      ...(mode === "upload"
        ? { mediaId: media!.id }
        : { externalUrl: externalUrl.trim() }),
      rightsConfirmed: rights,
    });
    await api(`/admin/reels/${data.id}/publish`, 'POST', {});
    if (mode === "upload") uploadId.current = null;
    navigation.replace("Reel", { reelId: data.id });
  }
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header navigation={navigation} title="Publish a passage reel" />
        {!user?.reel_admin ? <Empty text="This area is available to reel administrators." /> : <>
        <Txt style={{ marginBottom: 20 }}>
          Page {page + 1}
          {pageTitle ? ` · ${pageTitle}` : ""}
        </Txt>
        {!!passagePreview && <Card style={{marginBottom:18}}><Txt size={12} color="#8A8273">SELECTED PASSAGE</Txt><Txt numberOfLines={4} style={{marginTop:8,lineHeight:22}}>{passagePreview}</Txt></Card>}
        <Txt bold>Where should this reel appear?</Txt>
        <View style={{...wrap,marginVertical:12}}>
          {([['passage','This passage'],['chapter','This chapter'],['book','Whole book']] as const).map(([value,label])=><Button key={value} title={label} secondary={scope!==value} onPress={()=>setScope(value)}/>)}
        </View>
        <Txt bold>Spoiler label</Txt>
        <View style={{...wrap,marginVertical:12}}>
          {([['none','No spoilers'],['through_current_passage','Through this passage'],['chapter_spoiler','Chapter spoiler'],['book_spoiler','Book spoiler']] as const).map(([value,label])=><Button key={value} title={label} secondary={spoilerLevel!==value} onPress={()=>setSpoilerLevel(value)}/>)}
        </View>
        <View style={{ ...wrap, marginBottom: 20 }}>
          <Button
            title="Upload a clip"
            secondary={mode !== "upload"}
            disabled={action.busy}
            onPress={() => setMode("upload")}
          />
          <Button
            title="Share a reel link"
            secondary={mode !== "link"}
            disabled={action.busy}
            onPress={() => setMode("link")}
          />
        </View>
        {mode === "upload" ? (
          <View style={gap}>
            <Txt>MP4 or WebM · 1–90 seconds · up to 50 MB</Txt>
            <Button
              title={media ? "Choose a different video" : "Choose video"}
              secondary
              icon="videocam-outline"
              disabled={action.busy}
              onPress={() => action.run(pick)}
            />
            {media && <Txt>Uploaded: {media.name}</Txt>}
          </View>
        ) : (
          <>
            <Field
              label="Instagram, YouTube or Vimeo link"
              value={externalUrl}
              onChangeText={setExternalUrl}
              maxLength={1500}
            />
            <Txt style={{ marginBottom: 20 }}>
              Links open on their original platform. Upload a clip to play it
              here.
            </Txt>
          </>
        )}
        <Field
          label="Reel title"
          value={title}
          onChangeText={setTitle}
          maxLength={100}
        />
        <Field
          label="How does this relate to the page?"
          value={caption}
          onChangeText={setCaption}
          multiline
          maxLength={1200}
        />
        <Field
          label="Topics, separated by commas (up to 8)"
          value={tags}
          onChangeText={setTags}
          maxLength={247}
          placeholder="reading, focus, reflection"
        />
        <Button
          title={
            rights
              ? "✓ I own this clip or have permission to share it"
              : "I own this clip or have permission to share it"
          }
          secondary={!rights}
          onPress={() => setRights(!rights)}
        />
        <Txt size={12} style={{ marginTop: 14 }}>
          This reel will be reviewed against the selected passage and published publicly.
        </Txt>
        <Feedback {...action} />
        <Button
          title="Publish passage reel"
          disabled={
            action.busy ||
            !rights ||
            title.trim().length < 3 ||
            caption.trim().length < 10 ||
            (mode === "upload" && !media)
          }
          onPress={() => action.run(publish)}
        />
        </>}
      </Page>
    </RequireAccount>
  );
}

export function ReelManagement({ navigation }: any) {
  const { user } = useStore();
  const action = useAction();
  const [items, setItems] = useState<Reel[]>([]);
  const load = useCallback(async () => setItems(await api('/admin/reels')), []);
  useFocusEffect(useCallback(() => { if (user?.reel_admin) void action.run(load); }, [user?.reel_admin]));
  return <RequireAccount navigation={navigation}><Page><Header navigation={navigation} title="Reel management" />
    {!user?.reel_admin ? <Empty text="This area is available to reel administrators." /> : <>
      <Txt style={{marginBottom:16}}>Upload reels from a passage inside the reader. Drafts remain private until they are published.</Txt>
      <Feedback {...action}/>
      <Button title="Refresh reels" secondary disabled={action.busy} onPress={() => action.run(load)}/>
      {!action.busy && !items.length && <Empty text="No reels yet. Open a book, show the reading controls, and choose Add passage reel."/>}
      {items.map(reel => <Card key={reel.id} style={{marginTop:14}}>
        <Txt bold>{reel.title}</Txt><Txt size={12}>{reel.book_title} · {reel.status} · {reel.reel_scope || 'passage'}</Txt>
        <Txt numberOfLines={2} style={{marginVertical:10}}>{reel.caption}</Txt>
        {reel.status === 'published' ? <Button title="Unpublish" secondary disabled={action.busy} onPress={() => action.run(async()=>{await api(`/admin/reels/${reel.id}/unpublish`,'POST',{});await load();})}/>
          : <Button title="Publish" disabled={action.busy || reel.status !== 'ready'} onPress={() => action.run(async()=>{await api(`/admin/reels/${reel.id}/publish`,'POST',{});await load();})}/>}
      </Card>)}
    </>}
  </Page></RequireAccount>;
}

export function ReelComments({ navigation, route }: any) {
  const { user } = useStore(),
    action = useAction();
  const [comments, setComments] = useState<any[]>([]),
    [body, setBody] = useState("");
  const path = `/reels/${route.params.reelId}/comments`;
  const load = async () => setComments(await api(path));
  useFocusEffect(
    useCallback(() => {
      if (user) void action.run(load);
    }, [path, user?.id]),
  );
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header navigation={navigation} title="Talk about this page" />
        <Field
          label="Your comment"
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={1000}
        />
        <Button
          title="Post comment"
          disabled={action.busy || !body.trim()}
          onPress={() =>
            action.run(async () => {
              await api(path, "POST", { body });
              setBody("");
              await load();
            })
          }
        />
        <Feedback {...action} />
        {action.error && (
          <Button
            title="Reload comments"
            secondary
            onPress={() => action.run(load)}
          />
        )}
        {!comments.length && !action.busy && (
          <Empty text="Start the conversation. Keep it thoughtful and spoiler-free." />
        )}
        {comments.map((c) => (
          <Card key={c.id} style={{ marginTop: 12 }}>
            <Txt bold>{c.name}</Txt>
            <Txt style={{ marginVertical: 10 }}>{c.body}</Txt>
            <Txt size={11}>{new Date(c.created_at).toLocaleDateString()}</Txt>
            {c.user_id === user?.id && (
              <Button
                style={{ marginTop: 12 }}
                title="Delete comment"
                secondary
                disabled={action.busy}
                onPress={() =>
                  action.run(async () => {
                    await api("/reel-comments/" + c.id, "DELETE");
                    await load();
                  })
                }
              />
            )}
          </Card>
        ))}
      </Page>
    </RequireAccount>
  );
}

export function ReelModeration({ navigation }: any) {
  const action = useAction();
  const [reports, setReports] = useState<any[]>([]);
  const load = async () => setReports(await api("/reel-moderation"));
  useFocusEffect(
    useCallback(() => {
      void action.run(load);
    }, []),
  );
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header navigation={navigation} title="Reported reels" />
        <Feedback {...action} />
        <Button
          title="Refresh reports"
          secondary
          disabled={action.busy}
          onPress={() => action.run(load)}
        />
        {!action.busy && !action.error && !reports.length && (
          <Empty text="No reports to review." />
        )}
        {reports.map((r, index) => (
          <Card key={r.id + index} style={{ marginTop: 16 }}>
            <Txt bold>{r.title}</Txt>
            <Txt style={{ marginVertical: 12 }}>
              {r.reason} · {r.status}
            </Txt>
            <View style={gap}>
              <Button
                title="Inspect reported reel"
                secondary
                onPress={() =>
                  navigation.navigate("ModeratorReel", { reelId: r.id })
                }
              />
              <Button
                title={
                  r.status === "published"
                    ? "Hide from everyone"
                    : "Restore reel"
                }
                disabled={action.busy}
                onPress={() =>
                  action.run(async () => {
                    await api("/reel-moderation/" + r.id, "PATCH", {
                      status: r.status === "published" ? "hidden" : "published",
                    });
                    await load();
                  })
                }
              />
            </View>
          </Card>
        ))}
      </Page>
    </RequireAccount>
  );
}

export function ModeratorReel({ navigation, route }: any) {
  const action = useAction();
  const [reel, setReel] = useState<Reel | null>(null);
  useFocusEffect(
    useCallback(() => {
      void action.run(async () =>
        setReel(await api("/reel-moderation/" + route.params.reelId)),
      );
    }, [route.params.reelId]),
  );
  return (
    <RequireAccount navigation={navigation}>
      <Page>
        <Header navigation={navigation} title="Review reel" />
        <Feedback {...action} />
        {reel && (
          <>
            <Txt bold>{reel.title}</Txt>
            <Txt style={{ marginVertical: 16 }}>{reel.caption}</Txt>
            {reel.external_url ? (
              <Button
                title="Open original reel"
                onPress={() =>
                  action.run(() => Linking.openURL(reel.external_url!))
                }
              />
            ) : (
              <ReelPlayer reel={reel} authenticated={false} />
            )}
            <Txt>{reel.attribution}</Txt>
          </>
        )}
      </Page>
    </RequireAccount>
  );
}
