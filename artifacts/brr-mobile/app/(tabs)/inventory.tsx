import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { BrandHeader } from "@/components/BrandHeader";
import { EmptyView, ErrorView, LoadingView } from "@/components/StateView";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/format";

interface OrderRow {
  id?: number;
  icdcNumber?: string | null;
  invoiceDate?: string | null;
  brandNumber: string;
  brandName: string;
  productType?: string | null;
  packType?: string | null;
  packSize?: string | null;
  qtyCasesDelivered?: number | null;
  qtyBottlesDelivered?: number | null;
  ratePerCase?: number | string | null;
  unitRatePerBottle?: number | string | null;
  totalAmount?: number | string | null;
  breakageBottleQty?: number | null;
  remarks?: string | null;
}

export default function InventoryTab() {
  const colors = useColors();
  const router = useRouter();
  const [search, setSearch] = useState("");

  const openEdit = (item: OrderRow) => {
    if (!item.id) return;
    router.push({
      pathname: "/order-edit",
      params: {
        id: String(item.id),
        brandNumber: item.brandNumber,
        brandName: item.brandName,
        productType: item.productType ?? "",
        packType: item.packType ?? "",
        packSize: item.packSize ?? "",
        qtyCasesDelivered: String(item.qtyCasesDelivered ?? 0),
        qtyBottlesDelivered: String(item.qtyBottlesDelivered ?? 0),
        ratePerCase: String(item.ratePerCase ?? 0),
        unitRatePerBottle: String(item.unitRatePerBottle ?? 0),
        totalAmount: String(item.totalAmount ?? 0),
        breakageBottleQty: String(item.breakageBottleQty ?? 0),
        invoiceDate: item.invoiceDate ?? "",
        icdcNumber: item.icdcNumber ?? "",
        remarks: item.remarks ?? "",
      },
    });
  };

  const query = useQuery<OrderRow[]>({
    queryKey: ["orders"],
    queryFn: () => api<OrderRow[]>("/api/orders"),
  });

  const sorted = useMemo(() => {
    const list = (query.data ?? []).slice();
    list.sort((a, b) => {
      const da = a.invoiceDate || "";
      const db = b.invoiceDate || "";
      return db.localeCompare(da);
    });
    return list;
  }, [query.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (r) =>
        r.brandName?.toLowerCase().includes(q) ||
        r.brandNumber?.toLowerCase().includes(q) ||
        (r.icdcNumber || "").toLowerCase().includes(q),
    );
  }, [sorted, search]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <BrandHeader title="Inventory" subtitle="Stock orders received" />
      <View
        style={[
          styles.searchWrap,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <View
          style={[
            styles.searchBox,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search brand, code or ICDC"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      {query.isLoading ? (
        <LoadingView label="Loading orders…" />
      ) : query.isError ? (
        <ErrorView
          message={(query.error as Error).message}
          onRetry={() => query.refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyView
          icon="archive"
          title={search ? "No matches" : "No orders yet"}
          subtitle={
            search
              ? "Try searching by ICDC number, brand or code."
              : "New orders received will appear here."
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, idx) =>
            `${item.id ?? item.icdcNumber ?? ""}-${idx}`
          }
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openEdit(item)}
              disabled={!item.id}
              testID={`order-row-${item.id ?? item.brandNumber}`}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                  opacity: pressed && item.id ? 0.85 : 1,
                },
              ]}
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.icdc, { color: colors.mutedForeground }]}
                    numberOfLines={1}
                  >
                    ICDC: {item.icdcNumber || "—"}
                  </Text>
                  <Text
                    style={[styles.brandName, { color: colors.foreground }]}
                    numberOfLines={2}
                  >
                    {item.brandName}
                  </Text>
                </View>
                <View
                  style={[styles.datePill, { backgroundColor: colors.accent }]}
                >
                  <Text
                    style={[styles.dateText, { color: colors.accentForeground }]}
                  >
                    {item.invoiceDate || "—"}
                  </Text>
                </View>
                {item.id ? (
                  <Feather
                    name="chevron-right"
                    size={18}
                    color={colors.mutedForeground}
                  />
                ) : null}
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                  Brand · Pack
                </Text>
                <Text
                  style={[styles.rowValue, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {item.brandNumber} · {item.packSize || "—"}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                  Quantity
                </Text>
                <Text style={[styles.rowValue, { color: colors.foreground }]}>
                  {item.qtyCasesDelivered ?? 0} Cs ·{" "}
                  {item.qtyBottlesDelivered ?? 0} Btls
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                  Total value
                </Text>
                <Text style={[styles.rowValue, { color: colors.primary }]}>
                  {formatINR(item.totalAmount)}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    paddingVertical: 0,
  },
  list: { padding: 16, paddingBottom: 96, gap: 10 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 6,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 6,
  },
  icdc: { fontFamily: "Inter_500Medium", fontSize: 11 },
  brandName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    marginTop: 2,
  },
  datePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dateText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLabel: { fontFamily: "Inter_400Regular", fontSize: 12 },
  rowValue: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
});
