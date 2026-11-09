import React from "react";
import { registerRootComponent } from "expo";
import { View, Text, StyleSheet, StatusBar } from "react-native";

function StartupDiagnostic() {
  let AppComponent;
  try {
    AppComponent = require("./App").default;
    if (typeof AppComponent !== "function") {
      throw new Error("فایل App.tsx کامپوننت پیش‌فرض معتبر صادر نکرده است.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor="#090B0A" />
        <Text style={styles.title}>خطا در بارگذاری برنامه</Text>
        <Text style={styles.body}>برنامه اجرا شده، اما یکی از ماژول‌های اصلی بارگذاری نشده است. این متن برای تشخیص علت صفحه سفید است:</Text>
        <Text selectable style={styles.error}>{message}</Text>
      </View>
    );
  }
  return <AppComponent />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#090B0A", padding: 22, justifyContent: "center" },
  title: { color: "#E6B33D", fontSize: 23, fontWeight: "900", textAlign: "right", marginBottom: 14 },
  body: { color: "#F7F2E8", fontSize: 14, textAlign: "right", lineHeight: 25, marginBottom: 18 },
  error: { color: "#FF8A75", fontSize: 11, textAlign: "left", lineHeight: 19 }
});

registerRootComponent(StartupDiagnostic);
