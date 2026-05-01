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
import { formatINR } from "@/lib/format";

interface EditPayload {
  rows: Array<Record<string, unknown>>;
  deleteIds: number[];
}

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

export default function EditSaleScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    saleDate: string;
    brandNumber: string;
    brandName: string;
    size: string;
    quantityPerCase?: string;
    mrp?: string;
    openingBalanceBottles?: string;
    newStockCases?: string;
    newStockBottles?: string;
    closingBalanceCases?: string;
    closingBalanceBottles?: string;
    breakageBottles?: string;
    soldBottles?: string;
    invoiceDate?: string;
  }>();

  const saleDate = params.saleDate;
  const brandNumber = params.brandNumber;
  const brandName = params.brandName;
  const size = params.size;
  const quantityPerCase = toInt(params.quantityPerCase ?? "0");
  const mrp = toFloat(params.mrp);
  const openingBalanceBottles = toInt(params.openingBalanceBottles ?? "0");
  const newStockCases = toInt(params.newStockCases ?? "0");
  const newStockBottles = toInt(params.newStockBottles ?? "0");
  const invoiceDate = params.invoiceDate || saleDate;

  const initialClosingCases = toInt(params.closingBalanceCases ?? "0");
  const initialClosingBottles = toInt(params.closingBalanceBottles ?? "0");
  const initialBreakage = toInt(params.breakageBottles ?? "0");
  const initialSoldBottles = toInt(params.soldBottles ?? "0");

  // Mirror the web's "untouched row" default: a row with no recorded
  // closing data and no recorded sales is treated as a no-sale row, so we
  // pre-fill closing = total stock available (sold = 0). This prevents
  // an accidental save from being interpreted as a full sell-out.
  const initialTotalStock =
    openingBalanceBottles + quantityPerCase * newStockCases + newStockBottles;
  const isUntouched =
    initialClosingCases === 0 &&
    initialClosingBottles === 0 &&
    initialSoldBottles === 0;
  const defaultClosingCases =
    isUntouched && quantityPerCase > 0
      ? Math.floor(initialTotalStock / quantityPerCase)
      : initialClosingCases;
  const defaultClosingBottles = isUntouched
    ? quantityPerCase > 0
      ? initialTotalStock % quantityPerCase
      : initialTotalStock
    : initialClosingBottles;

  const [closingCases, setClosingCases] = useState<string>(
    String(defaultClosingCases),
  );
  const [closingBottles, setClosingBottles] = useState<string>(
    String(defaultClosingBottles),
  );
  const [breakage, setBreakage] = useState<string>(String(initialBreakage));

  const computed = useMemo(() => {
    const clsCs = toInt(closingCases);
    const clsBtls = toInt(closingBottles);
    const brk = toInt(breakage);
    const totalStock =
      openingBalanceBottles + quantityPerCase * newStockCases + newStockBottles;
    const closingTotal = clsBtls + clsCs * quantityPerCase;
    const soldBottles = totalStock - closingTotal;
    const saleValue = soldBottles * mrp;
    const totalClosingStock = closingTotal;
    const finalClosingBalance = Math.round(totalClosingStock - brk);
    return {
      clsCs,
      clsBtls,
      brk,
      totalStock,
      soldBottles,
      saleValue,
      totalClosingStock,
      finalClosingBalance,
    };
  }, [
    closingCases,
    closingBottles,
    breakage,
    openingBalanceBottles,
    quantityPerCase,
    newStockCases,
    newStockBottles,
    mrp,
  ]);

  const negative = computed.soldBottles < 0;

  const save = useMutation({
    mutationFn: async (payload: EditPayload) => {
      return api(`/api/sales/bulk?date=${encodeURIComponent(saleDate)}`, {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-stock"] });
      router.back();
    },
    onError: (e: Error) => {
      const msg =
        e instanceof ApiError
          ? e.message
          : e?.message || "Failed to save sale";
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        window.alert(msg);
      } else {
        Alert.alert("Could not save", msg);
      }
    },
  });

  const canSubmit =
    !!brandNumber &&
    !!size &&
    !!saleDate &&
    quantityPerCase > 0 &&
    !save.isPending;

  const onSubmit = () => {
    if (!canSubmit) return;
    if (negative) {
      const msg =
        "Sold bottles is negative. Check the closing balance values before saving.";
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        window.alert(msg);
      } else {
        Alert.alert("Negative sold bottles", msg);
      }
      return;
    }

    // Single-row edit semantics: always persist the values currently shown
    // in the form. The form is pre-populated with the row's existing
    // persisted values (defaultClosingCases / defaultClosingBottles /
    // initialBreakage), so saving without changes is a no-op write of the
    // existing values rather than a destructive zeroing of the row.
    // (The web "untouched row = zero" rule only applies to the bulk grid
    // where every visible row submits in one POST; here the user has
    // explicitly opened a single row to edit it.)
    const row: Record<string, unknown> = {
      brandNumber,
      brandName,
      size,
      quantityPerCase,
      openingBalanceBottles,
      newStockCases,
      newStockBottles,
      closingBalanceCases: computed.clsCs,
      closingBalanceBottles: computed.clsBtls,
      breakageBottles: computed.brk,
      soldBottles: computed.soldBottles,
      mrp: String(mrp),
      saleValue: computed.saleValue.toFixed(2),
      totalSaleValue: computed.saleValue.toFixed(2),
      totalClosingStock: computed.totalClosingStock,
      finalClosingBalance: computed.finalClosingBalance,
      saleDate,
      invoiceDate,
      isSubmitted: false,
    };

    save.mutate({ rows: [row], deleteIds: [] });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: "Edit Sale",
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
              {quantityPerCase} btls/case · MRP {formatINR(mrp)}
            </Text>
          </View>
          <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
            Date: {saleDate}
          </Text>
        </View>

        <View
          style={[
            styles.summaryGrid,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <ReadStat
            label="Opening (btls)"
            value={openingBalanceBottles.toString()}
            colors={colors}
          />
          <ReadStat
            label="New stock"
            value={`${newStockCases} Cs / ${newStockBottles} Btls`}
            colors={colors}
          />
          <ReadStat
            label="Total available (btls)"
            value={computed.totalStock.toString()}
            colors={colors}
          />
        </View>

        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          Closing balance — cases
        </Text>
        <TextInput
          value={closingCases}
          onChangeText={setClosingCases}
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
          testID="input-closing-cases"
        />

        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          Closing balance — bottles
        </Text>
        <TextInput
          value={closingBottles}
          onChangeText={setClosingBottles}
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
          testID="input-closing-bottles"
        />

        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          Breakage (bottles)
        </Text>
        <TextInput
          value={breakage}
          onChangeText={setBreakage}
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
          testID="input-breakage"
        />

        <View
          style={[
            styles.preview,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.previewLabel, { color: colors.mutedForeground }]}>
            Sold bottles
          </Text>
          <Text
            style={[
              styles.previewValue,
              {
                color: negative ? colors.destructive : colors.foreground,
              },
            ]}
            testID="text-sold-bottles"
          >
            {computed.soldBottles}
            {negative ? "  ⚠ negative" : ""}
          </Text>

          <View
            style={[styles.previewDivider, { backgroundColor: colors.border }]}
          />

          <Text style={[styles.previewLabel, { color: colors.mutedForeground }]}>
            Sale value
          </Text>
          <Text
            style={[styles.previewValue, { color: colors.primary }]}
            testID="text-sale-value"
          >
            {formatINR(computed.saleValue)}
          </Text>

          <View
            style={[styles.previewDivider, { backgroundColor: colors.border }]}
          />

          <Text style={[styles.previewLabel, { color: colors.mutedForeground }]}>
            Final closing (after breakage)
          </Text>
          <Text style={[styles.previewValue, { color: colors.foreground }]}>
            {computed.finalClosingBalance}
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
            {
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
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
          testID="save-sale"
        >
          <Feather name="check" size={18} color={colors.primaryForeground} />
          <Text style={[styles.saveText, { color: colors.primaryForeground }]}>
            {save.isPending ? "Saving…" : "Save sale"}
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
  sizeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  metaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    flex: 1,
  },
  dateText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginTop: 4,
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
