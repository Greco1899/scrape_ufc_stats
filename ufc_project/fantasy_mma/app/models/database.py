from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Float, DateTime, Table
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

# Association tables for many-to-many relationships
league_users = Table('league_users',
    Base.metadata,
    Column('league_id', Integer, ForeignKey('leagues.id')),
    Column('user_id', Integer, ForeignKey('users.id'))
)

team_fighters = Table('team_fighters',
    Base.metadata,
    Column('team_id', Integer, ForeignKey('teams.id')),
    Column('fighter_id', Integer, ForeignKey('fighters.id'))
)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    
    # Relationships
    teams = relationship("Team", back_populates="owner")
    leagues = relationship("League", secondary=league_users, back_populates="users")
    predictions = relationship("Prediction", back_populates="user")

class League(Base):
    __tablename__ = "leagues"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String)
    max_teams = Column(Integer, default=10)
    is_private = Column(Boolean, default=False)
    created_at = Column(DateTime)
    
    # Relationships
    users = relationship("User", secondary=league_users, back_populates="leagues")
    teams = relationship("Team", back_populates="league")

class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    league_id = Column(Integer, ForeignKey("leagues.id"))
    points = Column(Float, default=0.0)
    
    # Relationships
    owner = relationship("User", back_populates="teams")
    league = relationship("League", back_populates="teams")
    fighters = relationship("Fighter", secondary=team_fighters, back_populates="teams")

class Fighter(Base):
    __tablename__ = "fighters"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    nickname = Column(String)
    weight_class = Column(String)
    height = Column(Float)
    reach = Column(Float)
    stance = Column(String)
    wins = Column(Integer)
    losses = Column(Integer)
    draws = Column(Integer)
    
    # Stats
    strikes_landed_per_min = Column(Float)
    strike_accuracy = Column(Float)
    strikes_absorbed_per_min = Column(Float)
    strike_defense = Column(Float)
    takedown_avg = Column(Float)
    takedown_accuracy = Column(Float)
    takedown_defense = Column(Float)
    submission_avg = Column(Float)
    
    # Relationships
    teams = relationship("Team", secondary=team_fighters, back_populates="fighters")
    predictions = relationship("Prediction", back_populates="fighter")

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    date = Column(DateTime)
    location = Column(String)
    
    # Relationships
    fights = relationship("Fight", back_populates="event")

class Fight(Base):
    __tablename__ = "fights"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"))
    fighter1_id = Column(Integer, ForeignKey("fighters.id"))
    fighter2_id = Column(Integer, ForeignKey("fighters.id"))
    weight_class = Column(String)
    is_title_fight = Column(Boolean, default=False)
    winner_id = Column(Integer, ForeignKey("fighters.id"), nullable=True)
    method = Column(String)
    round = Column(Integer)
    time = Column(String)
    
    # Relationships
    event = relationship("Event", back_populates="fights")
    fighter1 = relationship("Fighter", foreign_keys=[fighter1_id])
    fighter2 = relationship("Fighter", foreign_keys=[fighter2_id])
    winner = relationship("Fighter", foreign_keys=[winner_id])
    predictions = relationship("Prediction", back_populates="fight")

class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    fight_id = Column(Integer, ForeignKey("fights.id"))
    fighter_id = Column(Integer, ForeignKey("fighters.id"))
    confidence = Column(Float)
    points_earned = Column(Float, default=0.0)
    created_at = Column(DateTime)
    
    # Relationships
    user = relationship("User", back_populates="predictions")
    fight = relationship("Fight", back_populates="predictions")
    fighter = relationship("Fighter", back_populates="predictions") 