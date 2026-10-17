/**
 * 週次・月次レポートのPDFレイアウト（@react-pdf/renderer）。
 * サーバー専用（Node.js runtime）。日本語フォントは noto-sans-cjk-jp を埋め込む。
 */

import path from "node:path";
import React from "react";
import { Document, Page, StyleSheet, Text, View, Font } from "@react-pdf/renderer";
import type { CleaningReportData } from "./build-report";

let fontRegistered = false;
function ensureFontRegistered(): void {
  if (fontRegistered) return;
  // require.resolve(...) だと webpack が .woff をモジュールとしてバンドルしようとして
  // ビルドが失敗するため、webpack の静的解析に乗らない path.join でパスを組み立てる
  // （@react-pdf/font は実行時にこのパス文字列へ直接 fetch() する）。
  const fontPath = path.join(
    process.cwd(),
    "node_modules",
    "noto-sans-cjk-jp",
    "fonts",
    "NotoSansCJKjp-Regular.woff",
  );
  Font.register({ family: "NotoJP", src: fontPath });
  // @react-pdf/renderer は日本語の単語分割（ハイフネーション）を行おうとして
  // 禁則処理が崩れることがあるため、1文字単位の分割に固定する。
  Font.registerHyphenationCallback((word) => Array.from(word));
  fontRegistered = true;
}

const C = {
  text: "#1e293b",
  sub: "#64748b",
  border: "#e2e8f0",
  headerBg: "#0f172a",
  good: "#059669",
  warn: "#d97706",
  bad: "#dc2626",
  rowAlt: "#f8fafc",
};

const styles = StyleSheet.create({
  page: { fontFamily: "NotoJP", padding: 36, fontSize: 9, color: C.text },
  title: { fontSize: 16, fontWeight: 700 },
  subtitle: { fontSize: 10, color: C.sub, marginTop: 2 },
  generatedAt: { fontSize: 8, color: C.sub, marginTop: 6 },
  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottom: `1px solid ${C.border}`,
  },
  statRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  statBox: {
    flex: 1,
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    padding: 8,
  },
  statLabel: { fontSize: 8, color: C.sub },
  statValue: { fontSize: 18, fontWeight: 700, marginTop: 2 },
  table: { marginTop: 2 },
  tr: { flexDirection: "row", borderBottom: `1px solid ${C.border}`, paddingVertical: 4 },
  trHead: {
    flexDirection: "row",
    backgroundColor: C.headerBg,
    color: "#ffffff",
    paddingVertical: 4,
    borderRadius: 2,
  },
  th: { fontSize: 8, fontWeight: 700, paddingHorizontal: 4 },
  td: { fontSize: 9, paddingHorizontal: 4 },
  empty: { fontSize: 9, color: C.sub, marginTop: 4 },
  bar: { height: 6, borderRadius: 2, backgroundColor: C.border, marginTop: 2 },
  barFill: { height: 6, borderRadius: 2 },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    fontSize: 7,
    color: C.sub,
    textAlign: "center",
  },
});

function rateColor(rate: number): string {
  if (rate >= 90) return C.good;
  if (rate >= 70) return C.warn;
  return C.bad;
}

