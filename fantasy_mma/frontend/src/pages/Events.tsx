import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarIcon, ClockIcon, MapPinIcon } from '@heroicons/react/24/outline';

// TODO: Replace with actual API calls
const mockEvents = [
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
        title: true,
        winProbability: 0.70,
      },
      {
        id: 2,
        redCorner: 'Jalin Turner',
        blueCorner: 'Ignacio Bahamondes',
        division: 'Lightweight',
        title: false,
        winProbability: 0.90,
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
        division: 'Women\'s Strawweight',
        title: false,
        winProbability: 0.65,
      },
    ],
  },
];

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
      <h1 className="text-2xl font-bold text-gray-900">UFC Events</h1>

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
                onClick={() => setSelectedEvent(event.id)}
                className="btn btn-primary w-full"
              >
                View Fight Card
              </button>
            </div>

            {selectedEvent === event.id && (
              <div className="mt-6 space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Fight Card</h3>
                {event.fights.map((fight) => (
                  <div key={fight.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {fight.redCorner} vs {fight.blueCorner}
                        </div>
                        <div className="text-sm text-gray-500">{fight.division}</div>
                      </div>
                      {fight.title && (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                          Title Fight
                        </span>
                      )}
                    </div>
                    <div className="mt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Win Probability</span>
                        <span className="text-sm font-medium text-gray-900">
                          {(fight.winProbability * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-1 h-2 bg-gray-200 rounded-full">
                        <div
                          className="h-2 bg-primary-600 rounded-full"
                          style={{ width: `${fight.winProbability * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Events; 