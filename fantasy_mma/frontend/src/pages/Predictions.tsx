import React, { useState } from 'react';

// ---------------------------------------------------------------------------
// Types matching the Python PredictionResult / FightContext structure
// ---------------------------------------------------------------------------

interface TapologyMethodSplit {
  ko_pct: number;
  sub_pct: number;
  dec_pct: number;
}

interface FightInput {
  fighter_a: string;
  fighter_b: string;
  weight_class: string;
  is_five_rounds: boolean;
  tapology_prob: number | null;
  dratings_prob: number | null;
  elo_k170_prob: number | null;
  glicko_prob: number | null;
  whr_prob: number | null;
  betting_prob: number | null;
  elo_modified_prob: number | null;
  tapology_method_a: TapologyMethodSplit | null;
  tapology_method_b: TapologyMethodSplit | null;
  reach_a: number | null;
  reach_b: number | null;
  height_a: number | null;
  height_b: number | null;
  referee: string | null;
  age_a: number | null;
  age_b: number | null;
}

interface PredictionOutput {
  winner: string;
  loser: string;
  confidence: number;
  confidence_tier: string;
  primary_source: string;
  method: string;
  round: string;
  is_volatile: boolean;
  volatility_reasons: string[];
  reasoning: {
    layer1_winner: {
      source_agreement: string;
      dissenting: string[];
      source_breakdown: Record<string, number>;
    };
    layer2_method: {
      ko_pct: number;
      sub_pct: number;
      dec_pct: number;
      combined_finish_pct: number;
      modifiers_applied: string[];
      division_rates: { tko: number; sub: number; dec: number } | null;
    };
    layer3_round: {
      early_finish_profile: number;
      base: number;
      dominant_method_pct: number;
      bonuses: [string, number][];
      capped_bonus: number;
      division_thresholds: Record<string, number> | null;
      note: string;
    };
  };
}

// ---------------------------------------------------------------------------
// Source weights (mirrors fight_predictor.py — recalibrated)
// ---------------------------------------------------------------------------

const SOURCE_WEIGHTS: Record<string, number> = {
  tapology: 0.10,
  dratings: 0.15,
  elo_k170: 0.15,
  glicko: 0.15,
  whr: 0.20,
  betting: 0.20,
  elo_modified: 0.05,
};

const SOURCE_LABELS: Record<string, string> = {
  tapology: 'Tapology',
  dratings: 'DRatings',
  elo_k170: 'Elo K170',
  glicko: 'Glicko',
  whr: 'WHR',
  betting: 'Betting',
  elo_modified: 'Mod. Elo',
};

// Division finish rates from Gemini research
const DIVISION_FINISH_RATES: Record<string, { tko: number; sub: number; dec: number }> = {
  HW:   { tko: 48.4, sub: 21.6, dec: 28.7 },
  LHW:  { tko: 42.0, sub: 21.0, dec: 36.0 },
  MW:   { tko: 36.9, sub: 21.7, dec: 40.1 },
  WW:   { tko: 33.0, sub: 20.5, dec: 45.5 },
  LW:   { tko: 29.1, sub: 21.8, dec: 48.0 },
  FW:   { tko: 27.0, sub: 20.0, dec: 52.0 },
  BW:   { tko: 25.7, sub: 19.2, dec: 53.6 },
  FLW:  { tko: 22.0, sub: 20.0, dec: 57.0 },
  WSW:  { tko: 13.3, sub: 19.2, dec: 66.9 },
  WFLW: { tko: 16.6, sub: 19.6, dec: 63.8 },
  WBW:  { tko: 20.0, sub: 18.0, dec: 61.0 },
  WFW:  { tko: 22.0, sub: 18.0, dec: 59.0 },
};

const DIVISION_ROUND_THRESHOLDS_3RD: Record<string, Record<string, number>> = {
  HW:   { R1: 42, R2: 33, R3: 0 },
  LHW:  { R1: 45, R2: 36, R3: 0 },
  MW:   { R1: 48, R2: 39, R3: 0 },
  WW:   { R1: 50, R2: 41, R3: 0 },
  LW:   { R1: 52, R2: 43, R3: 0 },
  FW:   { R1: 52, R2: 43, R3: 0 },
  BW:   { R1: 54, R2: 45, R3: 0 },
  FLW:  { R1: 55, R2: 46, R3: 0 },
  WSW:  { R1: 58, R2: 49, R3: 0 },
  WFLW: { R1: 57, R2: 48, R3: 0 },
  WBW:  { R1: 56, R2: 47, R3: 0 },
  WFW:  { R1: 55, R2: 46, R3: 0 },
};

