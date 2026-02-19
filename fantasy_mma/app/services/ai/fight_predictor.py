"""
Multi-layer UFC fight prediction engine.

Layer 1: Winner Selection - Aggregates multiple sources (Tapology, DRatings,
         FightMatrix Elo/Glicko/WHR, Betting Odds) with research-calibrated
         weights. Includes volatility flags and source agreement tracking.

Layer 2: Method Selection - Uses Tapology method splits + betting odds finish
         modifiers + division-specific base rates + reach/height modifiers
         + referee tendencies to determine KO, SUB, or DEC.

Layer 3: Round Prediction - Uses early finish profile scoring with
         division-specific tiered round thresholds instead of one-size-fits-all.
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class SourcePrediction:
    """A single source's win probability for fighter A."""
    name: str
    fighter_a_prob: float  # 0.0 to 1.0

    @property
    def fighter_b_prob(self) -> float:
        return 1.0 - self.fighter_a_prob


@dataclass
class TapologyMethodSplit:
    """Tapology's predicted method of victory for a specific fighter."""
    ko_pct: float   # 0-100
    sub_pct: float  # 0-100
    dec_pct: float  # 0-100


@dataclass
class FightContext:
    """All input data for a single fight prediction."""
    fighter_a: str
    fighter_b: str
    weight_class: str
    is_five_rounds: bool = False

    # Source predictions (fighter A win probability, 0.0-1.0)
    tapology_prob: Optional[float] = None
    dratings_prob: Optional[float] = None
    elo_k170_prob: Optional[float] = None
    glicko_prob: Optional[float] = None
    whr_prob: Optional[float] = None
    betting_prob: Optional[float] = None
    elo_modified_prob: Optional[float] = None

    # Tapology method predictions for each fighter
    tapology_method_a: Optional[TapologyMethodSplit] = None
    tapology_method_b: Optional[TapologyMethodSplit] = None

    # Fighter metadata
    age_a: Optional[float] = None
    age_b: Optional[float] = None
    days_since_last_fight_a: Optional[int] = None
    days_since_last_fight_b: Optional[int] = None
    last_3_record_a: Optional[tuple] = None  # (wins, losses, draws)
    last_3_record_b: Optional[tuple] = None

    # Anthropometrics (new — from Gemini research)
    reach_a: Optional[float] = None  # inches
    reach_b: Optional[float] = None
    height_a: Optional[float] = None  # inches
    height_b: Optional[float] = None

    # Referee (new — from Gemini research)
    referee: Optional[str] = None

    # Historical KO rates for the loser (used in early finish calc)
    loser_ko_rate: Optional[float] = None  # 0-100, set after winner is determined


@dataclass
class PredictionResult:
    """Complete prediction output."""
    winner: str
    loser: str
    confidence: float          # 0-100
    confidence_tier: str       # "high", "medium", "low"
    primary_source: str
    method: str                # "KO", "SUB", "DEC"
    round: str                 # "R1", "R2", "R3", "R4", "DEC"
    is_volatile: bool
    volatility_reasons: list = field(default_factory=list)
    reasoning: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Layer 1: Winner Selection
# ---------------------------------------------------------------------------

# Source weights — recalibrated per Gemini research benchmarking.
# Key changes:
#   - Tapology 25% → 10% (crowd bias, emotional, popularity-driven)
#   - WHR 10% → 20% (best career trajectory model, accounts for opponent quality)
#   - Glicko 10% → 15% (RD factor handles inactivity/ring rust)
#   - Betting 15% → 20% (Brier 0.201, most efficient market baseline)
#   - Modified Elo 10% → 5% (experimental, reduce influence)
SOURCE_WEIGHTS = {
    "tapology": 0.10,
    "dratings": 0.15,
    "elo_k170": 0.15,
    "glicko": 0.15,
    "whr": 0.20,
    "betting": 0.20,
    "elo_modified": 0.05,
}

CLOSE_MARGIN_THRESHOLD = 0.08
HIGH_VARIANCE_THRESHOLD = 0.25


