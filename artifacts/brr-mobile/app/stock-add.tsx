import { Feather } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { ApiError, api } from "@/lib/api";
import { formatINR, todayISO } from "@/lib/format";

function toInt(value: string): number {
  if (!value) return 0;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function toFloat(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

export default function AddStockScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    brandNumber?: string;
    brandName?: string;
    size?: string;
    quantityPerCase?: string;
    mrp?: string;
    currentCases?: string;
    currentBottles?: string;
  }>();

  const brandNumber = params.brandNumber ?? "";
  const brandName = params.brandName ?? "";
  const size = params.size ?? "";
  const quantityPerCase = toInt(params.quantityPerCase ?? "0");
  const initialMrp = toFloat(params.mrp);
  const currentCases = toInt(params.currentCases ?? "0");
  const currentBottles = toInt(params.currentBottles ?? "0");

  const [casesInput, setCasesInput] = useState<string>("0");
  const [bottlesInput, setBottlesInput] = useState<string>("0");
  const [mrpInput, setMrpInput] = useState<string>(String(initialMrp));
  const [breakageInput, setBreakageInput] = useState<string>("0");
  const [remarks, setRemarks] = useState<string>("");

  // Mirrors the web Stock page derived totals.
  const computed = useMemo(() => {
    const cs = toInt(casesInput);
    const btls = toInt(bottlesInput);
    const mrp = toFloat(mrpInput);
    const totalBottles = cs * quantityPerCase + btls;
    const totalValue = totalBottles * mrp;
    return { cs, btls, mrp, totalBottles, totalValue };
  }, [casesInput, bottlesInput, mrpInput, quantityPerCase]);

  const save = useMutation({
    mutationFn: async () => {
      // /api/stock/bulk inserts new stock_details rows for the brand. The
      // mobile flow records new stock arriving for an existing brand row,
      // matching the InsertStockDetail shape the web shares via @workspace/db.
      const row: Record<string, unknown> = {
        brandNumber,
        brandName,
        size,
        quantityPerCase,
        stockInCases: computed.cs,
        stockInBottles: computed.btls,
        totalStockBottles: computed.totalBottles,
        mrp: computed.mrp.toFixed(2),
        totalStockValue: computed.totalValue.toFixed(2),
        breakage: toInt(breakageInput),
        remarks: remarks || null,
        invoiceDate: todayISO(),
      };
      return api(`/api/stock/bulk`, { method: "POST", body: [row] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-stock"] });
      router.back();
    },
    onError: (e: Error) => {
      const msg =
        e instanceof ApiError
          ? e.message
          : e?.message || "Failed to save stock";
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        window.alert(msg);
      } else {
        Alert.alert("Could not save", msg);
      }
    },
  });

  const noQuantity = computed.cs === 0 && computed.btls === 0;

  const canSubmit =
    !!brandNumber &&
    !!size &&
    quantityPerCase > 0 &&
    !noQuantity &&
    computed.mrp > 0 &&
    !save.isPending;

  const onSubmit = () => {
    if (!canSubmit) return;
    save.mutate();
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: "Add Stock",
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.foreground,
        }}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 96 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.header,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.brandNo, { color: colors.mutedForeground }]}>
            {brandNumber}
          </Text>
          <Text
            style={[styles.brandName, { color: colors.foreground }]}
            numberOfLines={2}
          >
            {brandName}
          </Text>
          <View style={styles.headerMeta}>
            <View
              style={[styles.sizePill, { backgroundColor: colors.accent }]}
            >
              <Text
                style={[styles.sizeText, { color: colors.accentForeground }]}
              >
                {size}
              </Text>
            </View>
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {quantityPerCase} btls/case
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.summaryGrid,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <ReadStat
            label="Current cases"
            value={String(currentCases)}
            colors={colors}
          />
          <ReadStat
            label="Current bottles"
            value={String(currentBottles)}
            colors={colors}
          />
          <ReadStat
            label="Current MRP"
            value={formatINR(initialMrp)}
            colors={colors}
          />
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          New stock arriving
        </Text>
        <View style={styles.row2}>
          <View style={styles.rowItem}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Cases
            </Text>
            <TextInput
              value={casesInput}
              onChangeText={setCasesInput}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              testID="input-stock-cases"
            />
          </View>
          <View style={styles.rowItem}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Loose bottles
            </Text>
            <TextInput
              value={bottlesInput}
              onChangeText={setBottlesInput}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              testID="input-stock-bottles"
            />
          </View>
        </View>

        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          MRP (per bottle)
        </Text>
        <TextInput
          value={mrpInput}
          onChangeText={setMrpInput}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.foreground,
            },
          ]}
          testID="input-stock-mrp"
        />

        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          Breakage (bottles)
        </Text>
        <TextInput
          value={breakageInput}
          onChangeText={setBreakageInput}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.foreground,
            },
          ]}
          testID="input-stock-breakage"
        />

        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          Remarks
        </Text>
        <TextInput
          value={remarks}
          onChangeText={setRemarks}
          placeholder="Optional"
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.foreground,
            },
          ]}
          testID="input-stock-remarks"
        />

        <View
          style={[
            styles.preview,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.previewLabel, { color: colors.mutedForeground }]}>
            Total bottles
          </Text>
          <Text
            style={[styles.previewValue, { color: colors.foreground }]}
            testID="text-stock-total-bottles"
          >
            {computed.totalBottles}
          </Text>

          <View
            style={[styles.previewDivider, { backgroundColor: colors.border }]}
          />

          <Text style={[styles.previewLabel, { color: colors.mutedForeground }]}>
            Stock value
          </Text>
          <Text
            style={[styles.previewValue, { color: colors.primary }]}
            testID="text-stock-total-value"
          >
            {formatINR(computed.totalValue)}
          </Text>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.cancel,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.cancelText, { color: colors.foreground }]}>
            Cancel
          </Text>
        </Pressable>
        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.save,
            {
              backgroundColor: colors.primary,
              opacity: !canSubmit ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
          testID="save-stock"
        >
          <Feather name="check" size={18} color={colors.primaryForeground} />
          <Text style={[styles.saveText, { color: colors.primaryForeground }]}>
            {save.isPending ? "Saving…" : "Save stock"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReadStat({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.readStat}>
      <Text style={[styles.readLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text
        style={[styles.readValue, { color: colors.foreground }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 6 },
  header: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  brandNo: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  brandName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  sizePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  sizeText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  metaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    flex: 1,
  },
  summaryGrid: {
    flexDirection: "row",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  readStat: { flex: 1 },
  readLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginBottom: 2,
  },
  readValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  sectionLabel: {
    marginTop: 16,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  row2: { flexDirection: "row", gap: 10 },
  rowItem: { flex: 1 },
  label: {
    marginTop: 14,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    marginTop: 6,
  },
  preview: {
    marginTop: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
  },
  previewLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginBottom: 4,
  },
  previewValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  previewDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  footer: {
    flexDirection: "row",
    padding: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  cancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  save: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
