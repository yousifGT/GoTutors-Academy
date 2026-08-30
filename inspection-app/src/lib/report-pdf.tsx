import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { fmtDuration } from "@/lib/core";
import { SIZE_SHORT, niceDate } from "@/lib/format";
import type { Report, ReportRow } from "@/lib/report";

/**
 * The inspection report as a PDF — the document a centre owner is sent.
 *
 * It reads the same `Report` the on-screen version does, so the two cannot say
 * different things. Fonts are the PDF built-ins (Helvetica): registering
 * Poppins would mean either a network fetch at render time or shipping the font
 * binaries, and a report must render on a server with no outbound access.
 */

const NAVY = "#1C1960";
const SKY = "#57B9EA";
const SLATE = "#475569";
const LIGHT = "#94a3b8";

const BUCKET_COLOR: Record<string, string> = {
  IMPROVE: "#c0392b",
  OBS: "#0369a1",
  WELL: "#2f855a",
};

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 44, fontSize: 10, color: "#0f172a", fontFamily: "Helvetica" },
  brand: { fontSize: 14, fontFamily: "Helvetica-Bold", color: NAVY },
  brandSky: { color: SKY },
  h1: { fontSize: 22, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 2 },
  meta: { fontSize: 9, color: SLATE, marginTop: 2 },
  scoreRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 14 },
  pct: { fontSize: 40, fontFamily: "Helvetica-Bold" },
  verdict: { fontSize: 13, fontFamily: "Helvetica-Bold", marginLeft: 10, marginBottom: 6 },
  counts: { fontSize: 9, color: SLATE, marginTop: 2 },
  rule: { borderBottomWidth: 1, borderBottomColor: "#e2e8f0", marginVertical: 14 },
  critBox: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 4, padding: 10, marginTop: 12 },
  critTitle: { fontFamily: "Helvetica-Bold", color: "#991b1b", fontSize: 11 },
  critItem: { color: "#991b1b", marginTop: 3 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 18, marginBottom: 6 },
  card: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 4, padding: 9, marginBottom: 6 },
  cardSection: { fontSize: 7, color: LIGHT, textTransform: "uppercase", letterSpacing: 0.5 },
  question: { fontFamily: "Helvetica-Bold", marginTop: 1 },
  answerRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  answer: { backgroundColor: "#f1f5f9", paddingVertical: 2, paddingHorizontal: 5, borderRadius: 3, fontSize: 9 },
  repeatTag: { backgroundColor: "#b45309", color: "#fff", fontSize: 7, fontFamily: "Helvetica-Bold", paddingVertical: 2, paddingHorizontal: 4, borderRadius: 2, marginLeft: 5 },
  criticalTag: { backgroundColor: "#c0392b", color: "#fff", fontSize: 7, fontFamily: "Helvetica-Bold", paddingVertical: 2, paddingHorizontal: 4, borderRadius: 2, marginLeft: 5 },
  entry: { borderLeftWidth: 2, borderLeftColor: "#e2e8f0", paddingLeft: 7, marginTop: 5 },
  who: { fontSize: 8, fontFamily: "Helvetica-Bold", color: SLATE },
  note: { fontSize: 9, color: "#334155", marginTop: 1 },
  photos: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  photo: { width: 92, height: 92, marginRight: 5, marginBottom: 5, objectFit: "cover", borderRadius: 3 },
  block: { marginTop: 14, backgroundColor: "#f8fafc", borderRadius: 4, padding: 10 },
  blockTitle: { fontFamily: "Helvetica-Bold", color: NAVY, marginBottom: 3 },
  label: { fontSize: 7, color: LIGHT, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6 },
  signature: { width: 150, height: 60, objectFit: "contain", marginTop: 4 },
  footer: { position: "absolute", bottom: 26, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: LIGHT },
  draft: { backgroundColor: "#fef3c7", color: "#92400e", fontSize: 8, fontFamily: "Helvetica-Bold", paddingVertical: 2, paddingHorizontal: 5, borderRadius: 3, marginLeft: 8, marginBottom: 8 },
});

/** A photo the renderer can actually draw, or null to leave it out. */
export type PhotoResolver = (url: string) => { data: Buffer; format: "png" | "jpg" } | string | null;

