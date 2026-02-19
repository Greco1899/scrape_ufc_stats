import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarIcon, ClockIcon, MapPinIcon } from '@heroicons/react/24/outline';

// Division finish rates for context display
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

interface FightData {
  id: number;
  redCorner: string;
  blueCorner: string;
  division: string;
  weightClass?: string;
  title: boolean;
  winProbability: number;
  method?: string;
  predictedRound?: string;
  confidence?: number;
  confidenceTier?: string;
  isVolatile?: boolean;
}

interface EventData {
  id: number;
  name: string;
  date: string;
  time: string;
  venue: string;
  location: string;
  status: string;
  fights: FightData[];
}

// TODO: Replace with actual API calls
const mockEvents: EventData[] = [
  {
    id: 1,
    name: 'UFC 313',
    date: '2025-03-08',
    time: '18:00',
    venue: 'T-Mobile Arena',
    location: 'Las Vegas, Nevada',
    status: 'upcoming',
    fights: [
      {
        id: 1,
        redCorner: 'Alex Pereira',
        blueCorner: 'Magomed Ankalaev',
        division: 'Light Heavyweight',
        weightClass: 'LHW',
        title: true,
        winProbability: 0.70,
        method: 'KO',
        predictedRound: 'R3',
        confidence: 70.0,
        confidenceTier: 'high',
        isVolatile: false,
      },
      {
        id: 2,
        redCorner: 'Jalin Turner',
        blueCorner: 'Ignacio Bahamondes',
        division: 'Lightweight',
        weightClass: 'LW',
        title: false,
        winProbability: 0.90,
        method: 'KO',
        predictedRound: 'R1',
        confidence: 90.0,
        confidenceTier: 'high',
        isVolatile: false,
      },
    ],
  },
  {
    id: 2,
    name: 'UFC Fight Night',
    date: '2025-03-15',
    time: '17:00',
    venue: 'APEX',
    location: 'Las Vegas, Nevada',
    status: 'upcoming',
    fights: [
      {
        id: 3,
        redCorner: 'Iasmin Lucindo',
        blueCorner: 'Amanda Lemos',
        division: "Women's Strawweight",
        weightClass: 'WSW',
        title: false,
        winProbability: 0.65,
        method: 'DEC',
        predictedRound: 'DEC',
        confidence: 65.0,
        confidenceTier: 'high',
        isVolatile: false,
      },
    ],
  },
];

function MethodBadge({ method }: { method?: string }) {
  if (!method) return null;
  const colors: Record<string, string> = {
    KO: 'bg-red-100 text-red-700 border-red-200',
    SUB: 'bg-blue-100 text-blue-700 border-blue-200',
    DEC: 'bg-gray-100 text-gray-700 border-gray-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[method] ?? colors.DEC}`}>
      {method}
    </span>
  );
}

function ConfidenceBadge({ tier }: { tier?: string }) {
  if (!tier) return null;
  const colors: Record<string, string> = {
    high: 'bg-green-100 text-green-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${colors[tier] ?? ''}`}>
      {tier}
    </span>
  );
}

const Events = () => {
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);

  // TODO: Replace with actual API calls
  const { data: events, isLoading, error } = useQuery({
    queryKey: ['events'],
    queryFn: () => Promise.resolve(mockEvents),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="text-sm text-red-700">Error loading events</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">UFC Events</h1>
        <Link to="/predictions" className="btn btn-primary text-sm">
          Full Prediction Engine
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {events?.map((event) => (
          <div key={event.id} className="card">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{event.name}</h2>
                <div className="mt-2 flex items-center text-sm text-gray-500">
                  <CalendarIcon className="h-5 w-5 mr-1" />
                  {event.date}
                </div>
                <div className="mt-1 flex items-center text-sm text-gray-500">
                  <ClockIcon className="h-5 w-5 mr-1" />
                  {event.time}
                </div>
                <div className="mt-1 flex items-center text-sm text-gray-500">
                  <MapPinIcon className="h-5 w-5 mr-1" />
                  {event.venue}
                </div>
                <div className="mt-1 text-sm text-gray-500 ml-6">
                  {event.location}
                </div>
              </div>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                event.status === 'upcoming'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {event.status}
              </span>
            </div>

            <div className="mt-6">
              <button
                onClick={() => setSelectedEvent(selectedEvent === event.id ? null : event.id)}
                className="btn btn-primary w-full"
              >
                {selectedEvent === event.id ? 'Hide Fight Card' : 'View Fight Card'}
              </button>
            </div>

            {selectedEvent === event.id && (
              <div className="mt-6 space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Fight Card</h3>
                {event.fights.map((fight) => {
                  const divRates = fight.weightClass ? DIVISION_FINISH_RATES[fight.weightClass] : null;
                  return (
                    <div key={fight.id} className={`border rounded-lg p-4 ${fight.isVolatile ? 'border-orange-300 bg-orange-50' : ''}`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {fight.redCorner} vs {fight.blueCorner}
                          </div>
                          <div className="text-sm text-gray-500">{fight.division}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {fight.title && (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                              Title Fight
                            </span>
                          )}
                          {fight.isVolatile && (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700 border border-orange-300">
                              VOLATILE
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Prediction Summary Row */}
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        {/* Win Probability */}
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Win Probability</span>
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-medium text-gray-900">
                                {(fight.winProbability * 100).toFixed(0)}%
                              </span>
                              <ConfidenceBadge tier={fight.confidenceTier} />
                            </div>
                          </div>
                          <div className="mt-1 h-2 bg-gray-200 rounded-full">
                            <div
                              className={`h-2 rounded-full ${
                                (fight.confidenceTier ?? '') === 'high' ? 'bg-green-500' :
                                (fight.confidenceTier ?? '') === 'medium' ? 'bg-yellow-500' : 'bg-primary-600'
                              }`}
                              style={{ width: `${fight.winProbability * 100}%` }}
                            />
                          </div>
                        </div>

                        {/* Method */}
                        <div className="text-center">
                          <span className="text-xs text-gray-500">Method</span>
                          <div className="mt-1">
                            <MethodBadge method={fight.method} />
                          </div>
                        </div>

                        {/* Round */}
                        <div className="text-right">
                          <span className="text-xs text-gray-500">Round</span>
                          <div className="mt-1 text-sm font-medium text-indigo-700">
                            {fight.predictedRound ?? '-'}
                          </div>
                        </div>
                      </div>

                      {/* Division Context */}
                      {divRates && (
                        <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                          <span>{fight.weightClass} historical:</span>
                          <span className="text-red-400">TKO {divRates.tko}%</span>
                          <span className="text-blue-400">SUB {divRates.sub}%</span>
                          <span>DEC {divRates.dec}%</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Events;
