"""
Test the improved prediction engine against the event card
to verify round distribution is more realistic.
"""
from fantasy_mma.app.services.ai.fight_predictor import (
    FightContext, TapologyMethodSplit, predict_fight,
)


def build_fights():
    """Build the 14-fight card from the event data."""
    return [
        FightContext(
            fighter_a="Serghei Spivac", fighter_b="Ante Delija", weight_class="HW",
            tapology_prob=0.15, dratings_prob=0.426, elo_k170_prob=0.463,
            glicko_prob=0.46, whr_prob=0.45, betting_prob=0.405, elo_modified_prob=0.44,
            tapology_method_a=TapologyMethodSplit(ko_pct=71, sub_pct=10, dec_pct=19),
            tapology_method_b=TapologyMethodSplit(ko_pct=94, sub_pct=0, dec_pct=6),
            age_a=31.1, age_b=35.5,
        ),
        FightContext(
            fighter_a="Alden Coria", fighter_b="Luis Gurule", weight_class="FLW",
            tapology_prob=0.94, dratings_prob=0.653, elo_k170_prob=0.635,
            glicko_prob=0.64, whr_prob=0.59, betting_prob=0.738, elo_modified_prob=0.65,
            tapology_method_a=TapologyMethodSplit(ko_pct=73, sub_pct=2, dec_pct=25),
            tapology_method_b=TapologyMethodSplit(ko_pct=30, sub_pct=10, dec_pct=60),
            age_a=27.8, age_b=32.2,
        ),
        FightContext(
            fighter_a="Geoff Neal", fighter_b="Uroš Medić", weight_class="WW",
            tapology_prob=0.73, dratings_prob=0.586, elo_k170_prob=0.707,
            glicko_prob=0.68, whr_prob=0.65, betting_prob=0.633, elo_modified_prob=0.66,
            tapology_method_a=TapologyMethodSplit(ko_pct=83, sub_pct=1, dec_pct=16),
            tapology_method_b=TapologyMethodSplit(ko_pct=55, sub_pct=10, dec_pct=35),
            age_a=35.5, age_b=32.8,
        ),
        FightContext(
            fighter_a="Dan Ige", fighter_b="Melquizael Costa", weight_class="FW",
            tapology_prob=0.16, dratings_prob=0.391, elo_k170_prob=0.305,
            glicko_prob=0.35, whr_prob=0.478, betting_prob=0.364, elo_modified_prob=0.36,
            tapology_method_a=TapologyMethodSplit(ko_pct=40, sub_pct=10, dec_pct=50),
            tapology_method_b=TapologyMethodSplit(ko_pct=8, sub_pct=8, dec_pct=84),
            age_a=34.5, age_b=29.4,
        ),
        FightContext(
            fighter_a="Ramiz Brahimaj", fighter_b="Punahele Soriano", weight_class="WW",
            tapology_prob=0.73, dratings_prob=0.55, elo_k170_prob=0.428,
            glicko_prob=0.45, whr_prob=0.359, betting_prob=0.554, elo_modified_prob=0.48,
            tapology_method_a=TapologyMethodSplit(ko_pct=7, sub_pct=74, dec_pct=19),
            tapology_method_b=TapologyMethodSplit(ko_pct=55, sub_pct=5, dec_pct=40),
            age_a=33.2, age_b=33.2,
        ),
        FightContext(
            fighter_a="Zach Reese", fighter_b="Michel Pereira", weight_class="MW",
            tapology_prob=0.55, dratings_prob=0.392, elo_k170_prob=0.350,
            glicko_prob=0.38, whr_prob=0.40, betting_prob=0.435, elo_modified_prob=0.40,
            tapology_method_a=TapologyMethodSplit(ko_pct=55, sub_pct=10, dec_pct=35),
            tapology_method_b=TapologyMethodSplit(ko_pct=75, sub_pct=8, dec_pct=17),
            age_a=31.9, age_b=32.4,
        ),
        FightContext(
            fighter_a="Ode Osbourne", fighter_b="Alibi Idiris", weight_class="FLW",
            tapology_prob=0.38, dratings_prob=0.46, elo_k170_prob=0.256,
            glicko_prob=0.30, whr_prob=0.35, betting_prob=0.476, elo_modified_prob=0.35,
            tapology_method_a=TapologyMethodSplit(ko_pct=40, sub_pct=10, dec_pct=50),
            tapology_method_b=TapologyMethodSplit(ko_pct=13, sub_pct=11, dec_pct=75),
            age_a=34.1, age_b=31.3,
        ),
        FightContext(
            fighter_a="Jacobe Smith", fighter_b="Josiah Harrell", weight_class="WW",
            tapology_prob=0.92, dratings_prob=0.818, elo_k170_prob=0.520,
            glicko_prob=0.55, whr_prob=0.414, betting_prob=0.747, elo_modified_prob=0.60,
            tapology_method_a=TapologyMethodSplit(ko_pct=71, sub_pct=7, dec_pct=22),
            tapology_method_b=TapologyMethodSplit(ko_pct=40, sub_pct=15, dec_pct=45),
            age_a=30.1, age_b=27.2,
        ),
        FightContext(
            fighter_a="Chidi Njokuani", fighter_b="Carlos Leal", weight_class="WW",
            tapology_prob=0.35, dratings_prob=0.414, elo_k170_prob=0.469,
            glicko_prob=0.45, whr_prob=0.48, betting_prob=0.489, elo_modified_prob=0.46,
            tapology_method_a=TapologyMethodSplit(ko_pct=71, sub_pct=2, dec_pct=27),
            tapology_method_b=TapologyMethodSplit(ko_pct=85, sub_pct=1, dec_pct=14),
            age_a=37.1, age_b=31.8,
        ),
        FightContext(
            fighter_a="Sean Strickland", fighter_b="Anthony Hernandez", weight_class="MW",
            is_five_rounds=True,
            tapology_prob=0.33, dratings_prob=0.321, elo_k170_prob=0.411,
            glicko_prob=0.38, whr_prob=0.40, betting_prob=0.309, elo_modified_prob=0.37,
            tapology_method_a=TapologyMethodSplit(ko_pct=45, sub_pct=10, dec_pct=45),
            tapology_method_b=TapologyMethodSplit(ko_pct=7, sub_pct=32, dec_pct=61),
            age_a=35.0, age_b=32.3,
        ),
        FightContext(
            fighter_a="Nora Cornolle", fighter_b="Joselyne Edwards", weight_class="BW",
            tapology_prob=0.08, dratings_prob=0.354, elo_k170_prob=0.324,
            glicko_prob=0.35, whr_prob=0.506, betting_prob=0.279, elo_modified_prob=0.33,
            tapology_method_a=TapologyMethodSplit(ko_pct=20, sub_pct=15, dec_pct=65),
            tapology_method_b=TapologyMethodSplit(ko_pct=12, sub_pct=3, dec_pct=86),
            age_a=36.2, age_b=30.4,
        ),
        FightContext(
            fighter_a="Juliana Miller", fighter_b="Carli Judice", weight_class="FLW",
            tapology_prob=0.05, dratings_prob=0.262, elo_k170_prob=0.459,
            glicko_prob=0.40, whr_prob=0.42, betting_prob=0.156, elo_modified_prob=0.35,
            tapology_method_a=TapologyMethodSplit(ko_pct=15, sub_pct=20, dec_pct=65),
            tapology_method_b=TapologyMethodSplit(ko_pct=63, sub_pct=1, dec_pct=36),
            age_a=29.8, age_b=26.9,
        ),
        FightContext(
            fighter_a="Phil Rowe", fighter_b="Jean-Paul Lebosnoyani", weight_class="WW",
            tapology_prob=0.17, dratings_prob=0.50, elo_k170_prob=0.548,
            glicko_prob=0.636, whr_prob=0.575, betting_prob=0.374,
            tapology_method_a=TapologyMethodSplit(ko_pct=50, sub_pct=5, dec_pct=45),
            tapology_method_b=TapologyMethodSplit(ko_pct=31, sub_pct=8, dec_pct=61),
            age_a=35.6, age_b=27.0,
        ),
        FightContext(
            fighter_a="Jordan Leavitt", fighter_b="Yadier del Valle", weight_class="FW",
            tapology_prob=0.09, dratings_prob=0.225, elo_k170_prob=0.459,
            glicko_prob=0.40, whr_prob=0.42, betting_prob=0.239, elo_modified_prob=0.35,
            tapology_method_a=TapologyMethodSplit(ko_pct=10, sub_pct=50, dec_pct=40),
            tapology_method_b=TapologyMethodSplit(ko_pct=12, sub_pct=69, dec_pct=19),
            age_a=30.7, age_b=29.5,
        ),
    ]


