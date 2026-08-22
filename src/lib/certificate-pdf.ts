import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

const styles = StyleSheet.create({
  page: { padding: 0, backgroundColor: "#ffffff" },
  outer: { margin: 24, borderWidth: 4, borderColor: "#1C1960", height: "92%", padding: 32 },
  inner: { borderWidth: 1, borderColor: "#56B9E9", height: "100%", padding: 40, alignItems: "center", justifyContent: "space-between" },
  brand: { color: "#56B9E9", letterSpacing: 4, fontSize: 12, marginBottom: 8 },
  title: { color: "#1C1960", fontSize: 36, fontWeight: 700, marginBottom: 10 },
  sub: { fontSize: 14, color: "#373637", marginBottom: 20 },
  name: { fontSize: 30, color: "#1C1960", fontWeight: 700, marginVertical: 12 },
  course: { fontSize: 20, color: "#A11266", marginVertical: 12 },
  meta: { fontSize: 11, color: "#373637" },
  row: { flexDirection: "row", justifyContent: "space-between", width: "100%", marginTop: 24 },
  block: { alignItems: "center" },
  line: { borderTopWidth: 1, borderColor: "#373637", width: 160, marginBottom: 4 },
});

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
            React.createElement(Text, { style: styles.brand }, "GOTUTORS ACADEMY"),
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
