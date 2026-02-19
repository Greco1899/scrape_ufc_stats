# Fantasy MMA with AI Recommendations

A modern Fantasy MMA platform that uses AI to help users make informed decisions about their fighter selections and team management.

## Features

- User Authentication & Authorization
- League Creation and Management
- Team Management
- AI-Powered Fighter Recommendations
- Real-time Fight Event Integration
- Advanced Scoring System
- Fighter Statistics and Analysis
- Social Features (comments, predictions sharing)

## Tech Stack

- **Backend**: FastAPI
- **Database**: PostgreSQL
- **Cache**: Redis
- **Task Queue**: Celery
- **AI/ML**: scikit-learn, XGBoost
- **Frontend**: React with TypeScript (separate repository)
- **API Documentation**: OpenAPI (Swagger)

## Project Structure

```
fantasy_mma/
├── alembic/              # Database migrations
├── app/
│   ├── api/             # API endpoints
│   ├── core/            # Core functionality
│   ├── db/              # Database models and sessions
│   ├── models/          # Pydantic models
│   ├── services/        # Business logic
│   │   └── ai/         # AI recommendation engine
│   ├── tasks/          # Celery tasks
│   └── utils/          # Utility functions
├── tests/              # Test suite
└── scripts/            # Utility scripts
```

## Setup Instructions

1. Create a virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Initialize the database:
```bash
alembic upgrade head
```

5. Run the development server:
```bash
uvicorn app.main:app --reload
```

## AI Recommendation System

The AI recommendation system uses multiple data points to provide intelligent suggestions:

1. Fighter Statistics
2. Historical Performance
3. Matchup Analysis
4. Recent Form
5. Weight Class Trends
6. User Preferences and History

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License 