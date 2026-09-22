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