def main():
    fights = build_fights()

    round_counts = {"R1": 0, "R2": 0, "R3": 0, "R4": 0, "DEC": 0}

    print("=" * 80)
    print("PREDICTION COMPARISON: OLD vs NEW ROUND LOGIC")
    print("=" * 80)

    for ctx in fights:
        result = predict_fight(ctx)
        round_counts[result.round] = round_counts.get(result.round, 0) + 1

        round_detail = result.reasoning["layer3_round"]
        print(f"\n{result.winner} vs {result.loser}")
        print(f"  Winner: {result.winner} ({result.confidence}% {result.confidence_tier})")
        print(f"  Method: {result.method} | Round: {result.round}")

        if result.method != "DEC":
            print(f"  Early finish profile: {round_detail.get('early_finish_profile', 'N/A')}%")
            print(f"    Base: {round_detail.get('base', 'N/A')}, "
                  f"Bonuses: {round_detail.get('total_bonus', 0)} "
                  f"(capped to {round_detail.get('capped_bonus', 0)})")
            if round_detail.get("bonuses"):
                for name, val in round_detail["bonuses"]:
                    print(f"      +{val}: {name}")

        if result.is_volatile:
            print(f"  VOLATILE: {', '.join(result.volatility_reasons)}")

    print("\n" + "=" * 80)
    print("ROUND DISTRIBUTION SUMMARY")
    print("=" * 80)
    total = len(fights)
    for rnd, count in sorted(round_counts.items()):
        pct = count / total * 100
        bar = "#" * int(pct / 2)
        print(f"  {rnd:>3}: {count:>2} ({pct:>5.1f}%) {bar}")

    finish_count = sum(v for k, v in round_counts.items() if k != "DEC")
    dec_count = round_counts.get("DEC", 0)
    print(f"\n  Finishes: {finish_count}/{total} ({finish_count/total*100:.0f}%)")
    print(f"  Decisions: {dec_count}/{total} ({dec_count/total*100:.0f}%)")


if __name__ == "__main__":
    main()
