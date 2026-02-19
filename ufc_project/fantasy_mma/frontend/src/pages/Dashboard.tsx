import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChartBarIcon, CalendarIcon, TrophyIcon, UserGroupIcon } from '@heroicons/react/24/outline';

// TODO: Replace with actual API calls
const mockData = {
  userStats: {
    totalPoints: 1250,
    rank: 3,
    leagues: 2,
    activeEvents: 1,
  },
  upcomingEvents: [
    {
      id: 1,
      name: 'UFC 313',
      date: '2025-03-08',
      fights: 12,
      status: 'upcoming',
    },
    {
      id: 2,
      name: 'UFC Fight Night',
      date: '2025-03-15',
      fights: 10,
      status: 'upcoming',
    },
  ],
  recentPerformance: [
    { event: 'UFC 312', points: 150 },
    { event: 'UFC Fight Night', points: 120 },
    { event: 'UFC 311', points: 180 },
  ],
};

const Dashboard = () => {
  // TODO: Replace with actual API calls
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => Promise.resolve(mockData),
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
        <div className="text-sm text-red-700">Error loading dashboard data</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ChartBarIcon className="h-6 w-6 text-primary-600" />
            </div>
            <div className="ml-5">
              <div className="text-sm font-medium text-gray-500">Total Points</div>
              <div className="text-2xl font-semibold text-gray-900">{data?.userStats.totalPoints}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <TrophyIcon className="h-6 w-6 text-primary-600" />
            </div>
            <div className="ml-5">
              <div className="text-sm font-medium text-gray-500">Rank</div>
              <div className="text-2xl font-semibold text-gray-900">#{data?.userStats.rank}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <UserGroupIcon className="h-6 w-6 text-primary-600" />
            </div>
            <div className="ml-5">
              <div className="text-sm font-medium text-gray-500">Leagues</div>
              <div className="text-2xl font-semibold text-gray-900">{data?.userStats.leagues}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CalendarIcon className="h-6 w-6 text-primary-600" />
            </div>
            <div className="ml-5">
              <div className="text-sm font-medium text-gray-500">Active Events</div>
              <div className="text-2xl font-semibold text-gray-900">{data?.userStats.activeEvents}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Upcoming Events</h3>
          <div className="space-y-4">
            {data?.upcomingEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">{event.name}</h4>
                  <p className="text-sm text-gray-500">{event.date}</p>
                </div>
                <div className="text-sm text-gray-500">{event.fights} fights</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Performance</h3>
          <div className="space-y-4">
            {data?.recentPerformance.map((performance, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="text-sm font-medium text-gray-900">{performance.event}</div>
                <div className="text-sm text-gray-500">{performance.points} points</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 