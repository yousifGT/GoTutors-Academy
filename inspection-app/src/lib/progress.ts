/**
 * A centre over time, rather than one visit at a time.
 *
 * The report answers "how was this visit". Nothing yet answers the question the
 * person running the centre actually has, which is "am I getting better". Both
 * halves of that matter and only one of them was being worked out: the report
 * leads with what was flagged again, and nothing anywhere said what had been
 * put right. Told only what is still wrong, a centre head reads every report as
 * a list of failures and has no way to see that six of last quarter's ten
 * findings are gone.
 *
 * Everything here is derived from answers already stored. Comparison is on
 * question text, the same thread the repeat badges use, because the checklist
 * is versioned and question ids do not survive a new version. The consequence
 * is honest and worth stating: reword a question and its history stops
 * following it — the old finding reads as dropped, the new wording as new.
 */

/** SKIP and null both mean "no usable answer" — unanswered, or marked N/A. */
export type StoredBucket = "WELL" | "IMPROVE" | "OBS" | "SKIP" | null;

export interface VisitAnswer {
  questionText: string;
  bucket: StoredBucket;
  critical: boolean;
}

export interface Visit {
  id: string;
  date: Date;
  scorePct: number | null;
  verdict: string | null;
  inspector: string;
  answers: VisitAnswer[];
}

export interface Finding {
  question: string;
  critical: boolean;
  /** Consecutive visits, up to and including the latest, at which this was flagged. */
  visits: number;
}

export interface Movement {
  /** Flagged last time, and answered acceptably this time. */
  fixed: Finding[];
  /** Flagged last time and flagged again. */
  stillWrong: Finding[];
  /** Flagged this time, and not last time. */
  fresh: Finding[];
  /**
   * Flagged last time and not answered this time — unanswered, marked N/A, or
   * no longer on the checklist. Kept apart from `fixed` deliberately: a
   * question nobody asked again is not a problem anybody solved, and folding
   * the two together would report progress that never happened.
   */
  unchecked: Finding[];
}

export interface CentreProgress {
  /** Submitted visits, newest first. */
  visits: Visit[];
  latest: Visit | null;
  previous: Visit | null;
  /** Percentage points, latest minus previous. Null until there are two visits. */
  scoreChange: number | null;
  movement: Movement | null;
  /** Critical items failed at the latest visit. */
  criticalNow: Finding[];
  /** Everything currently flagged, longest-running first. */
  outstanding: Finding[];
}

/** The minimum needed to compare two visits: what was asked, and how it went. */
export interface MinimalAnswer {
  questionText: string;
  bucket: StoredBucket;
}

const flagged = (a: MinimalAnswer) => a.bucket === "IMPROVE";
const answered = (a: MinimalAnswer) => a.bucket === "WELL" || a.bucket === "OBS" || a.bucket === "IMPROVE";

/**
 * Which questions moved which way between two visits, by wording.
 *
 * The one place the four categories are decided. The centre dashboard needs
 * them as findings and the CSV export needs them as counts; splitting the rule
 * in two so each could have the shape it wanted is how the two would come to
 * disagree about how many things a centre had put right.
 */
export function compare(
  latest: MinimalAnswer[],
  previous: MinimalAnswer[]
): { fixed: string[]; stillWrong: string[]; fresh: string[]; unchecked: string[] } {
  const now = new Map(latest.map((a) => [a.questionText, a] as const));
  const before = new Map(previous.map((a) => [a.questionText, a] as const));

  const fixed: string[] = [];
  const stillWrong: string[] = [];
  const unchecked: string[] = [];
  for (const a of previous) {
    if (!flagged(a)) continue;
    const then = now.get(a.questionText);
    if (!then || !answered(then)) unchecked.push(a.questionText);
    else if (flagged(then)) stillWrong.push(a.questionText);
    else fixed.push(a.questionText);
  }

  const fresh = latest
    .filter(flagged)
    .filter((a) => {
      const then = before.get(a.questionText);
      // Not asked last time counts as new: it is the first time this centre has
      // been told about it, which is what the heading claims.
      return !then || !flagged(then);
    })
    .map((a) => a.questionText);

  return { fixed, stillWrong, fresh, unchecked };
}