def select_winner(ctx: FightContext) -> dict:
    """
    Layer 1: Determine the predicted winner using a weighted source ensemble.

    Returns a dict with winner info, confidence, volatility flags, and reasoning.
    """
    sources = []
    if ctx.tapology_prob is not None:
        sources.append(SourcePrediction("tapology", ctx.tapology_prob))
    if ctx.dratings_prob is not None:
        sources.append(SourcePrediction("dratings", ctx.dratings_prob))
    if ctx.elo_k170_prob is not None:
        sources.append(SourcePrediction("elo_k170", ctx.elo_k170_prob))
    if ctx.glicko_prob is not None:
        sources.append(SourcePrediction("glicko", ctx.glicko_prob))
    if ctx.whr_prob is not None:
        sources.append(SourcePrediction("whr", ctx.whr_prob))
    if ctx.betting_prob is not None:
        sources.append(SourcePrediction("betting", ctx.betting_prob))
    if ctx.elo_modified_prob is not None:
        sources.append(SourcePrediction("elo_modified", ctx.elo_modified_prob))

    if not sources:
        raise ValueError("No prediction sources provided")

    # Weighted average
    total_weight = 0.0
    weighted_sum = 0.0
    for src in sources:
        w = SOURCE_WEIGHTS.get(src.name, 0.10)
        weighted_sum += src.fighter_a_prob * w
        total_weight += w

    avg_prob_a = weighted_sum / total_weight if total_weight > 0 else 0.5
    avg_prob_b = 1.0 - avg_prob_a

    # Determine winner
    if avg_prob_a >= avg_prob_b:
        winner = ctx.fighter_a
        loser = ctx.fighter_b
        confidence = avg_prob_a * 100
    else:
        winner = ctx.fighter_b
        loser = ctx.fighter_a
        confidence = avg_prob_b * 100

    # Source agreement analysis
    agree_count = sum(1 for s in sources if (s.fighter_a_prob >= 0.5) == (avg_prob_a >= 0.5))
    dissenting = [s.name for s in sources if (s.fighter_a_prob >= 0.5) != (avg_prob_a >= 0.5)]

    # Find primary source (highest weight among agreeing sources)
    agreeing_sources = [s for s in sources if (s.fighter_a_prob >= 0.5) == (avg_prob_a >= 0.5)]
    primary_source = max(agreeing_sources, key=lambda s: SOURCE_WEIGHTS.get(s.name, 0.10)).name \
        if agreeing_sources else sources[0].name

    # Per-source breakdown for UI display
    source_breakdown = {}
    for src in sources:
        if avg_prob_a >= 0.5:
            source_breakdown[src.name] = round(src.fighter_a_prob * 100, 1)
        else:
            source_breakdown[src.name] = round(src.fighter_b_prob * 100, 1)

    # Volatility analysis
    is_volatile = False
    volatility_reasons = []

    close_sources = [s.name for s in sources
                     if abs(s.fighter_a_prob - 0.5) < CLOSE_MARGIN_THRESHOLD]
    if close_sources:
        is_volatile = True
        volatility_reasons.append(f"Close margins: {', '.join(close_sources)}")

    probs = [s.fighter_a_prob for s in sources]
    if len(probs) >= 2:
        spread = max(probs) - min(probs)
        if spread >= HIGH_VARIANCE_THRESHOLD:
            is_volatile = True
            volatility_reasons.append(
                f"High variance between sources ({min(probs)*100:.1f}% - {max(probs)*100:.1f}%)"
            )

    if dissenting:
        is_volatile = True

    # Confidence tier
    if confidence >= 65:
        tier = "high"
    elif confidence >= 55:
        tier = "medium"
    else:
        tier = "low"

    return {
        "winner": winner,
        "loser": loser,
        "confidence": confidence,
        "confidence_tier": tier,
        "primary_source": primary_source,
        "is_volatile": is_volatile,
        "volatility_reasons": volatility_reasons,
        "source_agreement": f"{agree_count}/{len(sources)}",
        "dissenting": dissenting,
        "source_breakdown": source_breakdown,
    }


