import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

// TODO: Replace with actual API calls
const mockFighters = [
  {
    id: 1,
    name: 'Alex Pereira',
    division: 'Light Heavyweight',
    record: '9-2-0',
    rank: 1,
    nextFight: 'Magomed Ankalaev',
    event: 'UFC 313',
    winProbability: 0.70,
  },
  {
    id: 2,
    name: 'Magomed Ankalaev',
    division: 'Light Heavyweight',
    record: '18-1-1',
    rank: 2,
    nextFight: 'Alex Pereira',
    event: 'UFC 313',
    winProbability: 0.30,
  },
  {
    id: 3,
    name: 'Jalin Turner',
    division: 'Lightweight',
    record: '14-7-0',
    rank: 8,
    nextFight: 'Ignacio Bahamondes',
    event: 'UFC 313',
    winProbability: 0.90,
  },
];

const Fighters = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('all');

  // TODO: Replace with actual API calls
  const { data: fighters, isLoading, error } = useQuery({
    queryKey: ['fighters'],
    queryFn: () => Promise.resolve(mockFighters),
  });

  const divisions = ['all', 'Flyweight', 'Bantamweight', 'Featherweight', 'Lightweight', 'Welterweight', 'Middleweight', 'Light Heavyweight', 'Heavyweight', 'Women\'s Strawweight', 'Women\'s Flyweight', 'Women\'s Bantamweight', 'Women\'s Featherweight'];

  const filteredFighters = fighters?.filter(fighter => {
    const matchesSearch = fighter.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDivision = selectedDivision === 'all' || fighter.division === selectedDivision;
    return matchesSearch && matchesDivision;
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
        <div className="text-sm text-red-700">Error loading fighters</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Fighters</h1>
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search fighters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-10"
            />
          </div>
          <select
            value={selectedDivision}
            onChange={(e) => setSelectedDivision(e.target.value)}
            className="input"
          >
            {divisions.map((division) => (
              <option key={division} value={division}>
                {division === 'all' ? 'All Divisions' : division}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filteredFighters?.map((fighter) => (
          <div key={fighter.id} className="card">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-medium text-gray-900">{fighter.name}</h3>
                <p className="text-sm text-gray-500">{fighter.division}</p>
              </div>
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-primary-100 text-primary-800">
                #{fighter.rank}
              </span>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-500">Record</p>
              <p className="text-sm font-medium text-gray-900">{fighter.record}</p>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-500">Next Fight</p>
              <p className="text-sm font-medium text-gray-900">{fighter.nextFight}</p>
              <p className="text-sm text-gray-500">{fighter.event}</p>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Win Probability</span>
                <span className="text-sm font-medium text-gray-900">
                  {(fighter.winProbability * 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-1 h-2 bg-gray-200 rounded-full">
                <div
                  className="h-2 bg-primary-600 rounded-full"
                  style={{ width: `${fighter.winProbability * 100}%` }}
                />
              </div>
            </div>
            <div className="mt-4">
              <button className="btn btn-primary w-full">
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Fighters; 