import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { percentageOf } from "./scoring";
import { bandFor } from "./feedback";

/**
 * The report a centre sends to a parent.
 *
 * Deliberately not a screenshot of the app: no navigation, no buttons, no
 * confidence scores and no "the AI was unsure about this" — a parent is being
 * told how their child did, and how the mark was arrived at is the centre's
 * business, not theirs. What survives is the score, the feedback, and the
 * working for each question.
 */

export type ReportPaper = {
  studentName: string;
  admissionNumber: string | null;
  yearGroup: string | null;
  schemeTitle: string;
  subject: string;
  level: string | null;
  date: Date;
  awarded: number;
  available: number;
  overallComment: string;
  strengths: string[];
  improvements: string[];
  marks: {
    label: string;
    prompt: string;
    expectedAnswer: string;
    transcript: string;
    comment: string;
    awarded: number;
    available: number;
  }[];
};

const styles = StyleSheet.create({
  page: { padding: 44, fontSize: 10, color: "#141433", fontFamily: "Helvetica" },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6 },
  brand: { fontSize: 9, color: "#6b6b8a", letterSpacing: 1, textTransform: "uppercase" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 10 },
  subtitle: { fontSize: 10, color: "#6b6b8a", marginTop: 3 },
  rule: { borderBottomWidth: 1, borderBottomColor: "#e3e5ef", marginVertical: 14 },
  scoreRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  scoreBox: { flex: 1, borderWidth: 1, borderColor: "#e3e5ef", borderRadius: 6, padding: 10 },
  scoreLabel: { fontSize: 8, color: "#6b6b8a", textTransform: "uppercase", letterSpacing: 0.6 },
  scoreValue: { fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 4 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
  body: { lineHeight: 1.5 },
  columns: { flexDirection: "row", gap: 16, marginTop: 8 },
  column: { flex: 1 },
  columnHead: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  bullet: { flexDirection: "row", marginBottom: 4 },
  bulletMark: { width: 12 },
  question: { borderWidth: 1, borderColor: "#e3e5ef", borderRadius: 6, padding: 9, marginBottom: 7 },
  questionHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  questionLabel: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#6b6b8a" },
  answer: { backgroundColor: "#f1f2f8", padding: 6, borderRadius: 4, marginTop: 4, marginBottom: 4 },
  footer: { position: "absolute", bottom: 26, left: 44, right: 44, fontSize: 8, color: "#6b6b8a" },
});

function Bullet({ mark, children }: { mark: string; children: string }) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.bulletMark}>{mark}</Text>
      <Text style={{ flex: 1 }}>{children}</Text>
    </View>
  );
}

function PaperPages({ paper, centre }: { paper: ReportPaper; centre: string }) {
  const pct = percentageOf(paper.awarded, paper.available);
  const band = bandFor(pct);

  return (
    <Page size="A4" style={styles.page} wrap>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>{centre}</Text>
        <Text style={styles.brand}>{paper.date.toLocaleDateString("en-GB")}</Text>
      </View>

      <Text style={styles.title}>{paper.studentName}</Text>
      <Text style={styles.subtitle}>
        {[
          paper.admissionNumber ? `Admission no. ${paper.admissionNumber}` : null,
          paper.yearGroup,
          paper.schemeTitle,
          paper.subject,
          paper.level,
        ]
          .filter(Boolean)
          .join("  ·  ")}
      </Text>

      <View style={styles.rule} />

      <View style={styles.scoreRow}>
        <View style={styles.scoreBox}>
          <Text style={styles.scoreLabel}>Score</Text>
          <Text style={styles.scoreValue}>
            {paper.awarded}/{paper.available}
          </Text>
        </View>
        <View style={styles.scoreBox}>
          <Text style={styles.scoreLabel}>Percentage</Text>
          <Text style={styles.scoreValue}>{pct}%</Text>
        </View>
        <View style={styles.scoreBox}>
          <Text style={styles.scoreLabel}>Overall</Text>
          <Text style={[styles.scoreValue, { fontSize: 14 }]}>{band.label}</Text>
        </View>
      </View>

      {paper.overallComment ? (
        <>
          <Text style={styles.sectionTitle}>How it went</Text>
          <Text style={styles.body}>{paper.overallComment}</Text>
        </>
      ) : null}

      {paper.strengths.length > 0 || paper.improvements.length > 0 ? (
        <View style={styles.columns}>
          <View style={styles.column}>
            <Text style={styles.columnHead}>What went well</Text>
            {paper.strengths.map((s, i) => (
              <Bullet key={i} mark="+">
                {s}
              </Bullet>
            ))}
            {paper.strengths.length === 0 && <Text style={styles.muted}>—</Text>}
          </View>
          <View style={styles.column}>
            <Text style={styles.columnHead}>What to work on</Text>
            {paper.improvements.map((s, i) => (
              <Bullet key={i} mark=">">
                {s}
              </Bullet>
            ))}
            {paper.improvements.length === 0 && <Text style={styles.muted}>—</Text>}
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Question by question</Text>
      {paper.marks.map((m) => (
        <View key={m.label} style={styles.question} wrap={false}>
          <View style={styles.questionHead}>
            <Text style={styles.questionLabel}>Q{m.label}</Text>
            <Text style={styles.questionLabel}>
              {m.awarded}/{m.available}
            </Text>
          </View>
          <Text>{m.prompt}</Text>
          <View style={styles.answer}>
            <Text>
              <Text style={styles.muted}>They wrote: </Text>
              {m.transcript.trim() || "nothing readable"}
            </Text>
          </View>
          {m.comment ? <Text>{m.comment}</Text> : null}
          <Text style={[styles.muted, { marginTop: 3 }]}>Expected: {m.expectedAnswer}</Text>
        </View>
      ))}

      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) => `${centre}  ·  page ${pageNumber} of ${totalPages}`}
        fixed
      />
    </Page>
  );
}

/** One paper, or a whole quick-marking session, as a single PDF. */
export async function renderReport(papers: ReportPaper[], centre: string): Promise<Buffer> {
  return renderToBuffer(
    <Document title={papers.length === 1 ? `${papers[0].studentName} — ${papers[0].schemeTitle}` : `${centre} — marked papers`}>
      {papers.map((paper, i) => (
        <PaperPages key={i} paper={paper} centre={centre} />
      ))}
    </Document>
  );
}

/** A filename a tutor can find again in their downloads folder. */
export function reportFilename(papers: ReportPaper[]): string {
  const safe = (s: string) => s.replace(/[^\w\-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const date = papers[0]?.date ?? new Date();
  const stamp = date.toISOString().slice(0, 10);
  if (papers.length === 1) return `${safe(papers[0].studentName)}-${safe(papers[0].schemeTitle)}-${stamp}.pdf`;
  return `marked-papers-${stamp}.pdf`;
}