# ---------------------------------------------------------------------------
# Layer 2: Method Selection
# ---------------------------------------------------------------------------

EV_FINISH_THRESHOLD = 45.0

BETTING_BOOST_TIERS = [
    (85.0, 35),
    (75.0, 25),
    (65.0, 15),
]

# Division-specific finish rates from UFC historical data (Gemini research).
# Used as base rate modifiers — if the division has a high TKO rate, the
# model is more aggressive about predicting finishes.
DIVISION_FINISH_RATES = {
    "HW":   {"tko": 48.4, "sub": 21.6, "dec": 28.7},
    "LHW":  {"tko": 42.0, "sub": 21.0, "dec": 36.0},
    "MW":   {"tko": 36.9, "sub": 21.7, "dec": 40.1},
    "WW":   {"tko": 33.0, "sub": 20.5, "dec": 45.5},
    "LW":   {"tko": 29.1, "sub": 21.8, "dec": 48.0},
    "FW":   {"tko": 27.0, "sub": 20.0, "dec": 52.0},
    "BW":   {"tko": 25.7, "sub": 19.2, "dec": 53.6},
    "FLW":  {"tko": 22.0, "sub": 20.0, "dec": 57.0},
    "WSW":  {"tko": 13.3, "sub": 19.2, "dec": 66.9},
    "WFLW": {"tko": 16.6, "sub": 19.6, "dec": 63.8},
    "WBW":  {"tko": 20.0, "sub": 18.0, "dec": 61.0},
    "WFW":  {"tko": 22.0, "sub": 18.0, "dec": 59.0},
}

# Referee tendencies — average implied probability shift.
# Positive = favors favorites (higher finish rate), negative = favors underdogs.
# From Gemini research: Herzog/Hatley have high underdog win ratios.
REFEREE_TENDENCIES = {
    "herb dean":     {"finish_modifier": 0.0,  "note": "Standard distribution"},
    "mark smith":    {"finish_modifier": 3.0,  "note": "High favorite success"},
    "marc goddard":  {"finish_modifier": 3.0,  "note": "High favorite success"},
    "jason herzog":  {"finish_modifier": -3.0, "note": "High underdog ratio"},
    "kerry hatley":  {"finish_modifier": -2.0, "note": "Leans underdog"},
    "dan miragliotta": {"finish_modifier": 2.0, "note": "Late stoppages → more finishes"},
}

# Reach advantage modifier for KO prediction (per cm advantage).
# Research: +8% odds per cm for hooks, +10% for straights.
# We use a conservative blended modifier per inch (2.54 cm).
REACH_ADVANTAGE_KO_MODIFIER_PER_INCH = 2.0  # % boost to KO per inch of reach advantage