export function CleaningReportDocument({ data }: { data: CleaningReportData }) {
  ensureFontRegistered();
  const periodLabel = data.periodType === "week" ? "週次レポート" : "月次レポート";
  const maxPlanned = Math.max(1, ...data.weekday.map((w) => w.planned));

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View>
          <Text style={styles.title}>
            {data.storeName} 清掃{periodLabel}
          </Text>
          <Text style={styles.subtitle}>対象期間: {data.periodLabel}</Text>
          <Text style={styles.generatedAt}>作成: {data.generatedAtLabel}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>全体サマリー</Text>
          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>予定件数</Text>
              <Text style={styles.statValue}>{data.overall.planned}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>完了件数</Text>
              <Text style={[styles.statValue, { color: C.good }]}>{data.overall.done}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>未実施件数</Text>
              <Text style={[styles.statValue, { color: data.overall.missed > 0 ? C.bad : C.text }]}>
                {data.overall.missed}
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>完了率</Text>
              <Text style={[styles.statValue, { color: rateColor(data.overall.rate) }]}>
                {data.overall.rate}%
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>清掃が行き届いていない場所（完了率が低い順）</Text>
          {data.worstAreas.length === 0 ? (
            <Text style={styles.empty}>この期間、完了率が低い場所はありませんでした。</Text>
          ) : (
            <View style={styles.table}>
              <View style={styles.trHead} fixed>
                <Text style={[styles.th, { width: "40%" }]}>場所</Text>
                <Text style={[styles.th, { width: "15%" }]}>予定</Text>
                <Text style={[styles.th, { width: "15%" }]}>完了</Text>
                <Text style={[styles.th, { width: "15%" }]}>未実施</Text>
                <Text style={[styles.th, { width: "15%" }]}>完了率</Text>
              </View>
              {data.worstAreas.map((a, i) => (
                <View key={a.key} style={[styles.tr, i % 2 === 1 ? { backgroundColor: C.rowAlt } : {}]}>
                  <Text style={[styles.td, { width: "40%" }]}>{a.label}</Text>
                  <Text style={[styles.td, { width: "15%" }]}>{a.planned}</Text>
                  <Text style={[styles.td, { width: "15%" }]}>{a.done}</Text>
                  <Text style={[styles.td, { width: "15%" }]}>{a.missed}</Text>
                  <Text style={[styles.td, { width: "15%", color: rateColor(a.rate), fontWeight: 700 }]}>
                    {a.rate}%
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>よく忘れられる清掃項目</Text>
          {data.missRanking.length === 0 ? (
            <Text style={styles.empty}>よく忘れられている清掃項目はありませんでした。</Text>
          ) : (
            <View style={styles.table}>
              <View style={styles.trHead} fixed>
                <Text style={[styles.th, { width: "50%" }]}>清掃項目</Text>
                <Text style={[styles.th, { width: "15%" }]}>予定</Text>
                <Text style={[styles.th, { width: "15%" }]}>未実施</Text>
                <Text style={[styles.th, { width: "20%" }]}>未実施率</Text>
              </View>
              {data.missRanking.map((m, i) => (
                <View
                  key={m.masterId ?? m.masterName}
                  style={[styles.tr, i % 2 === 1 ? { backgroundColor: C.rowAlt } : {}]}
                >
                  <Text style={[styles.td, { width: "50%" }]}>{m.masterName}</Text>
                  <Text style={[styles.td, { width: "15%" }]}>{m.planned}</Text>
                  <Text style={[styles.td, { width: "15%" }]}>{m.missed}</Text>
                  <Text style={[styles.td, { width: "20%", color: C.bad, fontWeight: 700 }]}>
                    {m.missRate}%
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>曜日別の清掃件数・未実施件数</Text>
          <View style={styles.table}>
            <View style={styles.trHead}>
              <Text style={[styles.th, { width: "14%" }]}>曜日</Text>
              <Text style={[styles.th, { width: "14%" }]}>予定</Text>
              <Text style={[styles.th, { width: "14%" }]}>未実施</Text>
              <Text style={[styles.th, { width: "14%" }]}>未実施率</Text>
              <Text style={[styles.th, { width: "44%" }]}>予定件数の分布</Text>
            </View>
            {data.weekday.map((w, i) => (
              <View key={w.weekday} style={[styles.tr, i % 2 === 1 ? { backgroundColor: C.rowAlt } : {}]}>
                <Text style={[styles.td, { width: "14%", fontWeight: 700 }]}>{w.label}</Text>
                <Text style={[styles.td, { width: "14%" }]}>{w.planned}</Text>
                <Text style={[styles.td, { width: "14%" }]}>{w.missed}</Text>
                <Text style={[styles.td, { width: "14%", color: w.missRate > 0 ? C.bad : C.text }]}>
                  {w.missRate}%
                </Text>
                <View style={{ width: "44%", justifyContent: "center" }}>
                  <View style={styles.bar}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${Math.round((w.planned / maxPlanned) * 100)}%`,
                          backgroundColor: "#0ea5e9",
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        {data.topStaff.length > 0 ? (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>スタッフ別 完了登録数</Text>
            <View style={styles.table}>
              <View style={styles.trHead}>
                <Text style={[styles.th, { width: "70%" }]}>スタッフ</Text>
                <Text style={[styles.th, { width: "30%" }]}>完了件数</Text>
              </View>
              {data.topStaff.map((s, i) => (
                <View key={s.id} style={[styles.tr, i % 2 === 1 ? { backgroundColor: C.rowAlt } : {}]}>
                  <Text style={[styles.td, { width: "70%" }]}>{s.name}</Text>
                  <Text style={[styles.td, { width: "30%" }]}>{s.done}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
