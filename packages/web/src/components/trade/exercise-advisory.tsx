'use client';

import {
  alternativeToExercise,
  exerciseAdvisory,
  type BrokerId,
  type OptionDetail,
  type OrderSide,
} from '@inktrade/client';

/**
 * The warning that has a deadline.
 *
 * Robinhood allocates an exercise or an assignment first-in-first-out, accepts
 * no lot selection, and has no account-level setting to change it. The only
 * remedy is to call their support **the same day** and ask them to reallocate.
 *
 * So this is styled to interrupt. Everything else in the app can wait until
 * tomorrow; this cannot, and a calm grey note would be a lie about that.
 */
export function ExerciseAdvisory({
  broker,
  option,
  side,
  assigned,
}: {
  broker: BrokerId;
  option: Pick<OptionDetail, 'putCall'>;
  /** BUY for a long position, SELL for a short one. */
  side: OrderSide;
  /** True once it has happened — the alternative is gone, the call is not. */
  assigned?: boolean;
}) {
  const advisory = exerciseAdvisory({ broker, putCall: option.putCall, side, assigned });
  if (!advisory) return null;

  const alternative = assigned ? null : alternativeToExercise({ putCall: option.putCall, side });

  return (
    <div
      role="alert"
      className="rounded-xl border border-rose/40 bg-rose/8 p-4"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 text-[14px] leading-none text-rose">
          ▲
        </span>
        <div className="min-w-0 space-y-2.5">
          <div>
            <h3 className="text-[14px] font-semibold text-rose">{advisory.title}</h3>
            {advisory.timeCritical && (
              <span className="mt-1 inline-block rounded bg-rose/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-rose">
                same day only
              </span>
            )}
          </div>

          <p className="text-[12px] leading-relaxed text-text-secondary">{advisory.body}</p>

          {advisory.action && (
            <p className="rounded-lg border border-rose/25 bg-rose/8 px-3 py-2 text-[12px] leading-relaxed text-rose">
              {advisory.action}
            </p>
          )}

          {alternative && (
            <div className="rounded-lg border border-border-subtle bg-surface/50 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                Instead
              </p>
              <ol className="mt-1.5 space-y-1">
                {alternative.steps.map((step, i) => (
                  <li key={step} className="flex gap-2 text-[12px] text-text-secondary">
                    <span className="font-mono text-text-muted">{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
                {alternative.tradeoff}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
