from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import List, Optional
import uvicorn

from app.models.database import Base
from app.services.ai.recommendation import FighterRecommendationService
from app.db.session import engine, get_db
from app.models import database as models
from app.core import security

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Fantasy MMA API",
    description="API for Fantasy MMA with AI-powered recommendations",
    version="1.0.0"
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Authentication routes
@app.post("/token")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = security.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = security.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

# User routes
@app.post("/users/", response_model=models.User)
def create_user(user: models.User, db: Session = Depends(get_db)):
    db_user = security.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    return security.create_user(db=db, user=user)

# League routes
@app.post("/leagues/", response_model=models.League)
def create_league(
    league: models.League,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    return db.query(models.League).filter(models.League.id == league.id).first()

@app.get("/leagues/", response_model=List[models.League])
def get_leagues(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    return db.query(models.League).offset(skip).limit(limit).all()

# Team routes
@app.post("/teams/", response_model=models.Team)
def create_team(
    team: models.Team,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    db_team = models.Team(**team.dict(), owner_id=current_user.id)
    db.add(db_team)
    db.commit()
    db.refresh(db_team)
    return db_team

@app.get("/teams/", response_model=List[models.Team])
def get_teams(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    return db.query(models.Team).filter(models.Team.owner_id == current_user.id).offset(skip).limit(limit).all()

# Fighter routes
@app.get("/fighters/", response_model=List[models.Fighter])
def get_fighters(
    weight_class: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(models.Fighter)
    if weight_class:
        query = query.filter(models.Fighter.weight_class == weight_class)
    return query.offset(skip).limit(limit).all()

# AI Recommendation routes
@app.get("/recommendations/fighters/")
def get_fighter_recommendations(
    weight_class: Optional[str] = None,
    max_recommendations: int = 5,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(security.get_current_user)
):
    recommendation_service = FighterRecommendationService(db)
    return recommendation_service.get_fighter_recommendations(
        user=current_user,
        weight_class=weight_class,
        max_recommendations=max_recommendations
    )

@app.get("/predictions/fight/")
def predict_fight(
    fighter1_id: int,
    fighter2_id: int,
    db: Session = Depends(get_db)
):
    fighter1 = db.query(models.Fighter).filter(models.Fighter.id == fighter1_id).first()
    fighter2 = db.query(models.Fighter).filter(models.Fighter.id == fighter2_id).first()
    
    if not fighter1 or not fighter2:
        raise HTTPException(status_code=404, detail="Fighter not found")
    
    recommendation_service = FighterRecommendationService(db)
    return recommendation_service.predict_fight(fighter1, fighter2)

# Event routes
@app.get("/events/", response_model=List[models.Event])
def get_events(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    return db.query(models.Event).offset(skip).limit(limit).all()

@app.get("/events/{event_id}/fights", response_model=List[models.Fight])
def get_event_fights(
    event_id: int,
    db: Session = Depends(get_db)
):
    return db.query(models.Fight).filter(models.Fight.event_id == event_id).all()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000) 