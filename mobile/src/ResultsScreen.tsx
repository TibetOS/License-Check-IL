import { useRef } from "react";
import { StyleSheet, View, TouchableOpacity, Text, Platform, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { SITE_URL } from "./config";

type Props = {
  plate: string | null; // ספרות; null = פתיחת האתר להקלדה ידנית
  onBack: () => void;
};

// האתר הקיים מזהה ‎?plate=‎, ממלא את השדה ומריץ בדיקה אוטומטית — ולכן
// טעינת ה-URL הזה היא כל האינטגרציה שצריך. כל מסך הפרטים, ההיסטוריה
// והחידוש מגיעים מהאתר המוכח, בלי שכפול
export default function ResultsScreen({ plate, onBack }: Props) {
  const uri = plate ? `${SITE_URL}?plate=${encodeURIComponent(plate)}` : SITE_URL;
  const startRef = useRef(uri);

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} accessibilityLabel="חזרה לסריקה">
          <Text style={styles.backText}>‹ סריקה</Text>
        </TouchableOpacity>
      </View>
      <WebView
        source={{ uri: startRef.current }}
        style={styles.web}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        )}
        // האתר עצמו קורא לרשת data.gov.il; אין צורך בהזרקות
        originWhitelist={["*"]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  bar: {
    paddingTop: Platform.OS === "ios" ? 56 : 20,
    paddingBottom: 8,
    paddingHorizontal: 12,
    backgroundColor: "#ffd320",
    flexDirection: "row",
    alignItems: "center",
  },
  backBtn: { paddingVertical: 6, paddingHorizontal: 8 },
  backText: { fontSize: 17, fontWeight: "700", color: "#1a2233" },
  web: { flex: 1 },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
});