def select_method(ctx: FightContext, winner_info: dict) -> dict:
    """
    Layer 2: Determine predicted method of victory (KO, SUB, or DEC).

    Uses Tapology method splits as the base, adjusts with:
    - Betting odds finish modifier (tiered)
    - Division-specific base rates
    - Reach/height advantage KO modifier
    - Referee tendency adjustment
    - 5-round fight modifier
    """
    winner = winner_info["winner"]

    # Get Tapology method split for the predicted winner
    if winner == ctx.fighter_a and ctx.tapology_method_a:
        method_split = ctx.tapology_method_a
    elif winner == ctx.fighter_b and ctx.tapology_method_b:
        method_split = ctx.tapology_method_b
    else:
        method_split = TapologyMethodSplit(ko_pct=25, sub_pct=15, dec_pct=60)

    ko_pct = method_split.ko_pct
    sub_pct = method_split.sub_pct
    dec_pct = method_split.dec_pct

    modifiers_applied = []

    # --- Division base rate blending ---
    # Blend Tapology splits with division historical rates (70/30 split)
    div_rates = DIVISION_FINISH_RATES.get(ctx.weight_class)
    if div_rates:
        blend_weight = 0.30  # 30% division historical, 70% Tapology
        ko_pct = ko_pct * (1 - blend_weight) + div_rates["tko"] * blend_weight
        sub_pct = sub_pct * (1 - blend_weight) + div_rates["sub"] * blend_weight
        dec_pct = dec_pct * (1 - blend_weight) + div_rates["dec"] * blend_weight
        modifiers_applied.append(f"Division blend ({ctx.weight_class}: {div_rates['tko']:.0f}% TKO)")

    # --- Betting odds finish modifier ---
    betting_prob = ctx.betting_prob
    if betting_prob is not None:
        if winner == ctx.fighter_a:
            winner_betting = betting_prob * 100
        else:
            winner_betting = (1.0 - betting_prob) * 100

        for threshold, boost in BETTING_BOOST_TIERS:
            if winner_betting >= threshold:
                finish_total = ko_pct + sub_pct
                if finish_total > 0:
                    ko_share = ko_pct / finish_total
                    sub_share = sub_pct / finish_total
                    ko_pct += boost * ko_share
                    sub_pct += boost * sub_share
                    dec_pct = max(0, 100 - ko_pct - sub_pct)
                    modifiers_applied.append(f"Betting boost +{boost} (winner {winner_betting:.0f}%)")
                break

    # --- Reach/height advantage KO modifier ---
    if ctx.reach_a is not None and ctx.reach_b is not None:
        if winner == ctx.fighter_a:
            reach_diff = ctx.reach_a - ctx.reach_b
        else:
            reach_diff = ctx.reach_b - ctx.reach_a

        if reach_diff > 0:
            ko_boost = reach_diff * REACH_ADVANTAGE_KO_MODIFIER_PER_INCH
            ko_pct += ko_boost
            dec_pct = max(0, dec_pct - ko_boost)
            modifiers_applied.append(f"Reach advantage +{reach_diff:.1f}in → KO +{ko_boost:.1f}%")

    # --- Referee tendency modifier ---
    if ctx.referee:
        ref_data = REFEREE_TENDENCIES.get(ctx.referee.lower())
        if ref_data:
            modifier = ref_data["finish_modifier"]
            if modifier != 0:
                finish_total = ko_pct + sub_pct
                if finish_total > 0:
                    ko_share = ko_pct / finish_total
                    sub_share = sub_pct / finish_total
                    ko_pct += modifier * ko_share
                    sub_pct += modifier * sub_share
                    dec_pct = max(0, dec_pct - modifier)
                    modifiers_applied.append(f"Referee {ctx.referee}: {ref_data['note']} ({modifier:+.0f}%)")

    # --- 5-round fight modifier ---
    if ctx.is_five_rounds:
        dec_boost = 3.0
        if ko_pct + sub_pct > 0:
            finish_total = ko_pct + sub_pct
            ko_pct -= dec_boost * (ko_pct / finish_total)
            sub_pct -= dec_boost * (sub_pct / finish_total)
            dec_pct += dec_boost
            modifiers_applied.append("5-round fight: DEC +3%")

    # Normalize
    total = ko_pct + sub_pct + dec_pct
    if total > 0:
        ko_pct = ko_pct / total * 100
        sub_pct = sub_pct / total * 100
        dec_pct = dec_pct / total * 100

    combined_finish = ko_pct + sub_pct

    # EV threshold decision
    if combined_finish >= EV_FINISH_THRESHOLD:
        if ko_pct >= sub_pct:
            method = "KO"
        else:
            method = "SUB"
    else:
        method = "DEC"

    return {
        "method": method,
        "ko_pct": round(ko_pct, 1),
        "sub_pct": round(sub_pct, 1),
        "dec_pct": round(dec_pct, 1),
        "combined_finish_pct": round(combined_finish, 1),
        "modifiers_applied": modifiers_applied,
        "division_rates": DIVISION_FINISH_RATES.get(ctx.weight_class),
    }


# ---------------------------------------------------------------------------
# Layer 3: Round Prediction (Division-specific thresholds)
# ---------------------------------------------------------------------------
#
# Thresholds are now calibrated per division based on historical TKO rates.
# Heavy divisions (HW, LHW) have lower R1 thresholds because finishes are
# far more common — a 48.4% TKO rate at HW vs 13.3% at WSW means
# early-round predictions should be more aggressive for heavyweights.

