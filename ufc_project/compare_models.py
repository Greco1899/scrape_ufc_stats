import pandas as pd
import numpy as np
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

# Load evaluation results
try:
    original_results = pd.read_csv("kape_almabayev_evaluation.csv")
    print("Original model results loaded")
    print(f"Accuracy: {original_results['correct'].mean():.2%}")
except:
    print("Original model results not found")
    original_results = None

try:
    enhanced_results = pd.read_csv("kape_almabayev_enhanced_evaluation.csv")
    print("Enhanced model results loaded")
    print(f"Accuracy: {enhanced_results['correct'].mean():.2%}")
except:
    print("Enhanced model results not found")
    enhanced_results = None

# Compare results if both are available
if original_results is not None and enhanced_results is not None:
    print("\nComparison of model performance:")
    
    # Merge results
    merged_results = pd.merge(
        original_results, 
        enhanced_results,
        on=["fighter1", "fighter2", "actual_winner"],
        suffixes=("_original", "_enhanced")
    )
    
    # Compare predictions
    print("\nFight-by-fight comparison:")
    for _, row in merged_results.iterrows():
        fighter1 = row["fighter1"]
        fighter2 = row["fighter2"]
        actual = row["actual_winner"]
        
        orig_pred = row["predicted_winner_original"]
        orig_prob = row["win_probability_original"]
        orig_correct = row["correct_original"]
        
        enh_pred = row["predicted_winner_enhanced"]
        enh_prob = row["win_probability_enhanced"]
        enh_correct = row["correct_enhanced"]
        
        print(f"\n{fighter1} vs {fighter2}")
        print(f"  Actual winner: {actual}")
        print(f"  Original model: {orig_pred} ({orig_prob:.2%}) - {'✓' if orig_correct else '✗'}")
        print(f"  Enhanced model: {enh_pred} ({enh_prob:.2%}) - {'✓' if enh_correct else '✗'}")
    
    # Calculate improvement
    orig_accuracy = original_results["correct"].mean()
    enh_accuracy = enhanced_results["correct"].mean()
    improvement = (enh_accuracy - orig_accuracy) * 100
    
    print(f"\nAccuracy improvement: {improvement:.2f} percentage points")
    
    # Compare confidence levels
    orig_avg_conf = original_results["win_probability"].mean()
    enh_avg_conf = enhanced_results["win_probability"].mean()
    
    print(f"Average confidence (original): {orig_avg_conf:.2%}")
    print(f"Average confidence (enhanced): {enh_avg_conf:.2%}")
    
    # Check if enhanced model is more confident on correct predictions
    orig_correct_conf = original_results[original_results["correct"]]["win_probability"].mean()
    enh_correct_conf = enhanced_results[enhanced_results["correct"]]["win_probability"].mean()
    
    print(f"Average confidence on correct predictions (original): {orig_correct_conf:.2%}")
    print(f"Average confidence on correct predictions (enhanced): {enh_correct_conf:.2%}")
    
    # Check if enhanced model is less confident on incorrect predictions
    if not original_results[~original_results["correct"]].empty:
        orig_incorrect_conf = original_results[~original_results["correct"]]["win_probability"].mean()
        print(f"Average confidence on incorrect predictions (original): {orig_incorrect_conf:.2%}")
    else:
        print("No incorrect predictions in original model")
    
    if not enhanced_results[~enhanced_results["correct"]].empty:
        enh_incorrect_conf = enhanced_results[~enhanced_results["correct"]]["win_probability"].mean()
        print(f"Average confidence on incorrect predictions (enhanced): {enh_incorrect_conf:.2%}")
    else:
        print("No incorrect predictions in enhanced model")
else:
    print("\nCannot compare models - one or both result files missing")

# Analyze original model results if available
if original_results is not None:
    print("\nOriginal model analysis:")
    correct_count = original_results["correct"].sum()
    total_count = len(original_results)
    print(f"Accuracy: {correct_count}/{total_count} = {correct_count/total_count:.2%}")
    
    # Analyze confidence distribution
    print("\nConfidence distribution:")
    bins = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
    bin_labels = ["50-60%", "60-70%", "70-80%", "80-90%", "90-100%"]
    
    counts, _ = np.histogram(original_results["win_probability"], bins=bins)
    for i, count in enumerate(counts):
        print(f"  {bin_labels[i]}: {count} predictions")
    
    # Analyze correct vs incorrect predictions by confidence
    for i in range(len(bins)-1):
        mask = (original_results["win_probability"] >= bins[i]) & (original_results["win_probability"] < bins[i+1])
        if sum(mask) > 0:
            correct_in_bin = original_results[mask]["correct"].sum()
            total_in_bin = sum(mask)
            print(f"  Accuracy in {bin_labels[i]}: {correct_in_bin}/{total_in_bin} = {correct_in_bin/total_in_bin:.2%}")

print("\nAnalysis complete") 