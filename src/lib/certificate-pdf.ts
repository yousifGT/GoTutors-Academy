import { Document, Page, Text, View, StyleSheet, Font, Svg, Path, renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { WORDMARK_PATHS, WORDMARK_VIEWBOX } from "@/lib/brand-mark";

const styles = StyleSheet.create({
  page: { padding: 0, backgroundColor: "#ffffff" },
  outer: { margin: 24, borderWidth: 4, borderColor: "#1C1960", height: "92%", padding: 32 },
  inner: { borderWidth: 1, borderColor: "#56B9E9", height: "100%", padding: 40, alignItems: "center", justifyContent: "space-between" },
  brand: { color: "#56B9E9", letterSpacing: 4, fontSize: 9, marginTop: 4, marginBottom: 10 },
  title: { color: "#1C1960", fontSize: 36, fontWeight: 700, marginBottom: 10 },
  sub: { fontSize: 14, color: "#373637", marginBottom: 20 },
  name: { fontSize: 30, color: "#1C1960", fontWeight: 700, marginVertical: 12 },
  course: { fontSize: 20, color: "#A11266", marginVertical: 12 },
  meta: { fontSize: 11, color: "#373637" },
  row: { flexDirection: "row", justifyContent: "space-between", width: "100%", marginTop: 24 },
  block: { alignItems: "center" },
  line: { borderTopWidth: 1, borderColor: "#373637", width: 160, marginBottom: 4 },
});

/** The wordmark's own proportions, so scaling it can never distort it. */
const WORDMARK_WIDTH = 170;
const [, , vbWidth, vbHeight] = WORDMARK_VIEWBOX.split(" ").map(Number);

/**
 * The real logo at the head of the certificate, in place of the line of
 * letter-spaced capitals that stood in for it.
 *
 * Drawn from path data rather than loaded from `public/go-wordmark-navy.svg`:
 * `@react-pdf/renderer`'s `<Image>` takes PNG and JPEG only, so an SVG file is
 * not something it can open. `<Svg>`/`<Path>` take the geometry directly.
 */
function brandMark() {
  return React.createElement(
    Svg,
    {
      viewBox: WORDMARK_VIEWBOX,
      width: WORDMARK_WIDTH,
      height: (WORDMARK_WIDTH * vbHeight) / vbWidth,
    },
    ...WORDMARK_PATHS.map((d, i) =>
      React.createElement(Path, { key: i, d, fill: "#1C1960" })
    )
  );
}

/**
 * One layout, two documents. A course certificate records work completed; a
 * subject certificate records what someone is qualified to tutor. They differ
 * only in wording, so they share the frame rather than drifting apart.
 */
async function render(opts: {
  name: string;
  heading: string;
  lead: string;
  subject: string;
  dateLabel: string;
  serial: string;
  issuedAt: Date;
}) {
  const doc = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", orientation: "landscape", style: styles.page },
      React.createElement(
        View,
        { style: styles.outer },
        React.createElement(
          View,
          { style: styles.inner },
          React.createElement(
            View,
            { style: { alignItems: "center" } },
            brandMark(),
            React.createElement(Text, { style: styles.brand }, "ACADEMY"),
            React.createElement(Text, { style: styles.title }, opts.heading),
            React.createElement(Text, { style: styles.sub }, "This is to certify that")
          ),
          React.createElement(
            View,
            { style: { alignItems: "center" } },
            React.createElement(Text, { style: styles.name }, opts.name),
            React.createElement(Text, { style: styles.sub }, opts.lead),
            React.createElement(Text, { style: styles.course }, opts.subject)
          ),
          React.createElement(
            View,
            { style: styles.row },
            React.createElement(
              View,
              { style: styles.block },
              React.createElement(View, { style: styles.line }),
              React.createElement(Text, { style: styles.meta }, `${opts.dateLabel} ${opts.issuedAt.toDateString()}`)
            ),
            React.createElement(
              View,
              { style: styles.block },
              React.createElement(View, { style: styles.line }),
              React.createElement(Text, { style: styles.meta }, `Serial ${opts.serial}`)
            )
          )
        )
      )
    )
  );
  return await renderToBuffer(doc as any);
}

export function renderCertificatePdf(opts: {
  name: string;
  courseTitle: string;
  serial: string;
  issuedAt: Date;
}) {
  return render({
    name: opts.name,
    heading: "Certificate of Completion",
    lead: "has successfully completed the course",
    subject: opts.courseTitle,
    dateLabel: "Issued",
    serial: opts.serial,
    issuedAt: opts.issuedAt,
  });
}

/**
 * "Qualified" rather than "Issued": the date is when they last satisfied every
 * course the subject requires, which moves forward each time a new course is
 * added to the subject and completed.
 */
export function renderSubjectCertificatePdf(opts: {
  name: string;
  field: string;
  serial: string;
  qualifiedAt: Date;
}) {
  return render({
    name: opts.name,
    heading: "Certificate of Qualification",
    lead: "is qualified to tutor",
    subject: opts.field,
    dateLabel: "Qualified",
    serial: opts.serial,
    issuedAt: opts.qualifiedAt,
  });
}