function ReportDoc({ report, photo }: { report: Report; photo: PhotoResolver }) {
  const verdictColor = BUCKET_COLOR[report.criticalFails.length ? "IMPROVE" : ""] ?? report.verdictColor;
  return (
    <Document
      title={`Inspection — ${report.centre} — ${report.date.toISOString().slice(0, 10)}`}
      author="GoTutors"
    >
      <Page size="A4" style={s.page}>
        <Text style={s.brand}>
          Go<Text style={s.brandSky}>Tutors</Text>
        </Text>
        <Text style={s.h1}>{report.centre}</Text>
        <Text style={s.meta}>
          {niceDate(report.date)} · {SIZE_SHORT[report.size]} centre · Inspector: {report.inspector}
          {report.activeMs > 0 ? ` · ${fmtDuration(report.activeMs)} on site` : ""}
        </Text>

        <View style={s.scoreRow}>
          <Text style={[s.pct, { color: verdictColor }]}>{report.pct}%</Text>
          <Text style={[s.verdict, { color: verdictColor }]}>{report.verdict}</Text>
          {report.status === "DRAFT" && <Text style={s.draft}>DRAFT — NOT SUBMITTED</Text>}
        </View>
        <Text style={s.counts}>
          {report.counts.well} done well · {report.counts.improve} to improve · {report.counts.obs} observations
          {report.counts.unanswered > 0 ? ` · ${report.counts.unanswered} unanswered` : ""}
        </Text>

        {report.criticalFails.length > 0 && (
          <View style={s.critBox}>
            <Text style={s.critTitle}>Serious finding — this centre cannot be rated Good</Text>
            {report.criticalFails.map((t) => (
              <Text key={t} style={s.critItem}>
                • {t}
              </Text>
            ))}
            <Text style={[s.critItem, { fontFamily: "Helvetica-Bold", marginTop: 6 }]}>
              Escalate these immediately.
            </Text>
          </View>
        )}

        {report.repeats.length > 0 && (
          <View style={s.critBox}>
            <Text style={s.critTitle}>Not fixed since the last visit</Text>
            {report.repeats.map((r, i) => (
              <Text key={i} style={s.critItem}>
                • {r.question} — {r.answer}
              </Text>
            ))}
          </View>
        )}

        {report.targets && (
          <View style={s.block}>
            <Text style={s.blockTitle}>Targets before the next inspection</Text>
            <Text>{report.targets}</Text>
          </View>
        )}

        <View style={s.rule} />

        {report.groups.map((g) => (
          <View key={g.key}>
            <Text style={[s.sectionTitle, { color: BUCKET_COLOR[g.key] }]}>
              {g.title} ({g.rows.length})
            </Text>
            {g.rows.map((r, i) => (
              <Row key={`${g.key}-${i}`} row={r} photo={photo} />
            ))}
          </View>
        ))}

        {/* No forced page break here: it left an empty page whenever the
            findings happened to end near a boundary. wrap keeps the debrief
            from splitting across two pages, which is all that was wanted. */}
        {(report.debrief.name || report.debrief.notes || report.debrief.feedback) && (
          <View style={s.block} wrap={false}>
            <Text style={s.blockTitle}>Debrief</Text>
            {report.debrief.name && (
              <Text>
                Spoken to: {report.debrief.name}
                {report.debrief.role ? ` (${report.debrief.role})` : ""}
              </Text>
            )}
            {report.debrief.notes && (
              <>
                <Text style={s.label}>Discussed and agreed</Text>
                <Text>{report.debrief.notes}</Text>
              </>
            )}
            {report.debrief.feedback && (
              <>
                <Text style={s.label}>Their feedback</Text>
                <Text>{report.debrief.feedback}</Text>
              </>
            )}
            {report.debrief.signatureUrl &&
              (() => {
                const src = photo(report.debrief.signatureUrl!);
                return src ? (
                  <>
                    <Text style={s.label}>Signed on site</Text>
                    {/* eslint-disable-next-line jsx-a11y/alt-text */}
                    <Image style={s.signature} src={src as string} />
                  </>
                ) : null;
              })()}
          </View>
        )}

        <View style={s.footer} fixed>
          <Text>
            GoTutors centre inspection · checklist v{report.checklistVersion} · {report.centre} ·{" "}
            {niceDate(report.date)}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

function Row({ row, photo }: { row: ReportRow; photo: PhotoResolver }) {
  return (
    <View style={s.card} wrap={false}>
      <Text style={s.cardSection}>{row.section}</Text>
      <Text style={s.question}>{row.question}</Text>
      <View style={s.answerRow}>
        <Text style={s.answer}>{row.answer}</Text>
        {row.critical && <Text style={s.criticalTag}>CRITICAL</Text>}
        {row.repeat && <Text style={s.repeatTag}>REPEAT</Text>}
      </View>
      {row.entries.map((e, i) => (
        <View key={i} style={s.entry}>
          {e.who && <Text style={s.who}>{e.who}</Text>}
          {e.note && <Text style={s.note}>{e.note}</Text>}
          {e.photos.length > 0 && (
            <View style={s.photos}>
              {e.photos.map((url) => {
                const src = photo(url);
                if (!src) return null;
                /* eslint-disable-next-line jsx-a11y/alt-text */
                return <Image key={url} style={s.photo} src={src as string} />;
              })}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

export function renderReportPdf(report: Report, photo: PhotoResolver): Promise<Buffer> {
  return renderToBuffer(<ReportDoc report={report} photo={photo} />);
}

/** `inspection-report-acton-2026-08-26.pdf` */
export function reportFilename(report: Report): string {
  const slug = report.centre.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `inspection-report-${slug}-${report.date.toISOString().slice(0, 10)}.pdf`;
}