METHOD_CONFIDENCE_SCALE = 0.50

BONUS_LOSER_POWER_PUNCHER = 5.0
BONUS_LOPSIDED = 5.0
MAX_BONUS_CAP = 8.0

# Division-specific round thresholds for 3-round fights.
# Higher TKO-rate divisions get lower thresholds (more R1/R2 predictions).
DIVISION_ROUND_THRESHOLDS_3RD = {
    "HW":   {"R1": 42.0, "R2": 33.0, "R3": 0.0},   # 48.4% TKO — most aggressive
    "LHW":  {"R1": 45.0, "R2": 36.0, "R3": 0.0},
    "MW":   {"R1": 48.0, "R2": 39.0, "R3": 0.0},
    "WW":   {"R1": 50.0, "R2": 41.0, "R3": 0.0},
    "LW":   {"R1": 52.0, "R2": 43.0, "R3": 0.0},   # Default / baseline
    "FW":   {"R1": 52.0, "R2": 43.0, "R3": 0.0},
    "BW":   {"R1": 54.0, "R2": 45.0, "R3": 0.0},
    "FLW":  {"R1": 55.0, "R2": 46.0, "R3": 0.0},
    "WSW":  {"R1": 58.0, "R2": 49.0, "R3": 0.0},   # 13.3% TKO — most conservative
    "WFLW": {"R1": 57.0, "R2": 48.0, "R3": 0.0},
    "WBW":  {"R1": 56.0, "R2": 47.0, "R3": 0.0},
    "WFW":  {"R1": 55.0, "R2": 46.0, "R3": 0.0},
}

# Division-specific round thresholds for 5-round fights.
DIVISION_ROUND_THRESHOLDS_5RD = {
    "HW":   {"R1": 45.0, "R2": 36.0, "R3": 28.0, "R4": 0.0},
    "LHW":  {"R1": 48.0, "R2": 39.0, "R3": 31.0, "R4": 0.0},
    "MW":   {"R1": 51.0, "R2": 42.0, "R3": 33.0, "R4": 0.0},
    "WW":   {"R1": 53.0, "R2": 44.0, "R3": 35.0, "R4": 0.0},
    "LW":   {"R1": 55.0, "R2": 45.0, "R3": 35.0, "R4": 0.0},
    "FW":   {"R1": 55.0, "R2": 45.0, "R3": 35.0, "R4": 0.0},
    "BW":   {"R1": 57.0, "R2": 47.0, "R3": 37.0, "R4": 0.0},
    "FLW":  {"R1": 58.0, "R2": 48.0, "R3": 38.0, "R4": 0.0},
    "WSW":  {"R1": 61.0, "R2": 51.0, "R3": 41.0, "R4": 0.0},
    "WFLW": {"R1": 60.0, "R2": 50.0, "R3": 40.0, "R4": 0.0},
    "WBW":  {"R1": 59.0, "R2": 49.0, "R3": 39.0, "R4": 0.0},
    "WFW":  {"R1": 58.0, "R2": 48.0, "R3": 38.0, "R4": 0.0},
}

# Fallback thresholds if weight class not in the lookup
FALLBACK_THRESHOLDS_3RD = {"R1": 52.0, "R2": 43.0, "R3": 0.0}
FALLBACK_THRESHOLDS_5RD = {"R1": 55.0, "R2": 45.0, "R3": 35.0, "R4": 0.0}


