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

interface StockRow {
  id?: number;
  brandNumber: string;
  brandName: string;
  size: string;
  quantityPerCase?: number | null;
  stockInCases?: number | null;
  stockInBottles?: number | null;
  totalStockBottles?: number | null;
  totalStockValue?: number | string | null;
  mrp?: number | string | null;
}

export default function StockTab() {
  const colors = useColors();
  const router = useRouter();
  const [search, setSearch] = useState("");

  const openAdd = (item: StockRow) => {
    router.push({
      pathname: "/stock-add",
      params: {
        brandNumber: item.brandNumber,
        brandName: item.brandName,
        size: item.size,
        quantityPerCase: String(item.quantityPerCase ?? 0),
        mrp: String(item.mrp ?? 0),
        currentCases: String(item.stockInCases ?? 0),
        currentBottles: String(item.stockInBottles ?? 0),
      },
    });
  };

  const query = useQuery<StockRow[]>({
    queryKey: ["stock"],
    queryFn: () => api<StockRow[]>("/api/stock"),
  });

  const filtered = useMemo(() => {
    const list = query.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.brandName?.toLowerCase().includes(q) ||
        r.brandNumber?.toLowerCase().includes(q),
    );
  }, [query.data, search]);

  const totalValue = (query.data ?? []).reduce(
    (sum, r) => sum + (Number(r.totalStockValue) || 0),
    0,
  );
  const totalBottles = (query.data ?? []).reduce(
    (sum, r) => sum + (Number(r.totalStockBottles) || 0),
    0,
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <BrandHeader title="Stock" subtitle="Current inventory on hand" />

      <View
        style={[
          styles.summary,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
            Total bottles
          </Text>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>
            {totalBottles.toLocaleString("en-IN")}
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
            Stock value
          </Text>
          <Text style={[styles.summaryValue, { color: colors.primary }]}>
            {formatINR(totalValue)}
          </Text>
        </View>
      </View>

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
            placeholder="Search brand or code"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      {query.isLoading ? (
        <LoadingView label="Loading stock…" />
      ) : query.isError ? (
        <ErrorView
          message={(query.error as Error).message}
          onRetry={() => query.refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyView
          icon="package"
          title={search ? "No matches" : "No stock yet"}
          subtitle={
            search
              ? "Try a different brand name or code."
              : "Stock will appear here once orders are received."
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, idx) =>
            `${item.brandNumber}-${item.size}-${idx}`
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
              onPress={() => openAdd(item)}
              testID={`stock-row-${item.brandNumber}-${item.size}`}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.brandNo, { color: colors.mutedForeground }]}
                  >
                    {item.brandNumber}
                  </Text>
                  <Text
                    style={[styles.brandName, { color: colors.foreground }]}
                    numberOfLines={2}
                  >
                    {item.brandName}
                  </Text>
                </View>
                <View
                  style={[styles.sizePill, { backgroundColor: colors.accent }]}
                >
                  <Text
                    style={[styles.sizeText, { color: colors.accentForeground }]}
                  >
                    {item.size}
                  </Text>
                </View>
                <Feather
                  name="chevron-right"
                  size={18}
                  color={colors.mutedForeground}
                />
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                  Stock
                </Text>
                <Text style={[styles.rowValue, { color: colors.foreground }]}>
                  {item.stockInCases ?? 0} Cs · {item.stockInBottles ?? 0} Btls
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                  Total bottles
                </Text>
                <Text style={[styles.rowValue, { color: colors.foreground }]}>
                  {item.totalStockBottles ?? 0}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                  Stock value
                </Text>
                <Text style={[styles.rowValue, { color: colors.primary }]}>
                  {formatINR(item.totalStockValue)}
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
  summary: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryItem: { flex: 1 },
  summaryLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginBottom: 4,
  },
  summaryValue: { fontFamily: "Inter_700Bold", fontSize: 18 },
  divider: { width: StyleSheet.hairlineWidth, marginHorizontal: 12 },
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
  brandNo: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  brandName: { fontFamily: "Inter_600SemiBold", fontSize: 15, marginTop: 2 },
  sizePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  sizeText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowLabel: { fontFamily: "Inter_400Regular", fontSize: 12 },
  rowValue: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
});
