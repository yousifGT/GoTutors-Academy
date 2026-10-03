# The bench

The bench answers one question: **which model marks most like your tutors?**

It takes papers a tutor has already marked by hand, sends each one through every
model you name using the same request the app sends, and compares each model's
marks with the tutor's. Run it before you switch provider, before you pick a
cheaper model, and before you trust a model on your own machine.

```
npm run bench -- --models claude-opus-5,claude-sonnet-5,gpt-6-sol,gemini-3.8-flash
npm run bench -- --models claude-opus-5,claude-sonnet-5,gpt-6-sol,gemini-3.8-flash --yes
```

The first command spends nothing. It prints the answer key, which models are
ready, how many results are already cached, and an upper-bound cost for each.
Add `--yes` to run it.

## The answer key

The answer key is every paper in the centre that reads **"Checked by you"**
(status `REVIEWED`) and has photographs and at least one mark a person entered.
To build one, mark papers in the app with "Mark by hand", or correct papers a
model has already marked.

- **Aim for 20–30 papers, and include messy ones.** Neat handwriting flatters
  every model. The bench warns you below 30 papers, and says plainly that under
  10 is mostly noise.
- **Papers checked after a model marked them lean towards that model.** A tutor
  checking a model's marks agrees more readily than one marking from scratch.
  The bench tells you how many papers of each kind it has. When you have enough
  papers marked from scratch, use `--from-scratch-only`.
- **Each paper's own worked examples are left out of its prompt.** Checking a
  paper saves examples from that paper. Leaving them in would show the model the
  tutor's answer to the question it is being tested on. Examples imported from
  an Obsidian vault have no source paper, so they stay in.

## Keys and models

A model's provider comes from its name:

| Name | Provider | Key |
|---|---|---|
| `claude-…` | Anthropic | `ANTHROPIC_API_KEY` |
| `gpt-…`, `o3…` and similar | OpenAI (Responses API) | `OPENAI_API_KEY` |
| `gemini-…` | Google (Gemini API) | `GEMINI_API_KEY` or `GOOGLE_API_KEY` |
| `local:<model>` | This machine (Ollama, LM Studio) | `LOCAL_API_KEY` (optional) |

If a model's key is missing, the bench skips that model and carries on. A
misspelt model name stops the bench before it spends anything.

Set keys for the single command and keep them out of git:

```
ANTHROPIC_API_KEY=… OPENAI_API_KEY=… GEMINI_API_KEY=… npm run bench -- --models … --yes
```

Each base URL can be overridden with `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`,
`GEMINI_BASE_URL` and `LOCAL_MODEL_URL`. Requests that get a 429, a 5xx or a
network error are retried up to four times, with backoff, and `retry-after` is
honoured.

### Local models

```
ollama pull qwen3-vl:32b
npm run bench -- --models claude-opus-5,local:qwen3-vl:32b --yes
```

`LOCAL_MODEL_URL` defaults to Ollama's `http://localhost:11434/v1`. For LM
Studio, use `http://localhost:1234/v1`. The model must be able to read images.

Ollama documents JSON mode but not schema-constrained output. So by default the
bench asks for `json_object` and puts the schema in the prompt text.
`LOCAL_RESPONSE_FORMAT` can be set to one of:

| Value | What it does |
|---|---|
| `json_object` | The default: asks for JSON and carries the schema in the prompt |
| `json_schema` | Sends the schema as a constraint, for servers that support it |
| `none` | Asks for no response format at all |

Local models cost £0 in the table. That figure leaves out hardware and power.

## Flags

| Flag | Default | |
|---|---|---|
| `--models a,b,c` | none, so it is required | Models to compare |
| `--yes` | off | Spend money. Without it the bench only plans |
| `--limit N` | 30 | Most recent checked papers to use |
| `--scheme <id>` | all | Only papers marked against one mark scheme |
| `--org <id>` | the only centre | Needed when the database holds more than one centre |
| `--from-scratch-only` | off | Only papers a tutor marked without a model first |
| `--examples on\|off` | on | Include the worked examples (the brain) in the prompt |
| `--concurrency N` | 2 | Papers in flight per model |
| `--timeout S` | 300 | Seconds before one call is given up |
| `--fx R` | 0.7545 | Pounds per dollar |
| `--out DIR` | `bench-results` | Where the cache and reports go |
| `--fresh` | off | Ignore the cache and pay again |

`--examples off` tells you how much the brain is worth. Run the same models
with it on and off. The gap between the two runs is what your tutors'
corrections have taught the model.

## The cache

Every reply a model actually gave is cached under `bench-results/cache/`. The
cache key is the exact request: the model, the prompt, the mark scheme, the
worked examples and the photographs. This has three consequences:

- An interrupted run resumes without paying twice.
- A re-run with the same papers and the same brain costs nothing.
- Changing the scheme, the examples or the prompt misses the cache, as it
  should.

**A reply that won't parse is still cached.** A model that answers with
something other than marks has given its answer, and that answer is what the
bench is measuring. **A timeout, a rate limit or an HTTP error is not cached.**
These say nothing about the model, so the next run tries those papers again.

Use `--fresh` to ignore the cache, for example after a provider updates a model
without renaming it.

## Reading the results

The console prints one row per model. Each run also writes
`bench-results/<time>/report.md` and `results.json`.

| Column | Meaning |
|---|---|
| **Wrong & unchecked** | **The number that matters most.** Wrong marks on papers the model was confident enough to send out without anyone checking them, as a share of all questions. Lower is better. |
| Papers to a person | Tutor workload: papers the model flagged for checking or could not mark. A model that sends everything to a person is safe and useless. |
| Marks right | Questions where the model's mark matched the tutor's exactly. |
| Within 1 | Questions within one mark of the tutor's. |
| Reading | How closely the model's transcript of the handwriting matched the tutor's (1 − edit distance, after normalising case, spaces and symbols). |
| Failed | Papers the model could not mark at all. These count as wrong, flagged and sent to a person. |
| Time/paper, Cost/paper, Per 1,000 | Speed and list price in pounds. |

The report also lists the questions most models got wrong. Those are usually
questions where the mark scheme is unclear rather than the model.

**Choose on Wrong & unchecked first, then Papers to a person, then cost.** A
cheaper model that is confidently wrong more often costs more than the money it
saves.

Prices are list prices from `src/lib/bench/rates.ts`. Each rate carries the
date it was checked, plus any announced price changes. Update that file when
prices change. A model missing from the table shows `?` for cost.

## Privacy

`bench-results/` holds children's answers and the models' transcripts of them.
It is gitignored. Keep it on the centre's machine.