def predict_round(ctx: FightContext, winner_info: dict, method_info: dict) -> dict:
    """
    Layer 3: Predict the round of victory.

    Uses the Tapology method confidence as a continuous base to create natural
    variance between fights, then applies small targeted bonuses. Division-
    specific tiered thresholds account for the massive finish rate differences
    between weight classes (48.4% TKO at HW vs 13.3% at WSW).
    """
    method = method_info["method"]

    # Decisions go the distance
    if method == "DEC":
        if ctx.is_five_rounds:
            return {"round": "DEC", "note": "Decision - full 5 rounds",
                    "division_thresholds": None}
        return {"round": "DEC", "note": "Decision - full 3 rounds",
                "division_thresholds": None}

    # Calculate early finish profile
    if method == "KO":
        dominant_pct = method_info["ko_pct"]
    else:
        dominant_pct = method_info["sub_pct"]

    base = dominant_pct * METHOD_CONFIDENCE_SCALE
    bonuses = []
    total_bonus = 0.0

    if ctx.loser_ko_rate is not None and ctx.loser_ko_rate >= 50.0:
        bonuses.append(("loser is power puncher", BONUS_LOSER_POWER_PUNCHER))
        total_bonus += BONUS_LOSER_POWER_PUNCHER

    if winner_info["confidence"] >= 73.0:
        bonuses.append(("lopsided matchup", BONUS_LOPSIDED))
        total_bonus += BONUS_LOPSIDED

    capped_bonus = min(total_bonus, MAX_BONUS_CAP)
    early_finish_profile = base + capped_bonus

    # Select division-specific thresholds
    wc = ctx.weight_class
    if ctx.is_five_rounds:
        thresholds = DIVISION_ROUND_THRESHOLDS_5RD.get(wc, FALLBACK_THRESHOLDS_5RD)
    else:
        thresholds = DIVISION_ROUND_THRESHOLDS_3RD.get(wc, FALLBACK_THRESHOLDS_3RD)

    # Select round based on tiered thresholds
    predicted_round = None
    for round_name, threshold in thresholds.items():
        if early_finish_profile >= threshold:
            predicted_round = round_name
            break

    if predicted_round is None:
        predicted_round = "R3" if not ctx.is_five_rounds else "R4"

    return {
        "round": predicted_round,
        "early_finish_profile": round(early_finish_profile, 1),
        "base": round(base, 1),
        "dominant_method_pct": round(dominant_pct, 1),
        "bonuses": bonuses,
        "total_bonus": round(total_bonus, 1),
        "capped_bonus": round(capped_bonus, 1),
        "division_thresholds": thresholds,
        "note": f"Early finish profile {early_finish_profile:.1f}% "
                f"(base {base:.1f} from {method} {dominant_pct:.0f}% x {METHOD_CONFIDENCE_SCALE} "
                f"+ bonus {capped_bonus:.1f}, cap {MAX_BONUS_CAP}) "
                f"[{wc} thresholds: R1>={thresholds.get('R1', 'N/A')}]",
    }


# ---------------------------------------------------------------------------
# Main prediction function
# ---------------------------------------------------------------------------

def predict_fight(ctx: FightContext) -> PredictionResult:
    """
    Generate a complete fight prediction using the 3-layer system.
    """
    # Layer 1: Winner selection
    winner_info = select_winner(ctx)

    # Set loser KO rate on context if not already set
    if ctx.loser_ko_rate is None:
        loser = winner_info["loser"]
        if loser == ctx.fighter_a and ctx.tapology_method_a:
            ctx.loser_ko_rate = ctx.tapology_method_a.ko_pct
        elif loser == ctx.fighter_b and ctx.tapology_method_b:
            ctx.loser_ko_rate = ctx.tapology_method_b.ko_pct

    # Layer 2: Method selection
    method_info = select_method(ctx, winner_info)

    # Layer 3: Round prediction
    round_info = predict_round(ctx, winner_info, method_info)

    return PredictionResult(
        winner=winner_info["winner"],
        loser=winner_info["loser"],
        confidence=round(winner_info["confidence"], 1),
        confidence_tier=winner_info["confidence_tier"],
        primary_source=winner_info["primary_source"],
        method=method_info["method"],
        round=round_info["round"],
        is_volatile=winner_info["is_volatile"],
        volatility_reasons=winner_info["volatility_reasons"],
        reasoning={
            "layer1_winner": winner_info,
            "layer2_method": method_info,
            "layer3_round": round_info,
        },
    )
