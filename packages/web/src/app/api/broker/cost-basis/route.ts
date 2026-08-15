import { NextRequest, NextResponse } from 'next/server';
import { COST_BASIS_STRATEGIES, type CostBasisStrategy } from '@inktrade/client';
import { costBasisStrategy, saveCostBasisSetting } from '@/lib/cost-basis';

export async function GET() {
  return NextResponse.json(await costBasisStrategy());
}

/** Change the default cost-basis strategy. Refused while an env override is set. */
export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { strategy?: string };
  const strategy = body.strategy?.toUpperCase() as CostBasisStrategy | undefined;

  if (!strategy || !COST_BASIS_STRATEGIES.includes(strategy)) {
    return NextResponse.json(
      { error: `strategy must be one of ${COST_BASIS_STRATEGIES.join(', ')}` },
      { status: 400 },
    );
  }

  const current = await costBasisStrategy();
  if (current.source === 'env') {
    // Accepting a write that INKTRADE_COST_BASIS immediately overrides would
    // report success for a change with no effect.
    return NextResponse.json(
      { error: 'A deployment-level INKTRADE_COST_BASIS override is active.' },
      { status: 403 },
    );
  }

  await saveCostBasisSetting(strategy);
  return NextResponse.json(await costBasisStrategy());
}
