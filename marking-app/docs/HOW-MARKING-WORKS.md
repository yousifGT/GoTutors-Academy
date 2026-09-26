# How the marking works

This is the file to read before changing anything in `src/lib/marking/`.

## The shape of it

```
photographs + mark scheme + worked examples
        │
        ▼
   marker.ts ──────── the only file that talks to a model
        │             returns RawMarking, or a readable reason it can't
        ▼
  scoring.ts ──────── checks what came back. Pure. Heavily tested.
        │             returns CheckedMarking
        ▼
      run.ts ──────── writes marks, decides MARKED vs NEEDS_HUMAN
        │
        ▼
  a person marks or corrects it  ──►  learning.ts  ──►  MarkingExample rows
                                                              │
                                        examples.ts ◄─────────┘
                                              │
                                        prompt.ts  ──►  next paper
```

Everything except `marker.ts` and `run.ts` is pure, has no imports from Next or
Prisma, and is unit tested. That is deliberate: the interesting decisions in
this system are decisions about numbers and trust, and those should be provable
without a network or a database.

## The rules that must not be relaxed

**The mark scheme owns the denominator.** `available` for a question always
comes from `MarkSchemeQuestion.marks`, never from the model. The model's
numerator is clamped into that range — and the fact that it needed clamping is
recorded as a reason the mark needs a human, because a numerator outside the
range means the reader lost track of which question it was on.

**A question with no mark is a zero, not a missing question.** If the model
returns nothing for question 3, question 3 still appears, still scores 0, still
counts 2 marks towards the denominator, and is flagged. Dropping it would make
the percentage a lie.

**Low confidence goes to a human.** `CONFIDENCE_FLOOR` in `scoring.ts` is the
single threshold; `confidenceLabel` in `view.ts` uses the same number so the
words on screen and the routing decision agree.

**Nothing invents a mark to avoid an error.** Every failure in `marker.ts` — no
key, a refusal, a timeout, an unparseable response — returns `ok: false` with a
sentence a tutor can read, and the paper goes to the queue. There is no code
path that fills in a plausible mark.

**A run never ends in MARKING.** Every exit from `runMarking` leaves the paper
in a state someone can act on. A row stuck in `MARKING` is invisible work.

## How "it learns"

There is no training run and no fine-tuning. The mechanism is entirely in
`examples.ts` and `learning.ts`:

- Every question a person checks leaves a `MarkingExample`: the student's
  answer, the mark, and the comment.
- A mark the person **changed** is stored as `HUMAN_CORRECTED`; one they looked
  at and left alone is `AI_CONFIRMED`.
- When the next paper on that scheme is marked, up to four examples per question
  are replayed into the prompt. Corrections outrank confirmations (a person only
  bothers to change a mark when the engine got it wrong, so that is where the
  information is); recent outranks old (so a marker who changes how they mark a
  question is followed, not argued with); and `spreadByScore` prefers one
  example of each score, because four full-mark examples teach the engine to
  award full marks.
- The system prompt tells the model to follow those examples over its own
  instinct. They are the house standard.

The scheme page shows how many examples exist and what proportion were
corrections. A high correction rate usually means a question's *guidance* is
thin, not that the reader is bad — and that is something the scheme's owner can
fix.

## Editing a mark scheme does not reset its learning

`PATCH /api/schemes/[id]` matches questions by label and updates them in place.
Delete-and-recreate would be shorter and would cascade away every
`MarkingExample` attached to those questions. Fixing a typo in a question's
wording must not throw away six months of marking standards.

## Testing

`npx vitest run` covers scoring, banding, feedback derivation, example
selection, prompt building, label normalisation, learning classification, access
scoping, status wording and configuration checks — without a model, a database
or a browser.

What unit tests cannot cover is whether the model reads handwriting well. That
needs real papers: mark a dozen by hand first, then turn on automatic marking
and compare. The correction rate on the scheme page is the number to watch.

## Quick marking, and when a paper belongs to nobody

`Submission.studentId` is nullable, and that is load-bearing rather than
incidental. Quick marking exists so a tutor can work through a pile of papers
without stopping to search for each child; the filing question is asked once, at
the end, on the results screen.

Three rules keep that from turning into a mess:

- **Nothing is filed by guessing.** A paper with no student stays with no
  student. `paperOwnerLabel` gives every screen one answer to "whose is this?" —
  the student's name, or whatever the tutor wrote on the paper, or "Unnamed
  paper". No screen invents its own placeholder.
- **Nothing is quietly lost.** An undecided paper appears under **Not stored
  yet**, with a badge in the sidebar, until somebody stores or discards it. A
  results screen that gets closed is not where that decision lives.
- **Discard only applies to unfiled papers.** Once a paper is on a child's
  record, deleting it belongs on their page with the warning that goes with it,
  not behind a "no thanks" button at the end of marking.

Papers marked together share a `batchId`, which is what makes a single PDF of a
whole session possible.

## Admission numbers

`Student.admissionNumber` is required and unique per organisation. Two children
sharing one makes every future search ambiguous, so both the create route and
the store-a-quick-marked-paper route refuse a duplicate — and the second one
hands back the existing child's id so the UI can offer "store it against them
instead" rather than leaving the tutor to work out what happened.

Search normalises case and separators (`A-0042`, `a 0042` and `A/0042` are the
same number) and ranks an exact match first, because `contains` alone puts
"GT-100" above the child actually numbered "GT-1".

## Why there is a browser test

`scripts/e2e-quick-marking.mjs` drives a real browser because of a bug that
unit tests and API tests both missed.

Every mutating request is CSRF-checked with `assertSameOrigin`, which requires a
JSON content-type. A bare `fetch(url, { method: "POST" })` sends none — so the
marking call fired by the upload form and the retry button was rejected with 415
on every press. The paper uploaded, the page loaded, and the paper simply sat at
"Not marked yet" forever. The API tests set the header themselves, so they were
exercising a request the browser never actually makes.

`src/lib/client.ts` now sets the header in one place, and the browser test
presses the button. Both matter: the helper stops it recurring, the test proves
it.

## Cost, and why caching is arranged the way it is

Run `npm run estimate-cost` (needs `ANTHROPIC_API_KEY` and a database with a
mark scheme in it). It builds the real prompt, counts its tokens with the API's
own counter, and prices it. Counting tokens is free — the script never runs a
marking request.

The prompt is deliberately split in two:

- **`system`** holds the examiner persona, the mark scheme, and every worked
  example. All of it is byte-identical for every paper marked against that
  scheme, and it carries the cache breakpoint.
- **the user message** holds the page images and one instruction line. Only
  this varies per paper.

That order matters more than it looks. Caching is a prefix match over
`tools -> system -> messages`, so anything that varies per request has to come
last. An earlier version put the scheme and examples in the user message
*after* the images: the prefix broke at the first image on every paper, and
nothing ever cached. `buildSchemeContext` is tested for byte-stability across
papers for exactly this reason.

Two numbers no static analysis can give you, both of which need a real run:

- **Thinking tokens.** Adaptive thinking is billed as output and is not in the
  response body. Read `usage.output_tokens` from a real marking run and put
  that in place of the script's assumption.
- **Whether the caching works.** `usage.cache_read_input_tokens` should
  dominate `input_tokens` from the second paper of a class set onwards. If it
  is zero, something is varying inside the prefix.

Worth knowing before optimising anything: at any current model, a paper costs
single-digit pence. Marking accuracy is the thing worth spending on, not
tokens.