const DIVISION_ROUND_THRESHOLDS_5RD: Record<string, Record<string, number>> = {
  HW:   { R1: 45, R2: 36, R3: 28, R4: 0 },
  LHW:  { R1: 48, R2: 39, R3: 31, R4: 0 },
  MW:   { R1: 51, R2: 42, R3: 33, R4: 0 },
  WW:   { R1: 53, R2: 44, R3: 35, R4: 0 },
  LW:   { R1: 55, R2: 45, R3: 35, R4: 0 },
  FW:   { R1: 55, R2: 45, R3: 35, R4: 0 },
  BW:   { R1: 57, R2: 47, R3: 37, R4: 0 },
  FLW:  { R1: 58, R2: 48, R3: 38, R4: 0 },
  WSW:  { R1: 61, R2: 51, R3: 41, R4: 0 },
  WFLW: { R1: 60, R2: 50, R3: 40, R4: 0 },
  WBW:  { R1: 59, R2: 49, R3: 39, R4: 0 },
  WFW:  { R1: 58, R2: 48, R3: 38, R4: 0 },
};

const REFEREE_TENDENCIES: Record<string, { finish_modifier: number; note: string }> = {
  'herb dean':       { finish_modifier: 0,  note: 'Standard distribution' },
  'mark smith':      { finish_modifier: 3,  note: 'High favorite success' },
  'marc goddard':    { finish_modifier: 3,  note: 'High favorite success' },
  'jason herzog':    { finish_modifier: -3, note: 'High underdog ratio' },
  'kerry hatley':    { finish_modifier: -2, note: 'Leans underdog' },
  'dan miragliotta': { finish_modifier: 2,  note: 'Late stoppages' },
};

const EV_FINISH_THRESHOLD = 45.0;
const BETTING_BOOST_TIERS: [number, number][] = [[85, 35], [75, 25], [65, 15]];
const METHOD_CONFIDENCE_SCALE = 0.50;
const BONUS_LOSER_POWER_PUNCHER = 5.0;
const BONUS_LOPSIDED = 5.0;
const MAX_BONUS_CAP = 8.0;
const REACH_KO_MOD_PER_INCH = 2.0;

// ---------------------------------------------------------------------------
// Client-side prediction engine (mirrors fight_predictor.py)
// ---------------------------------------------------------------------------

