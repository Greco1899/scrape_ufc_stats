from typing import List, Dict, Optional
import numpy as np
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier
from app.models.database import Fighter, Fight, Prediction, User
from sqlalchemy.orm import Session

class FighterRecommendationService:
    def __init__(self, db: Session):
        self.db = db
        self.model = XGBClassifier(
            n_estimators=100,
            learning_rate=0.1,
            max_depth=5,
            random_state=42
        )
        self.scaler = StandardScaler()
        
    def _get_fighter_features(self, fighter: Fighter) -> np.ndarray:
        """Extract numerical features from a fighter."""
        features = [
            fighter.height,
            fighter.reach,
            fighter.wins,
            fighter.losses,
            fighter.draws,
            fighter.strikes_landed_per_min,
            fighter.strike_accuracy,
            fighter.strikes_absorbed_per_min,
            fighter.strike_defense,
            fighter.takedown_avg,
            fighter.takedown_accuracy,
            fighter.takedown_defense,
            fighter.submission_avg
        ]
        return np.array(features)
    
    def _get_matchup_features(self, fighter1: Fighter, fighter2: Fighter) -> np.ndarray:
        """Create features representing the matchup between two fighters."""
        f1_features = self._get_fighter_features(fighter1)
        f2_features = self._get_fighter_features(fighter2)
        
        # Calculate differences and ratios
        diff_features = f1_features - f2_features
        ratio_features = np.where(f2_features != 0, f1_features / f2_features, 0)
        
        return np.concatenate([diff_features, ratio_features])
    
    def train_model(self):
        """Train the prediction model using historical fight data."""
        # Get all completed fights
        fights = self.db.query(Fight).filter(Fight.winner_id.isnot(None)).all()
        
        X = []  # Features
        y = []  # Labels
        
        for fight in fights:
            # Get matchup features
            features = self._get_matchup_features(fight.fighter1, fight.fighter2)
            X.append(features)
            
            # Label is 1 if fighter1 won, 0 if fighter2 won
            y.append(1 if fight.winner_id == fight.fighter1_id else 0)
        
        X = np.array(X)
        y = np.array(y)
        
        # Scale features
        X = self.scaler.fit_transform(X)
        
        # Train model
        self.model.fit(X, y)
    
    def predict_fight(self, fighter1: Fighter, fighter2: Fighter) -> Dict:
        """Predict the outcome of a fight between two fighters."""
        features = self._get_matchup_features(fighter1, fighter2)
        scaled_features = self.scaler.transform(features.reshape(1, -1))
        
        # Get win probability for fighter1
        prob = self.model.predict_proba(scaled_features)[0][1]
        
        return {
            "fighter1_win_probability": float(prob),
            "fighter2_win_probability": float(1 - prob)
        }
    
    def get_fighter_recommendations(
        self,
        user: User,
        weight_class: Optional[str] = None,
        budget: Optional[float] = None,
        max_recommendations: int = 5
    ) -> List[Dict]:
        """Get personalized fighter recommendations for a user."""
        # Get all available fighters
        query = self.db.query(Fighter)
        if weight_class:
            query = query.filter(Fighter.weight_class == weight_class)
        fighters = query.all()
        
        recommendations = []
        for fighter in fighters:
            score = self._calculate_recommendation_score(fighter, user)
            if score > 0:
                recommendations.append({
                    "fighter": fighter,
                    "score": score,
                    "reasons": self._get_recommendation_reasons(fighter, user)
                })
        
        # Sort by score and return top recommendations
        recommendations.sort(key=lambda x: x["score"], reverse=True)
        return recommendations[:max_recommendations]
    
    def _calculate_recommendation_score(self, fighter: Fighter, user: User) -> float:
        """Calculate a recommendation score for a fighter based on various factors."""
        score = 0.0
        
        # Recent performance (wins in last 3 fights)
        recent_fights = self.db.query(Fight).filter(
            ((Fight.fighter1_id == fighter.id) | (Fight.fighter2_id == fighter.id))
        ).order_by(Fight.date.desc()).limit(3).all()
        
        wins = sum(1 for fight in recent_fights if fight.winner_id == fighter.id)
        score += wins * 0.2
        
        # User's success with similar fighters
        user_predictions = self.db.query(Prediction).filter(
            Prediction.user_id == user.id,
            Prediction.points_earned > 0
        ).all()
        
        for pred in user_predictions:
            if pred.fighter.weight_class == fighter.weight_class:
                score += 0.1
        
        # Fighter's finishing rate
        total_fights = fighter.wins + fighter.losses
        if total_fights > 0:
            finish_rate = (
                fighter.wins - 
                self.db.query(Fight).filter(
                    Fight.winner_id == fighter.id,
                    Fight.method == "Decision"
                ).count()
            ) / total_fights
            score += finish_rate * 0.3
        
        return score
    
    def _get_recommendation_reasons(self, fighter: Fighter, user: User) -> List[str]:
        """Get human-readable reasons for recommending a fighter."""
        reasons = []
        
        # Recent performance
        recent_fights = self.db.query(Fight).filter(
            ((Fight.fighter1_id == fighter.id) | (Fight.fighter2_id == fighter.id))
        ).order_by(Fight.date.desc()).limit(3).all()
        
        wins = sum(1 for fight in recent_fights if fight.winner_id == fighter.id)
        if wins >= 2:
            reasons.append(f"Won {wins} of last 3 fights")
        
        # Finishing ability
        total_fights = fighter.wins + fighter.losses
        if total_fights > 0:
            finishes = fighter.wins - self.db.query(Fight).filter(
                Fight.winner_id == fighter.id,
                Fight.method == "Decision"
            ).count()
            if finishes / total_fights > 0.7:
                reasons.append("High finishing rate")
        
        # Statistical strengths
        if fighter.strike_accuracy > 0.5:
            reasons.append("Above average striking accuracy")
        if fighter.takedown_defense > 0.7:
            reasons.append("Strong takedown defense")
        if fighter.submission_avg > 1.0:
            reasons.append("Active submission game")
        
        return reasons 