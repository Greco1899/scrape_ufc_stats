# UFC Fight Prediction System

A machine learning-based system for predicting UFC fight outcomes with advanced analytics and external data integration from Fight Matrix and Tapology.

## Overview

This project uses historical UFC fight data to predict the outcomes of upcoming fights. It combines:

1. **Machine Learning Model**: An XGBoost classifier trained on physical attributes and fight statistics
2. **Advanced Fight Analysis**: Detailed breakdown of fighter matchups and fighting styles
3. **External Data Integration**: Incorporates betting odds and rating systems from Fight Matrix and Tapology
4. **Historical Evaluation**: Ability to test the model against past events to measure accuracy

## Features

- **Fight Outcome Prediction**: Predicts the winner with confidence level
- **Method of Victory**: Estimates probability of KO/TKO, submission, or decision
- **Fighter Statistics**: Analyzes height, reach, recent wins, losing streaks, striking and takedown metrics
- **Multi-Model Approach**: Combines machine learning with external rating systems (Elo, Glicko, WHR)
- **Upset Detection**: Flags potential upsets in close matchups
- **Historical Validation**: Tests model against past events to measure accuracy

## Installation

1. Clone the repository:
```
git clone https://github.com/yourusername/ufc-prediction.git
cd ufc-prediction
```

2. Create a virtual environment:
```
python -m venv .venv
```

3. Activate the virtual environment:
- Windows: `.venv\Scripts\activate`
- Unix/MacOS: `source .venv/bin/activate`

4. Install dependencies:
```
pip install -r requirements.txt
```

## Usage

### Predicting Upcoming Fights

```
python predict_ufc313.py
```

### Incorporating External Data

```
python predict_ufc313.py --event ufc-313
```

### Evaluating Past Events

```
python predict_ufc313.py --evaluate --past-event "UFC 300" --past-date "2024-04-13"
```

### Command Line Arguments

- `--event`: Event ID for scraping fresh data from Fight Matrix and Tapology
- `--no-scrape`: Disable web scraping and use cached data
- `--evaluate`: Evaluate model on a past event
- `--past-event`: Name of past event to evaluate (e.g., "UFC 300")
- `--past-date`: Date of past event in YYYY-MM-DD format

## Data Sources

The system uses several data sources:

1. **Historical UFC Fight Data**: Fight results, fighter statistics, and fight metrics
2. **Fight Matrix**: Multiple rating systems including Elo, Glicko, and WHR from [Fight Matrix](https://www.fightmatrix.com/)
3. **Tapology**: Betting odds and community predictions from [Tapology](https://www.tapology.com/)
4. **Physical Attributes**: Height, reach, and other physical measurements

## External Data Integration

The system integrates data from Fight Matrix and Tapology to improve prediction accuracy:

1. **Fight Matrix Models**:
   - Betting Odds: Implied probability from betting lines
   - Elo K170: Classic Elo rating system
   - Elo Modified: Modified Elo with fight-specific advantages
   - Glicko-1: Glicko rating system
   - WHR: Whole History Rating system

2. **Tapology Data**:
   - Betting odds
   - Community predictions

The final prediction is a weighted combination of our ML model and these external rating systems.

## Model Details

The prediction model is based on XGBoost and uses the following features:

- Height difference between fighters
- Reach difference between fighters
- Significant strike differential
- Takedown differential
- Submission attempt differential

Feature importance analysis shows that physical attributes (reach and height) are the strongest predictors of fight outcomes.

## Future Enhancements

- Web interface for predictions
- Round-by-round predictions
- Fighter style matchup analysis
- Automated data scraping for real-time updates
- Betting value calculator

## License

MIT License

## Acknowledgments

- UFC Stats for historical fight data
- Fight Matrix for their comprehensive rating systems
- Tapology for betting odds and community predictions