function index(visit: Visit): Map<string, VisitAnswer> {
  const map = new Map<string, VisitAnswer>();
  // Last write wins. Two questions worded the same are refused by the checklist
  // editor for exactly this reason, but a checklist seeded before that rule
  // existed could still hold a pair.
  for (const a of visit.answers) map.set(a.questionText, a);
  return map;
}

/** Index every visit once, rather than once per finding per visit. */
function indexAll(visits: Visit[]): Map<string, VisitAnswer>[] {
  return visits.map(index);
}

/**
 * How many visits in a row, counting back from the newest, this question has
 * been flagged at. A finding raised three visits running is a different thing
 * from one raised once, and is the number worth putting in front of somebody.
 *
 * The run stops at the first visit that did not flag it — including a visit
 * that did not ask it at all. A gap in the record is not evidence of a run.
 */
export function streak(question: string, visitsNewestFirst: Visit[]): number {
  return streakIn(question, indexAll(visitsNewestFirst));
}

function streakIn(question: string, byVisit: Map<string, VisitAnswer>[]): number {
  let n = 0;
  for (const visit of byVisit) {
    const a = visit.get(question);
    if (a && flagged(a)) n++;
    else break;
  }
  return n;
}

/** Critical first, then the longest-running, then alphabetically so it is stable. */
function order(a: Finding, b: Finding): number {
  if (a.critical !== b.critical) return a.critical ? -1 : 1;
  if (a.visits !== b.visits) return b.visits - a.visits;
  return a.question.localeCompare(b.question);
}

/**
 * @param visits every SUBMITTED visit to one centre, newest first.
 */
export function progressFor(visits: Visit[]): CentreProgress {
  const latest = visits[0] ?? null;
  const previous = visits[1] ?? null;

  if (!latest) {
    return { visits, latest: null, previous: null, scoreChange: null, movement: null, criticalNow: [], outstanding: [] };
  }

  const byVisit = indexAll(visits);
  const finding = (a: VisitAnswer): Finding => ({
    question: a.questionText,
    critical: a.critical,
    visits: streakIn(a.questionText, byVisit),
  });

  const now = byVisit[0];
  const outstanding = latest.answers.filter(flagged).map(finding).sort(order);

  const criticalNow = outstanding.filter((f) => f.critical);

  if (!previous) {
    return { visits, latest, previous: null, scoreChange: null, movement: null, criticalNow, outstanding };
  }

  const moved = compare(latest.answers, previous.answers);
  // A question that was fixed or was not looked at again is named by the visit
  // that raised it, since this visit may not carry it at all.
  const fromPrevious = (text: string): Finding =>
    finding(byVisit[1].get(text) ?? { questionText: text, bucket: null, critical: false });
  const fromLatest = (text: string): Finding =>
    finding(now.get(text) ?? { questionText: text, bucket: null, critical: false });

  return {
    visits,
    latest,
    previous,
    scoreChange:
      latest.scorePct != null && previous.scorePct != null ? latest.scorePct - previous.scorePct : null,
    movement: {
      fixed: moved.fixed.map(fromPrevious).sort(order),
      stillWrong: moved.stillWrong.map(fromLatest).sort(order),
      fresh: moved.fresh.map(fromLatest).sort(order),
      unchecked: moved.unchecked.map(fromPrevious).sort(order),
    },
    criticalNow,
    outstanding,
  };
}

/**
 * The score at each visit, oldest first, for a trend line. Visits without a
 * recorded score are left out rather than plotted as zero.
 */
export function trend(visits: Visit[]): { date: Date; pct: number; id: string }[] {
  return visits
    .filter((v): v is Visit & { scorePct: number } => v.scorePct != null)
    .map((v) => ({ date: v.date, pct: v.scorePct, id: v.id }))
    .reverse();
}
