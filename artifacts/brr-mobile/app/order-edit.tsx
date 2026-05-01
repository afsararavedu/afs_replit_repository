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

export default function EditOrderScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    id?: string;
    brandNumber?: string;
    brandName?: string;
    productType?: string;
    packType?: string;
    packSize?: string;
    qtyCasesDelivered?: string;
    qtyBottlesDelivered?: string;
    ratePerCase?: string;
    unitRatePerBottle?: string;
    totalAmount?: string;
    breakageBottleQty?: string;
    invoiceDate?: string;
    icdcNumber?: string;
    remarks?: string;
  }>();

  const orderId = toInt(params.id ?? "0");
  const brandNumber = params.brandNumber ?? "";
  const brandName = params.brandName ?? "";
  const productType = params.productType ?? "";
  const packType = params.packType ?? "";
  const packSize = params.packSize ?? "";

  const [casesDelivered, setCasesDelivered] = useState<string>(
    String(toInt(params.qtyCasesDelivered ?? "0")),
  );
  const [bottlesDelivered, setBottlesDelivered] = useState<string>(
    String(toInt(params.qtyBottlesDelivered ?? "0")),
  );
  const [ratePerCase, setRatePerCase] = useState<string>(
    String(toFloat(params.ratePerCase)),
  );
  const [unitRatePerBottle, setUnitRatePerBottle] = useState<string>(
    String(toFloat(params.unitRatePerBottle)),
  );
  const [breakage, setBreakage] = useState<string>(
    String(toInt(params.breakageBottleQty ?? "0")),
  );
  const [invoiceDate, setInvoiceDate] = useState<string>(
    params.invoiceDate ?? "",
  );
  const [icdcNumber, setIcdcNumber] = useState<string>(params.icdcNumber ?? "");
  const [remarks, setRemarks] = useState<string>(params.remarks ?? "");

  // Mirrors the web "manual entry" totalAmount formula:
  //   total = cases * ratePerCase + bottles * unitRatePerBottle
  const computed = useMemo(() => {
    const cs = toInt(casesDelivered);
    const btls = toInt(bottlesDelivered);
    const rpc = toFloat(ratePerCase);
    const urb = toFloat(unitRatePerBottle);
    const totalAmount = cs * rpc + btls * urb;
    return { cs, btls, rpc, urb, totalAmount };
  }, [casesDelivered, bottlesDelivered, ratePerCase, unitRatePerBottle]);

  const save = useMutation({
    mutationFn: async () => {
      // Mirror the web's per-row PUT call. /api/orders/:id merges supplied
      // fields into the existing row and recomputes totalBottles server-side.
      // (The /api/orders/bulk endpoint mentioned in the task description is
      // an INSERT-only path used for bulk imports — using it here would
      // create duplicate rows instead of updating the tapped one.)
      const body: Record<string, unknown> = {
        brandNumber,
        brandName,
        productType,
        packType,
        packSize,
        qtyCasesDelivered: computed.cs,
        qtyBottlesDelivered: computed.btls,
        ratePerCase: computed.rpc.toFixed(2),
        unitRatePerBottle: computed.urb.toFixed(2),
        totalAmount: computed.totalAmount.toFixed(2),
        breakageBottleQty: toInt(breakage),
        invoiceDate: invoiceDate || null,
        icdcNumber: icdcNumber || null,
        remarks: remarks || null,
      };
      return api(`/api/orders/${orderId}`, { method: "PUT", body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
      router.back();
    },
    onError: (e: Error) => {
      const msg =
        e instanceof ApiError
          ? e.message
          : e?.message || "Failed to save order";
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        window.alert(msg);
      } else {
        Alert.alert("Could not save", msg);
      }
    },
  });

  const canSubmit =
    orderId > 0 && !!brandNumber && !!packSize && !save.isPending;

  const onSubmit = () => {
    if (!canSubmit) return;
    save.mutate();
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: "Edit Order",
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
                {packSize || "—"}
              </Text>
            </View>
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {productType || "—"}
              {packType ? ` · ${packType}` : ""}
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          Quantity received
        </Text>
        <View style={styles.row2}>
          <View style={styles.rowItem}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Cases
            </Text>
            <TextInput
              value={casesDelivered}
              onChangeText={setCasesDelivered}
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
              testID="input-order-cases"
            />
          </View>
          <View style={styles.rowItem}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Loose bottles
            </Text>
            <TextInput
              value={bottlesDelivered}
              onChangeText={setBottlesDelivered}
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
              testID="input-order-bottles"
            />
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          Rates
        </Text>
        <View style={styles.row2}>
          <View style={styles.rowItem}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Rate / case
            </Text>
            <TextInput
              value={ratePerCase}
              onChangeText={setRatePerCase}
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
              testID="input-order-rate-case"
            />
          </View>
          <View style={styles.rowItem}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Rate / bottle
            </Text>
            <TextInput
              value={unitRatePerBottle}
              onChangeText={setUnitRatePerBottle}
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
              testID="input-order-rate-bottle"
            />
          </View>
        </View>

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
          testID="input-order-breakage"
        />

        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          ICDC number
        </Text>
        <TextInput
          value={icdcNumber}
          onChangeText={setIcdcNumber}
          autoCapitalize="characters"
          placeholder="e.g. ICDC123456"
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.foreground,
            },
          ]}
          testID="input-order-icdc"
        />

        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          Invoice date
        </Text>
        <TextInput
          value={invoiceDate}
          onChangeText={setInvoiceDate}
          autoCapitalize="none"
          placeholder="DD-Mon-YYYY"
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.foreground,
            },
          ]}
          testID="input-order-invoice-date"
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
          testID="input-order-remarks"
        />

        <View
          style={[
            styles.preview,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.previewLabel, { color: colors.mutedForeground }]}>
            Total amount
          </Text>
          <Text
            style={[styles.previewValue, { color: colors.primary }]}
            testID="text-order-total-amount"
          >
            {formatINR(computed.totalAmount)}
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
          testID="save-order"
        >
          <Feather name="check" size={18} color={colors.primaryForeground} />
          <Text style={[styles.saveText, { color: colors.primaryForeground }]}>
            {save.isPending ? "Saving…" : "Save order"}
          </Text>
        </Pressable>
      </View>
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
  previewValue: { fontFamily: "Inter_700Bold", fontSize: 20 },
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
