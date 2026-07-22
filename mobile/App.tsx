import { useState, useCallback } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet } from "react-native";
import ScannerScreen from "./src/ScannerScreen";
import ResultsScreen from "./src/ResultsScreen";

// מכונת-מצבים פשוטה: סורק ↔ תוצאות (WebView של האתר הקיים). כשנסרק מספר,
// עוברים לתוצאות עם ‎?plate=‎; "חזרה" חוזר לסורק. "הקלדה ידנית" פותח את
// האתר בלי מספר. אין ניתוב חיצוני — מסך אחד פעיל בכל רגע
export default function App() {
  const [view, setView] = useState<"scan" | "results">("scan");
  const [plate, setPlate] = useState<string | null>(null);

  const goResults = useCallback((digits: string | null) => {
    setPlate(digits);
    setView("results");
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style={view === "scan" ? "light" : "dark"} />
      {view === "scan" ? (
        <ScannerScreen onLock={(digits) => goResults(digits)} onManual={() => goResults(null)} />
      ) : (
        <ResultsScreen plate={plate} onBack={() => setView("scan")} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
});
