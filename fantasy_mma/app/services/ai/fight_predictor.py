"""
Multi-layer UFC fight prediction engine.

Layer 1: Winner Selection - Aggregates multiple sources (Tapology, DRatings,
         FightMatrix Elo/Glicko/WHR, Betting Odds) to pick a winner with
         confidence scoring and volatility flags.

Layer 2: Method Selection - Uses Tapology method splits + betting odds finish
         modifiers to determine KO, SUB, or DEC via an EV-threshold approach.

Layer 3: Round Prediction - Uses early finish profile scoring with tiered
         round distribution (R1/R2/R3) instead of binary R1-or-DEC.
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
    round: str                 # "R1", "R2", "R3", "DEC"
    is_volatile: bool
    volatility_reasons: list = field(default_factory=list)
    reasoning: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Layer 1: Winner Selection
# ---------------------------------------------------------------------------

# Source weights for the weighted average
SOURCE_WEIGHTS = {
    "tapology": 0.25,
    "dratings": 0.15,
    "elo_k170": 0.15,
    "glicko": 0.10,
    "whr": 0.10,
    "betting": 0.15,
    "elo_modified": 0.10,
}

# Thresholds for close-margin volatility flag (within this % of 50%)
CLOSE_MARGIN_THRESHOLD = 0.08  # 8 percentage points from 50%

# High variance threshold between sources
HIGH_VARIANCE_THRESHOLD = 0.25  # 25 percentage point spread


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

    # Determine which source picks which fighter
    agree_count = sum(1 for s in sources if (s.fighter_a_prob >= 0.5) == (avg_prob_a >= 0.5))
    dissenting = [s.name for s in sources if (s.fighter_a_prob >= 0.5) != (avg_prob_a >= 0.5)]

    # Find primary source (highest weight among agreeing sources)
    agreeing_sources = [s for s in sources if (s.fighter_a_prob >= 0.5) == (avg_prob_a >= 0.5)]
    primary_source = max(agreeing_sources, key=lambda s: SOURCE_WEIGHTS.get(s.name, 0.10)).name \
        if agreeing_sources else sources[0].name

    # Volatility analysis
    is_volatile = False
    volatility_reasons = []

    # Check for close margins
    close_sources = [s.name for s in sources
                     if abs(s.fighter_a_prob - 0.5) < CLOSE_MARGIN_THRESHOLD]
    if close_sources:
        is_volatile = True
        volatility_reasons.append(f"Close margins: {', '.join(close_sources)}")

    # Check for high variance between sources
    probs = [s.fighter_a_prob for s in sources]
    if len(probs) >= 2:
        spread = max(probs) - min(probs)
        if spread >= HIGH_VARIANCE_THRESHOLD:
            is_volatile = True
            volatility_reasons.append(
                f"High variance between sources ({min(probs)*100:.1f}% - {max(probs)*100:.1f}%)"
            )

    # Check for dissenting sources
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
    }


# ---------------------------------------------------------------------------
# Layer 2: Method Selection
# ---------------------------------------------------------------------------

# EV threshold: combined finish probability must exceed this to predict a finish
EV_FINISH_THRESHOLD = 45.0

# Betting odds favorite thresholds for finish probability boost
BETTING_BOOST_TIERS = [
    (85.0, 35),  # >= 85% favorite → +35% finish boost
    (75.0, 25),  # >= 75% favorite → +25% finish boost
    (65.0, 15),  # >= 65% favorite → +15% finish boost
]


def select_method(ctx: FightContext, winner_info: dict) -> dict:
    """
    Layer 2: Determine predicted method of victory (KO, SUB, or DEC).

    Uses Tapology method splits as the base, adjusts with betting odds finish
    modifier and 5-round fight modifier, then applies EV threshold.
    """
    winner = winner_info["winner"]

    # Get Tapology method split for the predicted winner
    if winner == ctx.fighter_a and ctx.tapology_method_a:
        method_split = ctx.tapology_method_a
    elif winner == ctx.fighter_b and ctx.tapology_method_b:
        method_split = ctx.tapology_method_b
    else:
        # Fallback: default to decision-heavy split
        method_split = TapologyMethodSplit(ko_pct=25, sub_pct=15, dec_pct=60)

    ko_pct = method_split.ko_pct
    sub_pct = method_split.sub_pct
    dec_pct = method_split.dec_pct

    # Apply betting odds finish modifier
    betting_prob = ctx.betting_prob
    if betting_prob is not None:
        # Determine the winner's betting probability
        if winner == ctx.fighter_a:
            winner_betting = betting_prob * 100
        else:
            winner_betting = (1.0 - betting_prob) * 100

        # Apply tiered finish boost
        for threshold, boost in BETTING_BOOST_TIERS:
            if winner_betting >= threshold:
                finish_total = ko_pct + sub_pct
                if finish_total > 0:
                    ko_share = ko_pct / finish_total
                    sub_share = sub_pct / finish_total
                    ko_pct += boost * ko_share
                    sub_pct += boost * sub_share
                    dec_pct = max(0, 100 - ko_pct - sub_pct)
                break

    # Apply 5-round fight modifier (decisions slightly more likely in 5-rounders)
    if ctx.is_five_rounds:
        dec_boost = 3.0
        if ko_pct + sub_pct > 0:
            finish_total = ko_pct + sub_pct
            ko_pct -= dec_boost * (ko_pct / finish_total)
            sub_pct -= dec_boost * (sub_pct / finish_total)
            dec_pct += dec_boost

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
    }


# ---------------------------------------------------------------------------
# Layer 3: Round Prediction (FIXED - was previously always R1 or DEC)
# ---------------------------------------------------------------------------
#
# OLD LOGIC (broken):
#   - Calculate early_finish_profile with fixed base (55%) + stacking bonuses
#   - If >= 40% → R1 (always!)
#   - Else → DEC
#   - Result: 64% of fights predicted as R1, wildly unrealistic
#
# NEW LOGIC:
#   - Base derived from Tapology's method confidence (continuous, not fixed)
#     e.g. KO 94% → base 47, KO 63% → base 31.5, SUB 74% → base 37
#   - This creates natural variance between fights
#   - Small targeted bonuses for lopsided matchups and power puncher volatility
#   - Bonus cap keeps scores from running away
#   - Tiered thresholds distribute predictions across R1, R2, R3
#   - For 5-round fights, R4 is also possible

# Scaling factor for converting method confidence to early finish base.
# Tapology dominant method % (0-100) is multiplied by this.
# KO 94% → 47, KO 63% → 31.5, SUB 74% → 37, SUB 32% → 16
METHOD_CONFIDENCE_SCALE = 0.50

# Bonuses (small, targeted — the base provides most of the variance)
BONUS_LOSER_POWER_PUNCHER = 5.0   # Opponent has high KO rate → volatile early finish
BONUS_LOPSIDED = 5.0              # Strong favorite (>= 73% confidence) → likely finishes early

# Maximum total bonus cap
MAX_BONUS_CAP = 8.0

# Round prediction thresholds.
# Calibrated against UFC historical round distributions for finishes:
#   R1: ~30% of finishes  (requires very high early finish profile)
#   R2: ~30% of finishes  (moderate profile)
#   R3: ~40% of finishes  (default for any finish prediction)
ROUND_THRESHOLDS_3RD = {
    "R1": 52.0,   # Only the most lopsided KO-heavy fights
    "R2": 43.0,   # Moderate early finish profile
    "R3": 0.0,    # Default finish round
}

# 5-round fights: finishes spread across more rounds, R1 bar is higher
ROUND_THRESHOLDS_5RD = {
    "R1": 55.0,
    "R2": 45.0,
    "R3": 35.0,
    "R4": 0.0,    # Default finish round for 5-round fights
}


def predict_round(ctx: FightContext, winner_info: dict, method_info: dict) -> dict:
    """
    Layer 3: Predict the round of victory.

    Uses the Tapology method confidence as a continuous base to create natural
    variance between fights, then applies small targeted bonuses. Tiered
    thresholds distribute predictions across R1/R2/R3 instead of the old
    binary R1-or-DEC approach.
    """
    method = method_info["method"]

    # Decisions go the distance
    if method == "DEC":
        if ctx.is_five_rounds:
            return {"round": "DEC", "note": "Decision - full 5 rounds"}
        return {"round": "DEC", "note": "Decision - full 3 rounds"}

    # Calculate early finish profile using continuous base from method confidence.
    # The dominant method % from Layer 2 (after adjustments) drives the base,
    # so a KO 94% fight naturally scores higher than a KO 63% fight.
    if method == "KO":
        dominant_pct = method_info["ko_pct"]
    else:  # SUB
        dominant_pct = method_info["sub_pct"]

    base = dominant_pct * METHOD_CONFIDENCE_SCALE
    bonuses = []
    total_bonus = 0.0

    # Bonus: loser is a power puncher (high KO volatility → more likely early)
    if ctx.loser_ko_rate is not None and ctx.loser_ko_rate >= 50.0:
        bonuses.append(("loser is power puncher", BONUS_LOSER_POWER_PUNCHER))
        total_bonus += BONUS_LOSER_POWER_PUNCHER

    # Bonus: lopsided matchup (strong favorite tends to finish sooner)
    if winner_info["confidence"] >= 73.0:
        bonuses.append(("lopsided matchup", BONUS_LOPSIDED))
        total_bonus += BONUS_LOPSIDED

    # Cap total bonuses
    capped_bonus = min(total_bonus, MAX_BONUS_CAP)
    early_finish_profile = base + capped_bonus

    # Select round based on tiered thresholds
    thresholds = ROUND_THRESHOLDS_5RD if ctx.is_five_rounds else ROUND_THRESHOLDS_3RD
    predicted_round = None
    for round_name, threshold in thresholds.items():
        if early_finish_profile >= threshold:
            predicted_round = round_name
            break

    # Should always match at least the lowest threshold (0.0)
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
        "note": f"Early finish profile {early_finish_profile:.1f}% "
                f"(base {base:.1f} from {method} {dominant_pct:.0f}% × {METHOD_CONFIDENCE_SCALE} "
                f"+ bonus {capped_bonus:.1f}, cap {MAX_BONUS_CAP})",
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
    # (In practice this would come from Tapology method split for the loser)
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
