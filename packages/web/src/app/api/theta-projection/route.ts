import { NextRequest, NextResponse } from 'next/server';
import { computeSpreadProjection } from '@inktrade/engine/portfolio';

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;

  const shortStrike = p.get('shortStrike');
  const longStrike = p.get('longStrike');
  const spotPrice = p.get('spotPrice');
  const iv = p.get('iv');
  const currentDte = p.get('currentDte');
  const netCreditReceived = p.get('netCreditReceived');

  if (!shortStrike || !longStrike || !spotPrice || !iv || !currentDte || !netCreditReceived) {
    return NextResponse.json(
      { error: 'shortStrike, longStrike, spotPrice, iv, currentDte, and netCreditReceived are required' },
      { status: 400 },
    );
  }

  const contracts = p.get('contracts');
  const riskFreeRate = p.get('riskFreeRate');

  const projection = computeSpreadProjection({
    shortStrike: parseFloat(shortStrike),
    longStrike: parseFloat(longStrike),
    spotPrice: parseFloat(spotPrice),
    iv: parseFloat(iv),
    currentDte: parseInt(currentDte, 10),
    netCreditReceived: parseFloat(netCreditReceived),
    contracts: contracts ? parseInt(contracts, 10) : undefined,
    riskFreeRate: riskFreeRate ? parseFloat(riskFreeRate) : undefined,
  });

  return NextResponse.json(projection);
}
