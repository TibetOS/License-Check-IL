import { useEffect, useRef, useState, useCallback } from "react";
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
import TextRecognition from "@react-native-ml-kit/text-recognition";
import { PlateVoter, plateCandidatesFromLines, formatPlate } from "./plate";
import { SCAN_INTERVAL_MS, SCAN_HELP_AFTER_MS } from "./config";

type Props = {
  onLock: (digits: string) => void;
  onManual: () => void;
};

const MSG = {
  requesting: "מבקש גישה למצלמה…",
  denied: "אין גישה למצלמה — אפשר להקליד את המספר ידנית",
  scanning: "כוונו את המצלמה אל הלוחית",
  help: "לא נקרא? התקרבו ללוחית, יַשְּׁרו את הזווית והימנעו מסנוור",
  locked: "זוהה ✓",
  privacy: "הזיהוי מתבצע כולו במכשיר — התמונות אינן נשלחות לשום שרת",
};

// חילוץ שורות הטקסט מתוצאת ML Kit (בלוקים→שורות), עם נפילה לטקסט המלא
function linesFromResult(result: { text?: string; blocks?: Array<{ lines?: Array<{ text?: string }> }> }): string[] {
  const lines: string[] = [];
  for (const block of result?.blocks || []) {
    for (const line of block?.lines || []) {
      if (line?.text) lines.push(line.text);
    }
  }
  if (lines.length) return lines;
  return (result?.text || "").split("\n");
}

export default function ScannerScreen({ onLock, onManual }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState(MSG.requesting);
  const [torch, setTorch] = useState(false);
  const [locked, setLocked] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const cameraRef = useRef<CameraView | null>(null);
  const runningRef = useRef(false);
  const voterRef = useRef(new PlateVoter());
  const lastReadAtRef = useRef(Date.now());

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  const finishLock = useCallback(
    (digits: string) => {
      runningRef.current = false;
      setLocked(digits);
      setStatus(MSG.locked);
      // הבזק ירוק קצר לפני המסירה, כמו באתר
      setTimeout(() => onLock(digits), 350);
    },
    [onLock],
  );

  // דגימה אחת: צילום → OCR במכשיר → מועמדים → אימות
  const sampleOnce = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera) return;
    let uri: string | null = null;
    try {
      const photo = await camera.takePictureAsync({
        quality: 0.6,
        skipProcessing: true,
        base64: false,
      });
      uri = photo?.uri ?? null;
      if (!uri) return;
      const result = await TextRecognition.recognize(uri);
      const candidates = plateCandidatesFromLines(linesFromResult(result));
      const now = Date.now();
      for (const value of candidates) {
        const won = voterRef.current.push(value, now);
        if (won) {
          finishLock(won);
          return;
        }
      }
      if (candidates.length) {
        lastReadAtRef.current = now;
        setStatus(`${formatPlate(candidates[0])} …`);
      } else {
        setStatus(now - lastReadAtRef.current > SCAN_HELP_AFTER_MS ? MSG.help : MSG.scanning);
      }
    } catch {
      // פריים בעייתי — ממשיכים לדגימה הבאה
    } finally {
      if (uri) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
  }, [finishLock]);

  // לולאת הדגימה — רקורסיה עם setTimeout כדי שלא יחפפו דגימות
  useEffect(() => {
    if (!ready || !permission?.granted) return;
    runningRef.current = true;
    voterRef.current.reset();
    lastReadAtRef.current = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (!runningRef.current) return;
      const started = Date.now();
      await sampleOnce();
      if (!runningRef.current) return;
      const wait = Math.max(60, SCAN_INTERVAL_MS - (Date.now() - started));
      timer = setTimeout(loop, wait);
    };
    loop();
    return () => {
      runningRef.current = false;
      clearTimeout(timer);
    };
  }, [ready, permission?.granted, sampleOnce]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.centerText}>{MSG.requesting}</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>{MSG.denied}</Text>
        <TouchableOpacity style={styles.manualBtn} onPress={onManual}>
          <Text style={styles.manualBtnText}>הקלדה ידנית</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        animateShutter={false}
        autofocus="on"
        onCameraReady={() => setReady(true)}
      />

      {/* מסגרת-רמז רכה — הלוחית מזוהה בכל מקום בפריים, המסגרת רק לעזרה */}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.guide, locked ? styles.guideLocked : null]} />
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{status}</Text>
        </View>
        {locked ? (
          <View style={styles.lockBadge}>
            <Text style={styles.lockBadgeText}>{formatPlate(locked)}</Text>
          </View>
        ) : null}
      </View>

      {/* פקדים */}
      <TouchableOpacity
        style={[styles.torchBtn, torch ? styles.torchOn : null]}
        onPress={() => setTorch((t) => !t)}
        accessibilityLabel="פנס"
      >
        <Text style={[styles.torchIcon, torch ? styles.torchIconOn : null]}>⚡</Text>
      </TouchableOpacity>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.manualBtn} onPress={onManual}>
          <Text style={styles.manualBtnText}>הקלדה ידנית</Text>
        </TouchableOpacity>
        <Text style={styles.privacy}>{MSG.privacy}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  centerText: { color: "#fff", fontSize: 16, textAlign: "center" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  guide: {
    width: "84%",
    aspectRatio: 4.7,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.55)",
    borderStyle: "dashed",
    borderRadius: 12,
  },
  guideLocked: { borderColor: "#22c55e", borderStyle: "solid" },
  statusPill: {
    marginTop: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusText: { color: "#fff", fontSize: 15, textAlign: "center" },
  lockBadge: {
    marginTop: 12,
    backgroundColor: "#dcfce7",
    borderColor: "#16a34a",
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 4,
  },
  lockBadgeText: { color: "#14532d", fontSize: 24, fontWeight: "700", letterSpacing: 2 },
  torchBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 24,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  torchOn: { backgroundColor: "#fff" },
  torchIcon: { fontSize: 20, color: "#fff" },
  torchIconOn: { color: "#1a2233" },
  bottomBar: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 48 : 28,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 12,
  },
  manualBtn: {
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  manualBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  privacy: { color: "rgba(255,255,255,0.75)", fontSize: 12, textAlign: "center", paddingHorizontal: 24 },
});