function runPrediction(fight: FightInput): PredictionOutput | null {
  // Gather sources
  const sources: { name: string; prob: number }[] = [];
  if (fight.tapology_prob != null) sources.push({ name: 'tapology', prob: fight.tapology_prob });
  if (fight.dratings_prob != null) sources.push({ name: 'dratings', prob: fight.dratings_prob });
  if (fight.elo_k170_prob != null) sources.push({ name: 'elo_k170', prob: fight.elo_k170_prob });
  if (fight.glicko_prob != null) sources.push({ name: 'glicko', prob: fight.glicko_prob });
  if (fight.whr_prob != null) sources.push({ name: 'whr', prob: fight.whr_prob });
  if (fight.betting_prob != null) sources.push({ name: 'betting', prob: fight.betting_prob });
  if (fight.elo_modified_prob != null) sources.push({ name: 'elo_modified', prob: fight.elo_modified_prob });

  if (sources.length === 0) return null;

  // --- Layer 1: Winner ---
  let totalWeight = 0;
  let weightedSum = 0;
  for (const s of sources) {
    const w = SOURCE_WEIGHTS[s.name] ?? 0.10;
    weightedSum += s.prob * w;
    totalWeight += w;
  }
  const avgProbA = totalWeight > 0 ? weightedSum / totalWeight : 0.5;

  let winner: string, loser: string, confidence: number;
  if (avgProbA >= 0.5) {
    winner = fight.fighter_a;
    loser = fight.fighter_b;
    confidence = avgProbA * 100;
  } else {
    winner = fight.fighter_b;
    loser = fight.fighter_a;
    confidence = (1 - avgProbA) * 100;
  }

  const agreeCount = sources.filter(s => (s.prob >= 0.5) === (avgProbA >= 0.5)).length;
  const dissenting = sources.filter(s => (s.prob >= 0.5) !== (avgProbA >= 0.5)).map(s => s.name);
  const agreeing = sources.filter(s => (s.prob >= 0.5) === (avgProbA >= 0.5));
  const primarySource = agreeing.length > 0
    ? agreeing.reduce((a, b) => (SOURCE_WEIGHTS[a.name] ?? 0) >= (SOURCE_WEIGHTS[b.name] ?? 0) ? a : b).name
    : sources[0].name;

  const sourceBreakdown: Record<string, number> = {};
  for (const s of sources) {
    sourceBreakdown[s.name] = avgProbA >= 0.5
      ? Math.round(s.prob * 1000) / 10
      : Math.round((1 - s.prob) * 1000) / 10;
  }

  let isVolatile = false;
  const volatilityReasons: string[] = [];
  const closeMargins = sources.filter(s => Math.abs(s.prob - 0.5) < 0.08).map(s => s.name);
  if (closeMargins.length > 0) { isVolatile = true; volatilityReasons.push(`Close margins: ${closeMargins.join(', ')}`); }
  const probs = sources.map(s => s.prob);
  if (probs.length >= 2) {
    const spread = Math.max(...probs) - Math.min(...probs);
    if (spread >= 0.25) { isVolatile = true; volatilityReasons.push(`High variance (${(Math.min(...probs) * 100).toFixed(1)}% - ${(Math.max(...probs) * 100).toFixed(1)}%)`); }
  }
  if (dissenting.length > 0) isVolatile = true;

  const confidenceTier = confidence >= 65 ? 'high' : confidence >= 55 ? 'medium' : 'low';

  // --- Layer 2: Method ---
  const winnerMethodSplit = winner === fight.fighter_a ? fight.tapology_method_a : fight.tapology_method_b;
  const loserMethodSplit = winner === fight.fighter_a ? fight.tapology_method_b : fight.tapology_method_a;
  const ms = winnerMethodSplit ?? { ko_pct: 25, sub_pct: 15, dec_pct: 60 };

  let koPct = ms.ko_pct;
  let subPct = ms.sub_pct;
  let decPct = ms.dec_pct;
  const modifiersApplied: string[] = [];

  // Division blend
  const divRates = DIVISION_FINISH_RATES[fight.weight_class] ?? null;
  if (divRates) {
    const bw = 0.30;
    koPct = koPct * (1 - bw) + divRates.tko * bw;
    subPct = subPct * (1 - bw) + divRates.sub * bw;
    decPct = decPct * (1 - bw) + divRates.dec * bw;
    modifiersApplied.push(`Division blend (${fight.weight_class}: ${divRates.tko.toFixed(0)}% TKO)`);
  }

  // Betting boost
  if (fight.betting_prob != null) {
    const winnerBetting = winner === fight.fighter_a ? fight.betting_prob * 100 : (1 - fight.betting_prob) * 100;
    for (const [threshold, boost] of BETTING_BOOST_TIERS) {
      if (winnerBetting >= threshold) {
        const finishTotal = koPct + subPct;
        if (finishTotal > 0) {
          koPct += boost * (koPct / finishTotal);
          subPct += boost * (subPct / finishTotal);
          decPct = Math.max(0, 100 - koPct - subPct);
          modifiersApplied.push(`Betting boost +${boost} (${winnerBetting.toFixed(0)}%)`);
        }
        break;
      }
    }
  }

  // Reach modifier
  if (fight.reach_a != null && fight.reach_b != null) {
    const reachDiff = winner === fight.fighter_a ? fight.reach_a - fight.reach_b : fight.reach_b - fight.reach_a;
    if (reachDiff > 0) {
      const koBoost = reachDiff * REACH_KO_MOD_PER_INCH;
      koPct += koBoost;
      decPct = Math.max(0, decPct - koBoost);
      modifiersApplied.push(`Reach +${reachDiff.toFixed(1)}in → KO +${koBoost.toFixed(1)}%`);
    }
  }

  // Referee modifier
  if (fight.referee) {
    const refData = REFEREE_TENDENCIES[fight.referee.toLowerCase()];
    if (refData && refData.finish_modifier !== 0) {
      const mod = refData.finish_modifier;
      const ft = koPct + subPct;
      if (ft > 0) {
        koPct += mod * (koPct / ft);
        subPct += mod * (subPct / ft);
        decPct = Math.max(0, decPct - mod);
        modifiersApplied.push(`Ref ${fight.referee}: ${refData.note} (${mod > 0 ? '+' : ''}${mod}%)`);
      }
    }
  }

  // 5-round modifier
  if (fight.is_five_rounds) {
    const ft = koPct + subPct;
    if (ft > 0) {
      koPct -= 3 * (koPct / ft);
      subPct -= 3 * (subPct / ft);
      decPct += 3;
      modifiersApplied.push('5-round fight: DEC +3%');
    }
  }

  // Normalize
  const total = koPct + subPct + decPct;
  if (total > 0) { koPct = koPct / total * 100; subPct = subPct / total * 100; decPct = decPct / total * 100; }
  const combinedFinish = koPct + subPct;
  const method = combinedFinish >= EV_FINISH_THRESHOLD ? (koPct >= subPct ? 'KO' : 'SUB') : 'DEC';

  // --- Layer 3: Round ---
  let round = 'DEC';
  let earlyFinishProfile = 0;
  let base = 0;
  let dominantPct = 0;
  const bonuses: [string, number][] = [];
  let cappedBonus = 0;
  let divThresholds: Record<string, number> | null = null;

  if (method !== 'DEC') {
    dominantPct = method === 'KO' ? koPct : subPct;
    base = dominantPct * METHOD_CONFIDENCE_SCALE;
    let totalBonus = 0;

    const loserKoRate = loserMethodSplit?.ko_pct ?? 0;
    if (loserKoRate >= 50) {
      bonuses.push(['loser is power puncher', BONUS_LOSER_POWER_PUNCHER]);
      totalBonus += BONUS_LOSER_POWER_PUNCHER;
    }
    if (confidence >= 73) {
      bonuses.push(['lopsided matchup', BONUS_LOPSIDED]);
      totalBonus += BONUS_LOPSIDED;
    }
    cappedBonus = Math.min(totalBonus, MAX_BONUS_CAP);
    earlyFinishProfile = base + cappedBonus;

    const wc = fight.weight_class;
    const thresholdMap = fight.is_five_rounds
      ? (DIVISION_ROUND_THRESHOLDS_5RD[wc] ?? { R1: 55, R2: 45, R3: 35, R4: 0 })
      : (DIVISION_ROUND_THRESHOLDS_3RD[wc] ?? { R1: 52, R2: 43, R3: 0 });
    divThresholds = thresholdMap;

    round = fight.is_five_rounds ? 'R4' : 'R3'; // default
    for (const [rnd, thr] of Object.entries(thresholdMap)) {
      if (earlyFinishProfile >= thr) { round = rnd; break; }
    }
  }

  return {
    winner, loser, confidence: Math.round(confidence * 10) / 10,
    confidence_tier: confidenceTier, primary_source: primarySource,
    method, round, is_volatile: isVolatile, volatility_reasons: volatilityReasons,
    reasoning: {
      layer1_winner: {
        source_agreement: `${agreeCount}/${sources.length}`,
        dissenting,
        source_breakdown: sourceBreakdown,
      },
      layer2_method: {
        ko_pct: Math.round(koPct * 10) / 10,
        sub_pct: Math.round(subPct * 10) / 10,
        dec_pct: Math.round(decPct * 10) / 10,
        combined_finish_pct: Math.round(combinedFinish * 10) / 10,
        modifiers_applied: modifiersApplied,
        division_rates: divRates,
      },
      layer3_round: {
        early_finish_profile: Math.round(earlyFinishProfile * 10) / 10,
        base: Math.round(base * 10) / 10,
        dominant_method_pct: Math.round(dominantPct * 10) / 10,
        bonuses,
        capped_bonus: Math.round(cappedBonus * 10) / 10,
        division_thresholds: divThresholds,
        note: method === 'DEC'
          ? 'Decision - full fight'
          : `EFP ${earlyFinishProfile.toFixed(1)}% (base ${base.toFixed(1)} + bonus ${cappedBonus.toFixed(1)})`,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// UI Components
// ---------------------------------------------------------------------------

function ConfidenceBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    high: 'bg-green-100 text-green-800 border-green-300',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    low: 'bg-red-100 text-red-800 border-red-300',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[tier] ?? colors.low}`}>
      {tier.toUpperCase()}
    </span>
  );
}

function MethodBar({ ko, sub, dec }: { ko: number; sub: number; dec: number }) {
  return (
    <div className="w-full">
      <div className="flex h-6 rounded-full overflow-hidden text-xs font-medium">
        {ko > 0 && (
          <div className="bg-red-500 text-white flex items-center justify-center" style={{ width: `${ko}%` }}>
            {ko >= 10 ? `KO ${ko.toFixed(0)}%` : ''}
          </div>
        )}
        {sub > 0 && (
          <div className="bg-blue-500 text-white flex items-center justify-center" style={{ width: `${sub}%` }}>
            {sub >= 10 ? `SUB ${sub.toFixed(0)}%` : ''}
          </div>
        )}
        {dec > 0 && (
          <div className="bg-gray-400 text-white flex items-center justify-center" style={{ width: `${dec}%` }}>
            {dec >= 10 ? `DEC ${dec.toFixed(0)}%` : ''}
          </div>
        )}
      </div>
      <div className="flex justify-between mt-1 text-xs text-gray-500">
        <span>KO {ko.toFixed(1)}%</span>
        <span>SUB {sub.toFixed(1)}%</span>
        <span>DEC {dec.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function SourceBreakdownChart({ breakdown, dissenting }: { breakdown: Record<string, number>; dissenting: string[] }) {
  const maxVal = Math.max(...Object.values(breakdown), 51);
  return (
    <div className="space-y-1.5">
      {Object.entries(breakdown).map(([source, pct]) => {
        const isDissenting = dissenting.includes(source);
        const weight = SOURCE_WEIGHTS[source] ?? 0;
        return (
          <div key={source} className="flex items-center gap-2 text-xs">
            <span className={`w-16 text-right font-medium ${isDissenting ? 'text-red-600' : 'text-gray-700'}`}>
              {SOURCE_LABELS[source] ?? source}
            </span>
            <span className="w-8 text-right text-gray-400">{(weight * 100).toFixed(0)}%</span>
            <div className="flex-1 bg-gray-100 rounded-full h-3 relative">
              <div
                className={`h-3 rounded-full ${isDissenting ? 'bg-red-400' : pct >= 60 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-orange-400'}`}
                style={{ width: `${(pct / maxVal) * 100}%` }}
              />
            </div>
            <span className={`w-12 text-right font-mono ${isDissenting ? 'text-red-600' : 'text-gray-700'}`}>
              {pct.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RoundThresholdViz({ profile, thresholds, round: predictedRound }: {
  profile: number;
  thresholds: Record<string, number> | null;
  round: string;
}) {
  if (!thresholds || predictedRound === 'DEC') return null;
  const maxThreshold = Math.max(...Object.values(thresholds).filter(v => v > 0), profile) * 1.15;

  return (
    <div className="space-y-1.5 mt-2">
      {Object.entries(thresholds).map(([rnd, thr]) => {
        const isActive = rnd === predictedRound;
        return (
          <div key={rnd} className="flex items-center gap-2 text-xs">
            <span className={`w-8 font-medium ${isActive ? 'text-indigo-700' : 'text-gray-500'}`}>{rnd}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-4 relative">
              {thr > 0 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-gray-400 z-10"
                  style={{ left: `${(thr / maxThreshold) * 100}%` }}
                  title={`Threshold: ${thr}`}
                />
              )}
              <div
                className={`h-4 rounded-full ${isActive ? 'bg-indigo-500' : 'bg-gray-300'}`}
                style={{ width: `${(profile / maxThreshold) * 100}%` }}
              />
            </div>
            <span className="w-16 text-right text-gray-500 font-mono">
              {thr > 0 ? `>=${thr}` : 'default'}
            </span>
          </div>
        );
      })}
      <div className="text-xs text-gray-500 mt-1">
        Profile score: <span className="font-mono font-medium text-gray-700">{profile.toFixed(1)}</span>
      </div>
    </div>
  );
}

function FightPredictionCard({ fight, prediction }: { fight: FightInput; prediction: PredictionOutput }) {
  const [expanded, setExpanded] = useState(false);
  const l1 = prediction.reasoning.layer1_winner;
  const l2 = prediction.reasoning.layer2_method;
  const l3 = prediction.reasoning.layer3_round;

  return (
    <div className={`card border-l-4 ${
      prediction.confidence_tier === 'high' ? 'border-l-green-500' :
      prediction.confidence_tier === 'medium' ? 'border-l-yellow-500' : 'border-l-red-500'
    }`}>
      {/* Header: Matchup */}
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            {fight.fighter_a} vs {fight.fighter_b}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
            <span className="font-medium">{fight.weight_class}</span>
            {fight.is_five_rounds && (
              <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">5 Rounds</span>
            )}
            {fight.referee && <span>Ref: {fight.referee}</span>}
          </div>
        </div>
        {prediction.is_volatile && (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800 border border-orange-300">
            VOLATILE
          </span>
        )}
      </div>

      {/* Summary Row */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-center">
        {/* Layer 1 Summary */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Winner</div>
          <div className="mt-1 text-lg font-bold text-gray-900">{prediction.winner}</div>
          <div className="mt-1 flex items-center justify-center gap-1.5">
            <span className="text-sm font-mono font-medium">{prediction.confidence.toFixed(1)}%</span>
            <ConfidenceBadge tier={prediction.confidence_tier} />
          </div>
          <div className="mt-1 text-xs text-gray-400">
            Sources: {l1.source_agreement}
          </div>
        </div>

        {/* Layer 2 Summary */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Method</div>
          <div className={`mt-1 text-lg font-bold ${
            prediction.method === 'KO' ? 'text-red-600' :
            prediction.method === 'SUB' ? 'text-blue-600' : 'text-gray-600'
          }`}>
            {prediction.method}
          </div>
          <div className="mt-1 text-sm text-gray-500">
            Finish: {l2.combined_finish_pct.toFixed(0)}%
          </div>
          <div className="mt-1 text-xs text-gray-400">
            EV threshold: {EV_FINISH_THRESHOLD}%
          </div>
        </div>

        {/* Layer 3 Summary */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Round</div>
          <div className="mt-1 text-lg font-bold text-indigo-700">{prediction.round}</div>
          {prediction.method !== 'DEC' && (
            <>
              <div className="mt-1 text-sm text-gray-500">
                EFP: {l3.early_finish_profile.toFixed(1)}
              </div>
              <div className="mt-1 text-xs text-gray-400">
                {fight.weight_class} calibrated
              </div>
            </>
          )}
        </div>
      </div>

      {/* Volatility Warnings */}
      {prediction.is_volatile && prediction.volatility_reasons.length > 0 && (
        <div className="mt-3 bg-orange-50 border border-orange-200 rounded-md p-2 text-xs text-orange-700">
          {prediction.volatility_reasons.map((r, i) => <div key={i}>{r}</div>)}
          {l1.dissenting.length > 0 && (
            <div>Dissenting sources: {l1.dissenting.map(s => SOURCE_LABELS[s] ?? s).join(', ')}</div>
          )}
        </div>
      )}

      {/* Expand/Collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-4 w-full text-center text-sm text-indigo-600 hover:text-indigo-800 font-medium"
      >
        {expanded ? 'Hide Details' : 'Show Layer Details'}
      </button>

      {expanded && (
        <div className="mt-4 space-y-6 border-t pt-4">
          {/* Layer 1 Detail */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              Layer 1: Source Ensemble (Winner for {prediction.winner})
            </h4>
            <SourceBreakdownChart breakdown={l1.source_breakdown} dissenting={l1.dissenting} />
          </div>

          {/* Layer 2 Detail */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Layer 2: Method Breakdown</h4>
            <MethodBar ko={l2.ko_pct} sub={l2.sub_pct} dec={l2.dec_pct} />
            {l2.modifiers_applied.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {l2.modifiers_applied.map((m, i) => (
                  <div key={i} className="text-xs text-gray-500 flex items-center gap-1">
                    <span className="text-indigo-400">+</span> {m}
                  </div>
                ))}
              </div>
            )}
            {l2.division_rates && (
              <div className="mt-2 text-xs text-gray-400">
                {fight.weight_class} historical: TKO {l2.division_rates.tko}% | SUB {l2.division_rates.sub}% | DEC {l2.division_rates.dec}%
              </div>
            )}
          </div>

          {/* Layer 3 Detail */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              Layer 3: Round Prediction ({fight.weight_class} thresholds)
            </h4>
            {prediction.method === 'DEC' ? (
              <div className="text-sm text-gray-500">Decision — goes the distance</div>
            ) : (
              <>
                <RoundThresholdViz
                  profile={l3.early_finish_profile}
                  thresholds={l3.division_thresholds}
                  round={prediction.round}
                />
                {l3.bonuses.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {l3.bonuses.map(([label, val], i) => (
                      <div key={i} className="text-xs text-gray-500">
                        <span className="text-indigo-400">+{val}</span> {label}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-1 text-xs text-gray-400">{l3.note}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Predictions Page
// ---------------------------------------------------------------------------

const WEIGHT_CLASSES = ['HW', 'LHW', 'MW', 'WW', 'LW', 'FW', 'BW', 'FLW', 'WSW', 'WFLW', 'WBW', 'WFW'];

function emptyFight(): FightInput {
  return {
    fighter_a: '', fighter_b: '', weight_class: 'LW', is_five_rounds: false,
    tapology_prob: null, dratings_prob: null, elo_k170_prob: null,
    glicko_prob: null, whr_prob: null, betting_prob: null, elo_modified_prob: null,
    tapology_method_a: null, tapology_method_b: null,
    reach_a: null, reach_b: null, height_a: null, height_b: null,
    referee: null, age_a: null, age_b: null,
  };
}

const Predictions = () => {
  const [fights, setFights] = useState<FightInput[]>([]);
  const [predictions, setPredictions] = useState<(PredictionOutput | null)[]>([]);
  const [jsonInput, setJsonInput] = useState('');
  const [parseError, setParseError] = useState('');
  const [activeTab, setActiveTab] = useState<'paste' | 'manual'>('paste');

  // Parse pasted JSON from browser extension
  const handlePasteJson = () => {
    setParseError('');
    try {
      const data = JSON.parse(jsonInput);
      const fightList: FightInput[] = Array.isArray(data) ? data : [data];

      // Normalize: accept various field naming conventions
      const normalized = fightList.map((f: any): FightInput => ({
        fighter_a: f.fighter_a ?? f.fighterA ?? f.red_corner ?? f.redCorner ?? '',
        fighter_b: f.fighter_b ?? f.fighterB ?? f.blue_corner ?? f.blueCorner ?? '',
        weight_class: f.weight_class ?? f.weightClass ?? f.division ?? 'LW',
        is_five_rounds: f.is_five_rounds ?? f.isFiveRounds ?? f.five_rounds ?? f.title ?? false,
        tapology_prob: f.tapology_prob ?? f.tapologyProb ?? f.tapology ?? null,
        dratings_prob: f.dratings_prob ?? f.dratingsProb ?? f.dratings ?? null,
        elo_k170_prob: f.elo_k170_prob ?? f.eloK170Prob ?? f.elo_k170 ?? null,
        glicko_prob: f.glicko_prob ?? f.glickoProb ?? f.glicko ?? null,
        whr_prob: f.whr_prob ?? f.whrProb ?? f.whr ?? null,
        betting_prob: f.betting_prob ?? f.bettingProb ?? f.betting ?? null,
        elo_modified_prob: f.elo_modified_prob ?? f.eloModifiedProb ?? f.elo_modified ?? null,
        tapology_method_a: f.tapology_method_a ?? f.tapologyMethodA ?? f.method_a ?? null,
        tapology_method_b: f.tapology_method_b ?? f.tapologyMethodB ?? f.method_b ?? null,
        reach_a: f.reach_a ?? f.reachA ?? null,
        reach_b: f.reach_b ?? f.reachB ?? null,
        height_a: f.height_a ?? f.heightA ?? null,
        height_b: f.height_b ?? f.heightB ?? null,
        referee: f.referee ?? f.ref ?? null,
        age_a: f.age_a ?? f.ageA ?? null,
        age_b: f.age_b ?? f.ageB ?? null,
      }));

      setFights(normalized);
      const results = normalized.map(f => runPrediction(f));
      setPredictions(results);
    } catch (e: any) {
      setParseError(e.message ?? 'Invalid JSON');
    }
  };

  // Manual single-fight form
  const [manualFight, setManualFight] = useState<FightInput>(emptyFight());
  const [manualPrediction, setManualPrediction] = useState<PredictionOutput | null>(null);

  const handleManualPredict = () => {
    const result = runPrediction(manualFight);
    setManualPrediction(result);
  };

  const updateManual = (field: keyof FightInput, value: any) => {
    setManualFight(prev => ({ ...prev, [field]: value }));
  };

  const updateManualMethod = (fighter: 'a' | 'b', field: keyof TapologyMethodSplit, value: number) => {
    setManualFight(prev => {
      const key = fighter === 'a' ? 'tapology_method_a' : 'tapology_method_b';
      const current = prev[key] ?? { ko_pct: 0, sub_pct: 0, dec_pct: 0 };
      return { ...prev, [key]: { ...current, [field]: value } };
    });
  };

  // Round distribution summary
  const roundCounts: Record<string, number> = {};
  predictions.forEach(p => { if (p) roundCounts[p.round] = (roundCounts[p.round] ?? 0) + 1; });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Fight Predictions</h1>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${activeTab === 'paste' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('paste')}
          >
            Paste JSON
          </button>
          <button
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${activeTab === 'manual' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('manual')}
          >
            Manual Entry
          </button>
        </div>
      </div>

      {/* Model Info Banner */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-sm text-indigo-800">
        <div className="font-semibold mb-1">3-Layer Prediction Engine v2 (Research-Calibrated)</div>
        <div className="grid grid-cols-3 gap-4 text-xs">
          <div>
            <span className="font-medium">L1 Weights:</span> WHR 20%, Betting 20%, Glicko 15%, DRatings 15%, K170 15%, Tapology 10%, Mod.Elo 5%
          </div>
          <div>
            <span className="font-medium">L2 Modifiers:</span> Division rates, reach, referee, betting boost, 5-round
          </div>
          <div>
            <span className="font-medium">L3 Thresholds:</span> Division-specific (HW R1{">="}42 vs WSW R1{">="}58)
          </div>
        </div>
      </div>

      {/* === Paste JSON Tab === */}
      {activeTab === 'paste' && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Paste Scraped JSON</h2>
          <p className="text-sm text-gray-500 mb-3">
            Paste the JSON array from your browser extension (Tapology + FightMatrix + DRatings scrape).
          </p>
          <textarea
            className="input font-mono text-xs"
            rows={8}
            placeholder={'[\n  {\n    "fighter_a": "Fighter 1",\n    "fighter_b": "Fighter 2",\n    "weight_class": "LW",\n    "tapology_prob": 0.65,\n    "dratings_prob": 0.58,\n    ...\n  }\n]'}
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
          />
          {parseError && (
            <div className="mt-2 text-sm text-red-600">Parse error: {parseError}</div>
          )}
          <button className="btn btn-primary mt-3" onClick={handlePasteJson}>
            Run Predictions
          </button>
        </div>
      )}

      {/* === Manual Entry Tab === */}
      {activeTab === 'manual' && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Manual Fight Entry</h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Fighter Names */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fighter A (Red)</label>
              <input className="input" value={manualFight.fighter_a} onChange={e => updateManual('fighter_a', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fighter B (Blue)</label>
              <input className="input" value={manualFight.fighter_b} onChange={e => updateManual('fighter_b', e.target.value)} />
            </div>

            {/* Weight Class + Rounds */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Weight Class</label>
              <select className="input" value={manualFight.weight_class} onChange={e => updateManual('weight_class', e.target.value)}>
                {WEIGHT_CLASSES.map(wc => <option key={wc} value={wc}>{wc}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={manualFight.is_five_rounds} onChange={e => updateManual('is_five_rounds', e.target.checked)} />
                5-Round Fight
              </label>
            </div>

            {/* Source Probabilities */}
            <div className="col-span-2 border-t pt-3 mt-2">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Source Probabilities (Fighter A win prob, 0-1)</h3>
              <div className="grid grid-cols-4 gap-3">
                {(['tapology_prob', 'dratings_prob', 'elo_k170_prob', 'glicko_prob', 'whr_prob', 'betting_prob', 'elo_modified_prob'] as const).map(field => (
                  <div key={field}>
                    <label className="block text-xs text-gray-500 mb-0.5">{SOURCE_LABELS[field.replace('_prob', '')] ?? field}</label>
                    <input className="input text-sm" type="number" step="0.01" min="0" max="1" placeholder="0.00"
                      value={manualFight[field] ?? ''}
                      onChange={e => updateManual(field, e.target.value ? parseFloat(e.target.value) : null)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Method Splits */}
            <div className="col-span-2 border-t pt-3 mt-2">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Tapology Method Splits (0-100)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Fighter A</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['ko_pct', 'sub_pct', 'dec_pct'] as const).map(f => (
                      <div key={f}>
                        <label className="block text-xs text-gray-400">{f.replace('_pct', '').toUpperCase()}</label>
                        <input className="input text-sm" type="number" step="1" min="0" max="100"
                          value={manualFight.tapology_method_a?.[f] ?? ''}
                          onChange={e => updateManualMethod('a', f, parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Fighter B</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['ko_pct', 'sub_pct', 'dec_pct'] as const).map(f => (
                      <div key={f}>
                        <label className="block text-xs text-gray-400">{f.replace('_pct', '').toUpperCase()}</label>
                        <input className="input text-sm" type="number" step="1" min="0" max="100"
                          value={manualFight.tapology_method_b?.[f] ?? ''}
                          onChange={e => updateManualMethod('b', f, parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* New Fields: Reach, Height, Referee, Age */}
            <div className="col-span-2 border-t pt-3 mt-2">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Additional Data (optional)</h3>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Reach A (in)</label>
                  <input className="input text-sm" type="number" step="0.5"
                    value={manualFight.reach_a ?? ''} onChange={e => updateManual('reach_a', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Reach B (in)</label>
                  <input className="input text-sm" type="number" step="0.5"
                    value={manualFight.reach_b ?? ''} onChange={e => updateManual('reach_b', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Height A (in)</label>
                  <input className="input text-sm" type="number" step="0.5"
                    value={manualFight.height_a ?? ''} onChange={e => updateManual('height_a', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Height B (in)</label>
                  <input className="input text-sm" type="number" step="0.5"
                    value={manualFight.height_b ?? ''} onChange={e => updateManual('height_b', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Age A</label>
                  <input className="input text-sm" type="number" step="0.1"
                    value={manualFight.age_a ?? ''} onChange={e => updateManual('age_a', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Age B</label>
                  <input className="input text-sm" type="number" step="0.1"
                    value={manualFight.age_b ?? ''} onChange={e => updateManual('age_b', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-0.5">Referee</label>
                  <input className="input text-sm" placeholder="e.g. Herb Dean"
                    value={manualFight.referee ?? ''} onChange={e => updateManual('referee', e.target.value || null)} />
                </div>
              </div>
            </div>
          </div>
          <button className="btn btn-primary mt-4" onClick={handleManualPredict}>
            Run Prediction
          </button>

          {manualPrediction && (
            <div className="mt-6">
              <FightPredictionCard fight={manualFight} prediction={manualPrediction} />
            </div>
          )}
        </div>
      )}

      {/* === Results from JSON Paste === */}
      {activeTab === 'paste' && predictions.length > 0 && (
        <>
          {/* Card-level Summary */}
          <div className="card bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Card Summary</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-500">Round Distribution</div>
                <div className="mt-1 space-y-1">
                  {Object.entries(roundCounts).sort().map(([rnd, count]) => (
                    <div key={rnd} className="flex items-center gap-2 text-sm">
                      <span className="w-8 font-medium text-gray-700">{rnd}</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-4">
                        <div className="bg-indigo-500 h-4 rounded-full" style={{ width: `${(count / predictions.length) * 100}%` }} />
                      </div>
                      <span className="w-16 text-right text-gray-600">
                        {count}/{predictions.length} ({((count / predictions.length) * 100).toFixed(0)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Method Distribution</div>
                <div className="mt-1 space-y-1">
                  {['KO', 'SUB', 'DEC'].map(m => {
                    const count = predictions.filter(p => p?.method === m).length;
                    return (
                      <div key={m} className="flex items-center gap-2 text-sm">
                        <span className={`w-8 font-medium ${m === 'KO' ? 'text-red-600' : m === 'SUB' ? 'text-blue-600' : 'text-gray-600'}`}>{m}</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-4">
                          <div className={`h-4 rounded-full ${m === 'KO' ? 'bg-red-500' : m === 'SUB' ? 'bg-blue-500' : 'bg-gray-400'}`}
                            style={{ width: `${(count / predictions.length) * 100}%` }} />
                        </div>
                        <span className="w-16 text-right text-gray-600">
                          {count}/{predictions.length} ({((count / predictions.length) * 100).toFixed(0)}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 text-sm text-gray-500">
                  Volatile: {predictions.filter(p => p?.is_volatile).length}/{predictions.length}
                </div>
              </div>
            </div>
          </div>

          {/* Individual Fight Cards */}
          <div className="space-y-4">
            {fights.map((fight, i) => {
              const pred = predictions[i];
              if (!pred) return null;
              return <FightPredictionCard key={i} fight={fight} prediction={pred} />;
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default Predictions;
