/**
 * Subject qualifications, as certificates.
 *
 * A course certificate says "completed Test course". It is a record of work, and
 * it is not the thing anyone actually needs to see: what management and the tutor
 * want is "qualified to tutor English, as of this date". That document did not
 * exist, even though the app already computed the state behind it — which is why
 * a tutor holding English and Science read as having one certificate.
 *
 * These are DERIVED, not stored. A subject is qualified when every published
 * course assigned to it is certified, so adding a course to a subject
 * automatically un-qualifies its tutors until they finish it, and finishing it
 * moves the date forward on its own. Nothing needs migrating and nothing can go
 * stale. The trade-off: there is no immutable record of what the document said on
 * a given day, and no serial to revoke. Add a table if that is ever needed.
 *
 * A subject with outstanding courses is still listed — as pending — rather than
 * hidden, so a tutor can see what is left and management can see who is part-way.
 */

/** The shape this needs from a FieldStatus; dates may arrive as JSON strings. */
export type SubjectField = {
  name: string;
  total: number;
  done: number;
  trained: boolean;
  retraining: boolean;
  lastCertifiedAt: string | Date | null;
};

export type SubjectCertificate = {
  field: string;
  /**
   * qualified   — every course certified; the certificate can be issued
   * retraining  — was qualified, a new course has since been added
   * pending     — not yet finished for the first time
   */
  status: "qualified" | "retraining" | "pending";
  done: number;
  total: number;
  /** When they last satisfied the whole subject, if they ever did. */
  qualifiedAt: string | Date | null;
  downloadable: boolean;
};

export function subjectCertificate(field: SubjectField): SubjectCertificate {
  // Retraining is checked first: a lapsed subject can still read trained:false
  // with a stale date, and "was qualified, now isn't" is the more useful label.
  const status: SubjectCertificate["status"] = field.retraining
    ? "retraining"
    : field.trained
      ? "qualified"
      : "pending";
  return {
    field: field.name,
    status,
    done: field.done,
    total: field.total,
    qualifiedAt: status === "qualified" ? field.lastCertifiedAt : field.retraining ? field.lastCertifiedAt : null,
    downloadable: status === "qualified",
  };
}

export function subjectCertificates(fields: readonly SubjectField[]): SubjectCertificate[] {
  return fields.map(subjectCertificate);
}

/** The line under a subject's name: what is left, or when it was earned. */
export function subjectCertificateLabel(cert: SubjectCertificate): string {
  if (cert.status === "qualified") return "Qualified";
  if (cert.status === "retraining") return `Retraining — ${cert.done}/${cert.total} courses done`;
  if (cert.total === 0) return "Pending — no courses set for this subject yet";
  return `Pending — ${cert.done}/${cert.total} courses done`;
}
